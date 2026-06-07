const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title:      { type: String, required: true, trim: true },
  excerpt:    { type: String, trim: true, maxlength: 500 },
  content:    { type: String, default: '' },
  coverImage: { type: String, default: '' },
  sourceUrl:  { type: String, default: '' },
  sourceName: { type: String, default: '' },
  category:   { type: String, default: 'AI News', trim: true },
  tags:       [{ type: String, trim: true }],
  published:  { type: Boolean, default: false },
  views:      { type: Number, default: 0 },
  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now },
});

articleSchema.index({ published: 1, createdAt: -1 });
articleSchema.pre('save', function(next) { this.updatedAt = new Date(); next(); });

module.exports = mongoose.model('Article', articleSchema);
