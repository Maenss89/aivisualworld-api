const express    = require('express');
const Generation = require('../models/Generation');
const User       = require('../models/User');
const router     = express.Router();

// GET /api/gallery
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 24, 100);
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const skip  = (page - 1) * limit;
    const sort  = req.query.sort === 'likes' ? { likes: -1 } : { createdAt: -1 };
    const items = await Generation.find({ public: true, type: 'image' })
      .sort(sort).skip(skip).limit(limit)
      .populate('userId', 'username avatar').lean();
    const total = await Generation.countDocuments({ public: true, type: 'image' });
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/gallery/:id/like
router.post('/:id/like', async (req, res) => {
  try {
    const gen = await Generation.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } }, { new: true });
    if (!gen) return res.status(404).json({ error: 'Not found' });
    res.json({ likes: gen.likes });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/gallery/stats
router.get('/stats', async (req, res) => {
  try {
    const [totalImages, totalUsers] = await Promise.all([
      Generation.countDocuments({ type: 'image' }),
      User.countDocuments(),
    ]);
    res.json({ totalImages, totalUsers });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
