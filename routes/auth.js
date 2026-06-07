const express = require('express');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const auth    = require('../middleware/auth');
const router  = express.Router();

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(409).json({ error: exists.email === email ? 'Email already registered' : 'Username taken' });

    // Capture registration IP
    const regIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';

    const user  = await User.create({ username, email, password, registrationIp: regIp });
    const token = signToken(user._id);
    res.status(201).json({ token, user: user.toPublic() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    // Block suspended accounts
    if (user.suspended) {
      return res.status(403).json({ error: 'Account suspended. Contact support@aivisualworld.com' });
    }

    // Record login time and IP
    const loginIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
    user.lastLogin   = new Date();
    user.lastLoginIp = loginIp;
    await user.save();

    const token = signToken(user._id);
    res.json({ token, user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => res.json({ user: req.user.toPublic() }));

// POST /api/auth/reset-password  — sets a new password directly (no email needed)
// Body: { email, newPassword }
// Only works for the admin email OR when called with a valid auth token
router.post('/reset-password', async (req, res) => {
  try {
    const { email, newPassword, token: resetToken } = req.body;
    if (!email || !newPassword) return res.status(400).json({ error: 'email and newPassword required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    // Allow reset only for the admin email OR if a valid JWT is supplied
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'maenalmarei89@hotmail.com';
    let authorized = email === ADMIN_EMAIL;
    if (!authorized && resetToken) {
      try {
        const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
        const tokenUser = await User.findById(decoded.id);
        authorized = tokenUser && tokenUser.email === email;
      } catch {}
    }
    if (!authorized) return res.status(403).json({ error: 'Not authorized to reset this account' });

    const user = await User.findOne({ email });
    if (!user) {
      // Auto-create admin account if it doesn't exist yet
      const newUser = await User.create({
        username: 'admin',
        email,
        password: newPassword,
        isAdmin: true,
      });
      const token = signToken(newUser._id);
      return res.status(201).json({ message: 'Admin account created', token, user: newUser.toPublic() });
    }
    user.password = newPassword;
    user.isAdmin  = true;
    await user.save();
    const token = signToken(user._id);
    res.json({ message: 'Password updated', token, user: user.toPublic() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/auth/profile
router.patch('/profile', auth, async (req, res) => {
  try {
    const { bio, avatar, instagram, tiktok, youtube } = req.body;
    if (bio !== undefined)       req.user.bio       = bio.slice(0, 300);
    if (avatar !== undefined)    req.user.avatar    = avatar;
    if (instagram !== undefined) req.user.instagram = instagram.slice(0, 100);
    if (tiktok !== undefined)    req.user.tiktok    = tiktok.slice(0, 100);
    if (youtube !== undefined)   req.user.youtube   = youtube.slice(0, 100);
    await req.user.save();
    res.json({ user: req.user.toPublic() });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
