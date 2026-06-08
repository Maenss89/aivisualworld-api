const express = require('express');
const fetch   = require('node-fetch');
const auth    = require('../middleware/auth');
const router  = express.Router();

// ── MODEL DEFINITIONS ─────────────────────────────────────────────────────────
// tier:    basic (1cr) | standard (2cr) | premium (3-4cr) | ultra (5cr)
// minPlan: free | starter | pro
const MODELS = {
  'gpt-4o-mini': {
    name:        'GPT-4o Mini',
    provider:    'openai',
    creditCost:  1,
    tier:        'basic',
    minPlan:     'free',
    description: 'Fast & affordable — great for everyday questions',
    badge:       '⚡ Basic',
  },
  'deepseek-chat': {
    name:        'DeepSeek V3',
    provider:    'deepseek',
    creditCost:  1,
    tier:        'basic',
    minPlan:     'free',
    description: 'Smart open-source model — fast and capable',
    badge:       '⚡ Basic',
  },
  'gpt-4o': {
    name:        'GPT-4o',
    provider:    'openai',
    creditCost:  2,
    tier:        'standard',
    minPlan:     'starter',
    description: "OpenAI's flagship — powerful reasoning and creativity",
    badge:       '⭐ Standard',
  },
  'claude-3-5-sonnet-20241022': {
    name:        'Claude 3.5 Sonnet',
    provider:    'anthropic',
    creditCost:  2,
    tier:        'standard',
    minPlan:     'starter',
    description: "Anthropic's best everyday model — clear and precise",
    badge:       '⭐ Standard',
  },
  'gemini-1.5-pro': {
    name:        'Gemini 1.5 Pro',
    provider:    'google',
    creditCost:  2,
    tier:        'standard',
    minPlan:     'starter',
    description: "Google's pro model — great for analysis and long docs",
    badge:       '⭐ Standard',
  },
  'claude-3-opus-20240229': {
    name:        'Claude 3 Opus',
    provider:    'anthropic',
    creditCost:  4,
    tier:        'premium',
    minPlan:     'pro',
    description: "Anthropic's most powerful — best for complex deep thinking",
    badge:       '💎 Premium',
  },
  'gpt-4-5-preview': {
    name:        'GPT-4.5',
    provider:    'openai',
    creditCost:  3,
    tier:        'premium',
    minPlan:     'pro',
    description: "OpenAI's latest advanced model — cutting-edge capabilities",
    badge:       '💎 Premium',
  },
};

const PLAN_LEVEL = { free: 0, starter: 1, pro: 2 };

// ── GET /api/chat/models ──────────────────────────────────────────────────────
router.get('/models', auth, (req, res) => {
  const userLevel = PLAN_LEVEL[req.user.plan] ?? 0;
  const models = Object.entries(MODELS).map(([id, m]) => ({
    id,
    name:        m.name,
    provider:    m.provider,
    creditCost:  m.creditCost,
    tier:        m.tier,
    minPlan:     m.minPlan,
    description: m.description,
    badge:       m.badge,
    available:   userLevel >= (PLAN_LEVEL[m.minPlan] ?? 0),
  }));
  res.json({ models, userPlan: req.user.plan, userCredits: req.user.credits });
});

// ── PROVIDER HELPERS ──────────────────────────────────────────────────────────
async function callOpenAI(modelId, messages, apiKey, baseUrl = 'https://api.openai.com/v1') {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: modelId, messages, max_tokens: 2000, temperature: 0.7 }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error?.message || `OpenAI error (${res.status})`); }
  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error('No response from model');
  return reply;
}

async function callAnthropic(modelId, messages, apiKey) {
  // Anthropic uses separate system param + messages array without system role
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMsgs  = messages.filter(m => m.role !== 'system');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      modelId,
      max_tokens: 2000,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages:   chatMsgs,
    }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error?.message || `Anthropic error (${res.status})`); }
  const data  = await res.json();
  const reply = data.content?.[0]?.text;
  if (!reply) throw new Error('No response from Claude');
  return reply;
}

async function callGemini(messages, apiKey) {
  // Gemini uses 'user'/'model' roles and a contents array
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 2000, temperature: 0.7 } }),
    }
  );
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error?.message || `Gemini error (${res.status})`); }
  const data  = await res.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error('No response from Gemini');
  return reply;
}

// ── POST /api/chat ────────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { modelId, messages } = req.body;

    if (!modelId || !Array.isArray(messages) || messages.length === 0)
      return res.status(400).json({ error: 'modelId and messages[] are required' });

    const model = MODELS[modelId];
    if (!model) return res.status(400).json({ error: `Unknown model: ${modelId}` });

    const user      = req.user;
    const userLevel = PLAN_LEVEL[user.plan] ?? 0;
    const reqLevel  = PLAN_LEVEL[model.minPlan] ?? 0;

    if (userLevel < reqLevel)
      return res.status(403).json({ error: `${model.name} requires the ${model.minPlan} plan or higher. Upgrade to unlock it.` });

    if (user.credits < model.creditCost)
      return res.status(402).json({ error: `Not enough credits. ${model.name} costs ${model.creditCost} credits per message. You have ${user.credits}.` });

    let reply;
    switch (model.provider) {
      case 'openai':
        if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI API key not configured on server');
        reply = await callOpenAI(modelId, messages, process.env.OPENAI_API_KEY);
        break;
      case 'deepseek':
        if (!process.env.DEEPSEEK_API_KEY) throw new Error('DeepSeek API key not configured on server');
        reply = await callOpenAI(modelId, messages, process.env.DEEPSEEK_API_KEY, 'https://api.deepseek.com/v1');
        break;
      case 'anthropic':
        if (!process.env.ANTHROPIC_API_KEY) throw new Error('Anthropic API key not configured on server');
        reply = await callAnthropic(modelId, messages, process.env.ANTHROPIC_API_KEY);
        break;
      case 'google':
        if (!process.env.GOOGLE_AI_API_KEY) throw new Error('Google AI API key not configured on server');
        reply = await callGemini(messages, process.env.GOOGLE_AI_API_KEY);
        break;
      default:
        throw new Error('Unknown provider');
    }

    // Deduct credits
    user.credits -= model.creditCost;
    await user.save();

    res.json({
      reply,
      model:            { id: modelId, name: model.name },
      creditsUsed:      model.creditCost,
      creditsRemaining: user.credits,
    });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message || 'Chat failed. Please try again.' });
  }
});

module.exports = router;
