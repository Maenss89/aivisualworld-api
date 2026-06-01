const express  = require('express');
const passport = require('passport');
const jwt      = require('jsonwebtoken');
const router   = express.Router();

const FRONTEND = process.env.FRONTEND_URL || 'https://www.aivisualworld.com';

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// ── GOOGLE ────────────────────────────────────────────────────────────────────
// GET /api/oauth/google — redirect user to Google login
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// GET /api/oauth/google/callback — Google redirects back here
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND}/login-error.html` }),
  (req, res) => {
    const token = signToken(req.user._id);
    // Send token to frontend via redirect with query param
    // Frontend reads it from URL and stores in localStorage
    res.redirect(`${FRONTEND}/oauth-callback.html?token=${token}&provider=google`);
  }
);

// ── MICROSOFT ─────────────────────────────────────────────────────────────────
// GET /api/oauth/microsoft
router.get('/microsoft',
  passport.authenticate('microsoft', { scope: ['user.read'] })
);

// GET /api/oauth/microsoft/callback
router.get('/microsoft/callback',
  passport.authenticate('microsoft', { session: false, failureRedirect: `${FRONTEND}/login-error.html` }),
  (req, res) => {
    const token = signToken(req.user._id);
    res.redirect(`${FRONTEND}/oauth-callback.html?token=${token}&provider=microsoft`);
  }
);

module.exports = router;
