const mongoose = require('mongoose');

const generationSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:       { type: String, enum: ['image','video'], default: 'image' },
  prompt:     { type: String, required: true },
  negPrompt:  { type: String, default: '' },
  providerId: { type: String, required: true },
  size:       { type: String, default: '1024x1024' },
  style:      { type: String, default: 'photographic' },
  imageUrl:   { type: String },
  videoUrl:   { type: String },
  creditsUsed:{ type: Number, default: 5 },
  status:     { type: String, enum: ['pending','completed','failed'], default: 'completed' },
  public:     { type: Boolean, default: false },
  likes:      { type: Number, default: 0 },
  createdAt:  { type: Date, default: Date.now },
});

generationSchema.index({ userId: 1, createdAt: -1 });
generationSchema.index({ public: 1, createdAt: -1 });

module.exports = mongoose.model('Generation', generationSchema);
