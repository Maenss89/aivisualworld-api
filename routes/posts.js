const express = require('express');
const auth    = require('../middleware/auth');
const admin   = require('../middleware/admin');
const Post    = require('../models/Post');
const router  = express.Router();

// Public: list published posts
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 12, 50);
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const skip  = (page - 1) * limit;
    const tag   = req.query.tag;
    const filter = { published: true };
    if (tag) filter.tags = tag;
    const [items, total] = await Promise.all([
      Post.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-content').lean(),
      Post.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Public: get single post by slug
router.get('/:slug', async (req, res) => {
  try {
    const post = await Post.findOneAndUpdate(
      { slug: req.params.slug, published: true },
      { $inc: { views: 1 } },
      { new: true }
    ).lean();
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Admin: list all posts (including drafts)
router.get('/admin/all', auth, admin, async (req, res) => {
  try {
    const items = await Post.find().sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Admin: create post
router.post('/', auth, admin, async (req, res) => {
  try {
    const { title, slug, excerpt, content, coverImage, author, tags, published } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    const post = await Post.create({ title, slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''), excerpt, content, coverImage, author, tags, published });
    res.status(201).json(post);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Slug already exists' });
    res.status(500).json({ error: err.message });
  }
});

// Admin: update post
router.put('/:id', auth, admin, async (req, res) => {
  try {
    const post = await Post.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!post) return res.status(404).json({ error: 'Not found' });
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: delete post
router.delete('/:id', auth, admin, async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
