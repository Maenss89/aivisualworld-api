const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username:  { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:  { type: String, minlength: 6 },   // optional — not set for OAuth users
  credits:   { type: Number, default: 100 },
  plan:      { type: String, enum: ['free','basic','creator_pro','studio'], default: 'free' },

  // OAuth provider IDs
  googleId:    { type: String, default: null },
  microsoftId: { type: String, default: null },
  authProvider:{ type: String, enum: ['local','google','microsoft'], default: 'local' },

  // Stripe
  stripeCustomerId:     { type: String },
  stripeSubscriptionId: { type: String },
  planExpiresAt:        { type: Date },

  // Profile
  avatar:    { type: String, default: '' },
  bio:       { type: String, default: '', maxlength: 300 },

  // Stats
  totalGenerations: { type: Number, default: 0 },
  totalUploads:     { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
});

// Hash password before save (only for local auth users)
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function(candidate) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toPublic = function() {
  return {
    id:               this._id,
    username:         this.username,
    email:            this.email,
    credits:          this.credits,
    plan:             this.plan,
    avatar:           this.avatar,
    bio:              this.bio,
    authProvider:     this.authProvider,
    totalGenerations: this.totalGenerations,
    createdAt:        this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
