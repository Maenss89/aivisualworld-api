const express = require('express');
const User    = require('../models/User');
const router  = express.Router();

// GET /api/users/:username  - public portfolio profile
router.get('/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      username:         user.username,
      avatar:           user.avatar,
      bio:              user.bio,
      instagram:        user.instagram,
      tiktok:           user.tiktok,
      youtube:          user.youtube,
      plan:             user.plan,
      totalGenerations: user.totalGenerations,
      createdAt:        user.createdAt,
    });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
