require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const mongoose  = require('mongoose');
const rateLimit = require('express-rate-limit');
const session   = require('express-session');
const passport  = require('./middleware/passport');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'https://www.aivisualworld.com',
  'https://aivisualworld.com',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'null',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
}));

// ── SESSION (required for Passport OAuth flow) ────────────────────────────────
app.use(session({
  secret:            process.env.SESSION_SECRET || process.env.JWT_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: process.env.NODE_ENV === 'production', maxAge: 10 * 60 * 1000 }, // 10 min (only used during OAuth redirect)
}));

// ── PASSPORT ──────────────────────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try { const User = require('./models/User'); done(null, await User.findById(id)); }
  catch(e) { done(e); }
});

// ── BODY PARSING ──────────────────────────────────────────────────────────────
app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));

// ── RATE LIMITING ─────────────────────────────────────────────────────────────
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Too many requests' } }));
app.use('/api/generate/', rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: 'Too many generation requests. Please wait.' } }));

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/oauth',         require('./routes/oauth'));
app.use('/api/generate',      require('./routes/generate'));
app.use('/api/gallery',       require('./routes/gallery'));
app.use('/api/subscriptions', require('./routes/subscriptions'));

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err.stack); res.status(500).json({ error: 'Internal server error' }); });

// ── START ─────────────────────────────────────────────────────────────────────
async function start() {
  if (!process.env.MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => console.log(`🚀 AIVisualWorld API on port ${PORT}`));
  } catch (err) { console.error('MongoDB failed:', err.message); process.exit(1); }
}
start();
