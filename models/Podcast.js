const mongoose = require('mongoose');

const podcastSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: '', maxlength: 1000 },
  embedUrl:    { type: String, required: true, trim: true },
  thumbnail:   { type: String, default: '' },
  duration:    { type: String, default: '' },
  episode:     { type: Number, default: 1 },
  season:      { type: Number, default: 1 },
  host:        { type: String, default: 'AIVisualWorld' },
  tags:        [{ type: String, trim: true }],
  published:   { type: Boolean, default: false },
  plays:       { type: Number, default: 0 },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
});

podcastSchema.index({ published: 1, createdAt: -1 });
podcastSchema.pre('save', function(next) { this.updatedAt = new Date(); next(); });

module.exports = mongoose.model('Podcast', podcastSchema);
