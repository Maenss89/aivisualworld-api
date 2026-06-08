const express = require('express');
const fetch   = require('node-fetch');
const auth    = require('../middleware/auth');
const User    = require('../models/User');
const router  = express.Router();

// ── STRIPE SETUP ──────────────────────────────────────────────────────────────
let stripe;
try { stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); } catch(e) {}

// ── PLAN DEFINITIONS ──────────────────────────────────────────────────────────
const PLANS = {
  starter: {
    name:          'Starter',
    price:         14,
    credits:       150,
    stripePriceId: process.env.STRIPE_PRICE_STARTER,
    paypalAmount:  '14.00',
  },
  pro: {
    name:          'Pro',
    price:         25,
    credits:       350,
    stripePriceId: process.env.STRIPE_PRICE_PRO,
    paypalAmount:  '25.00',
  },
};

router.get('/plans', (req, res) => res.json({ plans: PLANS }));

// ── STRIPE CHECKOUT ───────────────────────────────────────────────────────────
router.post('/checkout', auth, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Stripe not configured. Add STRIPE_SECRET_KEY to Render environment.' });
    const { planId } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: 'Invalid plan. Use: starter or pro' });
    if (!plan.stripePriceId) return res.status(503).json({ error: `Stripe price ID not set for ${planId}. Add STRIPE_PRICE_${planId.toUpperCase()} to Render environment.` });

    const user = req.user;
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.username });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const session = await stripe.checkout.sessions.create({
      customer:   customerId,
      mode:       'subscription',
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/dashboard.html?subscription=success`,
      cancel_url:  `${process.env.FRONTEND_URL}/upgrade.html?subscription=cancelled`,
      metadata:    { userId: user._id.toString(), planId },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── STRIPE WEBHOOK ────────────────────────────────────────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).json({ error: 'Webhook verification failed' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, planId } = session.metadata || {};
    if (userId && planId && PLANS[planId]) {
      const user = await User.findById(userId);
      if (user) {
        user.plan                 = planId;
        user.stripeSubscriptionId = session.subscription;
        user.credits             += PLANS[planId].credits;
        user.planExpiresAt        = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
        await user.save();
        console.log(`✅ Stripe: ${user.email} upgraded to ${planId}`);
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const user = await User.findOne({ stripeSubscriptionId: event.data.object.id });
    if (user) {
      user.plan = 'free';
      user.stripeSubscriptionId = null;
      await user.save();
    }
  }

  res.json({ received: true });
});

// ── STRIPE CANCEL ─────────────────────────────────────────────────────────────
router.post('/cancel', auth, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
    if (!req.user.stripeSubscriptionId) return res.status(400).json({ error: 'No active subscription' });
    await stripe.subscriptions.cancel(req.user.stripeSubscriptionId);
    req.user.plan = 'free';
    req.user.stripeSubscriptionId = null;
    await req.user.save();
    res.json({ message: 'Subscription cancelled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── STRIPE BILLING PORTAL ─────────────────────────────────────────────────────
router.get('/portal', auth, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
    if (!req.user.stripeCustomerId) return res.status(400).json({ error: 'No billing account found' });
    const session = await stripe.billingPortal.sessions.create({
      customer:   req.user.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard.html`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PAYPAL HELPER: GET ACCESS TOKEN ──────────────────────────────────────────
async function getPayPalToken() {
  const base = process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
      ).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Could not get PayPal access token');
  return { token: data.access_token, base };
}

// ── PAYPAL CREATE ORDER ───────────────────────────────────────────────────────
router.post('/paypal/create-order', auth, async (req, res) => {
  try {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET)
      return res.status(503).json({ error: 'PayPal not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to Render environment.' });

    const { planId } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });

    const { token, base } = await getPayPalToken();

    const response = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount:      { currency_code: 'USD', value: plan.paypalAmount },
          description: `AIVisualWorld ${plan.name} Plan — ${plan.credits} credits/month`,
          custom_id:   `${req.user._id}|${planId}`,
        }],
        application_context: {
          brand_name:  'AIVisualWorld',
          user_action: 'PAY_NOW',
          return_url:  `${process.env.FRONTEND_URL}/dashboard.html?subscription=success`,
          cancel_url:  `${process.env.FRONTEND_URL}/upgrade.html?subscription=cancelled`,
        },
      }),
    });

    const orderData = await response.json();
    if (!orderData.id) throw new Error(orderData.message || 'Failed to create PayPal order');
    res.json({ id: orderData.id });
  } catch (err) {
    console.error('PayPal create order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PAYPAL CAPTURE ORDER ──────────────────────────────────────────────────────
router.post('/paypal/capture-order', auth, async (req, res) => {
  try {
    const { orderId, planId } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });

    const { token, base } = await getPayPalToken();

    const response = await fetch(`${base}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const captureData = await response.json();
    if (captureData.status !== 'COMPLETED')
      throw new Error('Payment not completed. Status: ' + captureData.status);

    // Grant credits and upgrade plan
    const user = req.user;
    user.plan          = planId;
    user.credits      += plan.credits;
    user.planExpiresAt = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    await user.save();

    console.log(`✅ PayPal: ${user.email} upgraded to ${planId}`);
    res.json({ success: true, plan: planId, creditsAdded: plan.credits });
  } catch (err) {
    console.error('PayPal capture error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
