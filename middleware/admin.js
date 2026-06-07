const ADMIN_EMAIL = 'maenalmarei89@hotmail.com';

module.exports = function adminOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!req.user.isAdmin && req.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  // Auto-grant isAdmin if email matches
  if (req.user.email === ADMIN_EMAIL && !req.user.isAdmin) {
    req.user.isAdmin = true;
    req.user.save().catch(() => {});
  }
  next();
};
