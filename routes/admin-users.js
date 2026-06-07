// ─────────────────────────────────────────────────────────────────────────────
// routes/admin-users.js  — Admin user & role management for AIVisualWorld
// Add to server.js: app.use('/api/admin', require('./routes/admin-users'));
// ─────────────────────────────────────────────────────────────────────────────
//
// Roles:
//   super_admin  — maenalmarei89@hotmail.com only (hardcoded)
//   admin        — can manage content; assigned by super_admin
//   content_creator — can publish images, blogs; assigned by any admin
//   journalist   — can publish news & blogs; assigned by any admin
//   user         — default
//
// Routes:
//   GET    /api/admin/users              — list all users (admin+)
//   PUT    /api/admin/users/:id/role     — assign role (admin+)
//   PUT    /api/admin/users/:id/promote  — make admin (super_admin only)
//   DELETE /api/admin/users/:id/promote  — remove admin (super_admin only)
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const User    = require('../models/User');

const SUPER_ADMIN_EMAIL = 'maenalmarei89@hotmail.com';
const ALLOWED_ROLES     = ['user', 'content_creator', 'journalist'];

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
const protect = require('../middleware/auth');

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.user.isAdmin && req.user.email !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.email !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Super-admin access required' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users
// Returns all users with full monitoring data
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users', protect, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({})
      .select('username email isAdmin role credits plan planExpires billing createdAt lastLogin lastLoginIp registrationIp imagesGenerated password')
      .sort({ createdAt: -1 });

    const result = users.map(u => {
      const obj = u.toObject();
      if (u.email === SUPER_ADMIN_EMAIL) obj.isSuperAdmin = true;
      // Never send full password hash — send a masked indicator only
      obj.passwordSet  = !!u.password;
      obj.passwordHint = u.password ? u.password.substring(0, 7) + '••••••••••••••••••••' : null;
      delete obj.password; // strip before sending
      return obj;
    });

    res.json({ users: result, total: result.length });
  } catch (err) {
    console.error('GET /admin/users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:id
// Single user full detail (admin+)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users/:id', protect, requireAdmin, async (req, res) => {
  try {
    const u = await User.findById(req.params.id)
      .select('username email isAdmin role credits plan planExpires billing createdAt lastLogin lastLoginIp registrationIp imagesGenerated password socialLinks bio avatar');
    if (!u) return res.status(404).json({ error: 'User not found' });
    const obj = u.toObject();
    obj.isSuperAdmin = (u.email === SUPER_ADMIN_EMAIL);
    obj.passwordSet  = !!u.password;
    obj.passwordHint = u.password ? u.password.substring(0, 7) + '••••••••••••••••••••' : null;
    delete obj.password;
    res.json({ user: obj });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/users/:id/reset-password
// Force-reset a user's password (super_admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/users/:id/reset-password', protect, requireSuperAdmin, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await User.findByIdAndUpdate(req.params.id, { password: hash });
    console.log(`✅ Password reset for user ${req.params.id} by ${req.user.email}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/users/:id/suspend
// Suspend / un-suspend a user account (admin+)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/users/:id/suspend', protect, requireAdmin, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.email === SUPER_ADMIN_EMAIL) return res.status(403).json({ error: 'Cannot suspend super admin' });
    target.suspended = !target.suspended;
    await target.save();
    const action = target.suspended ? 'suspended' : 'un-suspended';
    console.log(`✅ User ${action}: ${target.email} (by ${req.user.email})`);
    res.json({ success: true, suspended: target.suspended });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update suspension' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/users/:id/role
// Body: { role: 'content_creator' | 'journalist' | 'user' }
// Admins can assign content roles; super_admin can assign any.
// ─────────────────────────────────────────────────────────────────────────────
router.put('/users/:id/role', protect, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${ALLOWED_ROLES.join(', ')}` });
    }

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Prevent changing another admin's role (only super_admin can do that via /promote)
    if (target.isAdmin && req.user.email !== SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Cannot change role of an admin user' });
    }

    target.role = role;
    await target.save();

    console.log(`✅ Role change: ${target.email} → ${role} (by ${req.user.email})`);
    res.json({ success: true, user: { _id: target._id, email: target.email, role: target.role } });
  } catch (err) {
    console.error('PUT /admin/users/:id/role:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/users/:id/promote
// Make a user an admin (super_admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/users/:id/promote', protect, requireSuperAdmin, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.email === SUPER_ADMIN_EMAIL) {
      return res.status(400).json({ error: 'Cannot modify the super admin account' });
    }

    target.isAdmin = true;
    target.role    = 'admin';
    await target.save();

    console.log(`✅ Promoted to admin: ${target.email} (by ${req.user.email})`);
    res.json({ success: true, message: `${target.email} is now an admin` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to promote user' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/users/:id/promote
// Remove admin privileges (super_admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/users/:id/promote', protect, requireSuperAdmin, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.email === SUPER_ADMIN_EMAIL) {
      return res.status(400).json({ error: 'Cannot remove super admin privileges' });
    }

    target.isAdmin = false;
    target.role    = 'user';
    await target.save();

    console.log(`✅ Admin removed: ${target.email} (by ${req.user.email})`);
    res.json({ success: true, message: `${target.email} admin privileges removed` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to demote user' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/users/:id
// Permanently delete a user account (super_admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/users/:id', protect, requireSuperAdmin, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.email === SUPER_ADMIN_EMAIL) {
      return res.status(400).json({ error: 'Cannot delete the super admin account' });
    }
    await User.findByIdAndDelete(req.params.id);
    console.log(`✅ User deleted: ${target.email} (by ${req.user.email})`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
