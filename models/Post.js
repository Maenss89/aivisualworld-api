const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  title:      { type: String, required: true, trim: true },
  slug:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  excerpt:    { type: String, trim: true, maxlength: 500 },
  content:    { type: String, required: true },
  coverImage: { type: String, default: '' },
  author:     { type: String, default: 'AIVisualWorld Team' },
  tags:       [{ type: String, trim: true }],
  published:  { type: Boolean, default: false },
  views:      { type: Number, default: 0 },
  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now },
});

postSchema.index({ published: 1, createdAt: -1 });
postSchema.pre('save', function(next) { this.updatedAt = new Date(); next(); });

module.exports = mongoose.model('Post', postSchema);
