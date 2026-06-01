const passport       = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const User = require('../models/User');

// ── Helper: find or create user from OAuth profile ───────────────────────────
async function findOrCreate({ provider, id, email, displayName, avatar }) {
  // Check if user already linked this provider
  const providerField = provider === 'google' ? 'googleId' : 'microsoftId';
  let user = await User.findOne({ [providerField]: id });
  if (user) return user;

  // Check if email already exists (link accounts)
  if (email) {
    user = await User.findOne({ email });
    if (user) {
      user[providerField] = id;
      if (!user.avatar && avatar) user.avatar = avatar;
      await user.save();
      return user;
    }
  }

  // Create new user
  const baseUsername = (displayName || email.split('@')[0])
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 28) || 'user';

  // Make username unique
  let username = baseUsername;
  let suffix = 1;
  while (await User.findOne({ username })) {
    username = `${baseUsername}${suffix++}`;
  }

  user = await User.create({
    username,
    email:        email || `${id}@${provider}.oauth`,
    [providerField]: id,
    authProvider: provider,
    avatar:       avatar || '',
    credits:      100,  // welcome credits
  });

  return user;
}

// ── GOOGLE STRATEGY ───────────────────────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  `${process.env.API_URL || 'https://aivisualworld-api.onrender.com'}/api/oauth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreate({
          provider: 'google',
          id:          profile.id,
          email:       profile.emails?.[0]?.value,
          displayName: profile.displayName,
          avatar:      profile.photos?.[0]?.value,
        });
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  ));
  console.log('✅ Google OAuth configured');
} else {
  console.log('⚠️  Google OAuth not configured (GOOGLE_CLIENT_ID missing)');
}

// ── MICROSOFT STRATEGY ────────────────────────────────────────────────────────
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  passport.use(new MicrosoftStrategy(
    {
      clientID:     process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackURL:  `${process.env.API_URL || 'https://aivisualworld-api.onrender.com'}/api/oauth/microsoft/callback`,
      scope:        ['user.read'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreate({
          provider: 'microsoft',
          id:          profile.id,
          email:       profile.emails?.[0]?.value || profile._json?.mail || profile._json?.userPrincipalName,
          displayName: profile.displayName,
          avatar:      '',
        });
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  ));
  console.log('✅ Microsoft OAuth configured');
} else {
  console.log('⚠️  Microsoft OAuth not configured (MICROSOFT_CLIENT_ID missing)');
}

module.exports = passport;
