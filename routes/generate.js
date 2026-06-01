const express    = require('express');
const fetch      = require('node-fetch');
const auth       = require('../middleware/auth');
const Generation = require('../models/Generation');
const router     = express.Router();

const COSTS = { image: 5, video: 20 };

async function generateWithStability(prompt, negPrompt, size, style) {
  const [w, h] = (size || '1024x1024').split('x').map(Number);
  const res = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${process.env.STABILITY_API_KEY}` },
    body: JSON.stringify({
      text_prompts: [{ text: prompt, weight: 1 }, ...(negPrompt ? [{ text: negPrompt, weight: -1 }] : [])],
      cfg_scale: 7, width: Math.min(w, 1344), height: Math.min(h, 1344), steps: 30, samples: 1, style_preset: style || 'photographic',
    }),
  });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.message || `Stability AI error (${res.status})`); }
  const data = await res.json();
  const b64  = data.artifacts?.[0]?.base64;
  if (!b64) throw new Error('No image returned from Stability AI');
  return `data:image/png;base64,${b64}`;
}

async function generateWithOpenAI(prompt, size) {
  const sizeMap = { '1024x1024':'1024x1024', '1792x1024':'1792x1024', '1024x1792':'1024x1792', '512x512':'1024x1024' };
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: sizeMap[size] || '1024x1024', quality: 'standard' }),
  });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error?.message || `OpenAI error (${res.status})`); }
  const data = await res.json();
  return data.data?.[0]?.url;
}

async function generateWithHuggingFace(prompt) {
  const res = await fetch('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}` },
    body: JSON.stringify({ inputs: prompt }),
  });
  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error || `HuggingFace error (${res.status})`); }
  const buffer = await res.buffer();
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

// POST /api/generate/image
router.post('/image', auth, async (req, res) => {
  try {
    const { prompt, negPrompt, providerId, size, style } = req.body;
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'Prompt is required' });
    const user = req.user;
    const cost = COSTS.image;
    if (user.credits < cost) return res.status(402).json({ error: `Not enough credits. You need ${cost} but have ${user.credits}.` });

    let imageUrl;
    const provider = providerId || 'huggingface';
    if (provider === 'stability') {
      if (!process.env.STABILITY_API_KEY) throw new Error('Stability AI key not configured');
      imageUrl = await generateWithStability(prompt, negPrompt, size, style);
    } else if (provider === 'openai') {
      if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI key not configured');
      imageUrl = await generateWithOpenAI(prompt, size);
    } else {
      imageUrl = await generateWithHuggingFace(prompt);
    }

    user.credits -= cost;
    user.totalGenerations += 1;
    await user.save();

    const gen = await Generation.create({ userId: user._id, type: 'image', prompt, negPrompt, providerId: provider, size, style, imageUrl, creditsUsed: cost });
    res.json({ images: [{ url: imageUrl, id: gen._id }], creditsUsed: cost, creditsRemaining: user.credits });
  } catch (err) {
    console.error('Generate error:', err.message);
    res.status(500).json({ error: err.message || 'Generation failed' });
  }
});

// GET /api/generate/history
router.get('/history', auth, async (req, res) => {
  try {
    const type  = req.query.type;
    const limit = Math.min(parseInt(req.query.limit) || 12, 50);
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const skip  = (page - 1) * limit;
    const filter = { userId: req.user._id };
    if (type) filter.type = type;
    const [items, total] = await Promise.all([
      Generation.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Generation.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/generate/:id/publish
router.patch('/:id/publish', auth, async (req, res) => {
  try {
    const gen = await Generation.findOne({ _id: req.params.id, userId: req.user._id });
    if (!gen) return res.status(404).json({ error: 'Not found' });
    gen.public = !gen.public;
    await gen.save();
    res.json({ public: gen.public });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
