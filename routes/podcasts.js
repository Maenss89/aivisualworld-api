const express = require('express');
const auth    = require('../middleware/auth');
const admin   = require('../middleware/admin');
const Podcast = require('../models/Podcast');
const router  = express.Router();

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 12, 50);
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const skip  = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Podcast.find({ published: true }).sort({ season: -1, episode: -1 }).skip(skip).limit(limit).lean(),
      Podcast.countDocuments({ published: true }),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/admin/all', auth, admin, async (req, res) => {
  try {
    const items = await Podcast.find().sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const podcast = await Podcast.findByIdAndUpdate(
      req.params.id, { $inc: { plays: 1 } }, { new: true }
    ).lean();
    if (!podcast || !podcast.published) return res.status(404).json({ error: 'Not found' });
    res.json(podcast);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/', auth, admin, async (req, res) => {
  try {
    const podcast = await Podcast.create(req.body);
    res.status(201).json(podcast);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, admin, async (req, res) => {
  try {
    const podcast = await Podcast.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!podcast) return res.status(404).json({ error: 'Not found' });
    res.json(podcast);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, admin, async (req, res) => {
  try {
    await Podcast.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
