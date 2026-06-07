const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: '', maxlength: 1000 },
  embedUrl:    { type: String, required: true, trim: true },
  thumbnail:   { type: String, default: '' },
  duration:    { type: String, default: '' },
  category:    { type: String, default: 'AI Videos', trim: true },
  tags:        [{ type: String, trim: true }],
  published:   { type: Boolean, default: false },
  views:       { type: Number, default: 0 },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
});

videoSchema.index({ published: 1, createdAt: -1 });
videoSchema.pre('save', function(next) { this.updatedAt = new Date(); next(); });

module.exports = mongoose.model('Video', videoSchema);
