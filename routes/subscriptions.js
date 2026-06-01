const express = require('express');
const auth    = require('../middleware/auth');
const User    = require('../models/User');
const router  = express.Router();

let stripe;
try { stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); } catch(e) {}

const PLANS = {
  basic:       { name: 'Basic',       price: 2,  credits: 600,   priceId: process.env.STRIPE_PRICE_BASIC },
  creator_pro: { name: 'Creator Pro', price: 19, credits: 3000,  priceId: process.env.STRIPE_PRICE_PRO   },
  studio:      { name: 'Studio',      price: 49, credits: 10000, priceId: process.env.STRIPE_PRICE_STUDIO },
};

router.get('/plans', (req, res) => res.json({ plans: PLANS }));

router.post('/checkout', auth, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Payment system not configured' });
    const { planId } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });
    const user = req.user;
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.username });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }
    const session = await stripe.checkout.sessions.create({
      customer: customerId, mode: 'subscription',
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/dashboard.html?subscription=success`,
      cancel_url:  `${process.env.FRONTEND_URL}/pricing.html?subscription=cancelled`,
      metadata: { userId: user._id.toString(), planId },
    });
    res.json({ url: session.url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
  catch (err) { return res.status(400).json({ error: 'Webhook verification failed' }); }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, planId } = session.metadata || {};
    if (userId && planId && PLANS[planId]) {
      const user = await User.findById(userId);
      if (user) {
        user.plan = planId;
        user.stripeSubscriptionId = session.subscription;
        user.credits += PLANS[planId].credits;
        user.planExpiresAt = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
        await user.save();
      }
    }
  }
  if (event.type === 'customer.subscription.deleted') {
    const user = await User.findOne({ stripeSubscriptionId: event.data.object.id });
    if (user) { user.plan = 'free'; user.stripeSubscriptionId = null; await user.save(); }
  }
  res.json({ received: true });
});

router.post('/cancel', auth, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Payment system not configured' });
    if (!req.user.stripeSubscriptionId) return res.status(400).json({ error: 'No active subscription' });
    await stripe.subscriptions.cancel(req.user.stripeSubscriptionId);
    req.user.plan = 'free'; req.user.stripeSubscriptionId = null;
    await req.user.save();
    res.json({ message: 'Subscription cancelled' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/portal', auth, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Payment system not configured' });
    if (!req.user.stripeCustomerId) return res.status(400).json({ error: 'No billing account found' });
    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard.html`,
    });
    res.json({ url: session.url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
