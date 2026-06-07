const express  = require('express');
const auth     = require('../middleware/auth');
const admin    = require('../middleware/admin');
const Article  = require('../models/Article');
const router   = express.Router();

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 12, 50);
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const skip  = (page - 1) * limit;
    const filter = { published: true };
    if (req.query.category) filter.category = req.query.category;
    const [items, total] = await Promise.all([
      Article.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Article.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/admin/all', auth, admin, async (req, res) => {
  try {
    const items = await Article.find().sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const article = await Article.findByIdAndUpdate(
      req.params.id, { $inc: { views: 1 } }, { new: true }
    ).lean();
    if (!article || !article.published) return res.status(404).json({ error: 'Not found' });
    res.json(article);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/', auth, admin, async (req, res) => {
  try {
    const article = await Article.create(req.body);
    res.status(201).json(article);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, admin, async (req, res) => {
  try {
    const article = await Article.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!article) return res.status(404).json({ error: 'Not found' });
    res.json(article);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, admin, async (req, res) => {
  try {
    await Article.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
