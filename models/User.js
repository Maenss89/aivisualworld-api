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

  // Social links
  instagram: { type: String, default: '' },
  tiktok:    { type: String, default: '' },
  youtube:   { type: String, default: '' },

  // Stats
  totalGenerations: { type: Number, default: 0 },
  totalUploads:     { type: Number, default: 0 },

  // Admin
  isAdmin: { type: Boolean, default: false },

  // Role system
  role: {
    type:    String,
    enum:    ['user', 'content_creator', 'journalist', 'admin'],
    default: 'user',
  },

  // Account monitoring
  lastLogin:       { type: Date },
  lastLoginIp:     { type: String, default: '' },
  registrationIp:  { type: String, default: '' },
  imagesGenerated: { type: Number, default: 0 },
  suspended:       { type: Boolean, default: false },

  // Billing (used by payment routes)
  billing:    { type: String, enum: ['monthly', 'annual'], default: 'monthly' },
  planExpires:{ type: Date },

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
    billing:          this.billing,
    planExpires:      this.planExpires,
    avatar:           this.avatar,
    bio:              this.bio,
    instagram:        this.instagram,
    tiktok:           this.tiktok,
    youtube:          this.youtube,
    authProvider:     this.authProvider,
    totalGenerations: this.totalGenerations,
    imagesGenerated:  this.imagesGenerated,
    isAdmin:          this.isAdmin,
    role:             this.role,
    suspended:        this.suspended,
    lastLogin:        this.lastLogin,
    createdAt:        this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
