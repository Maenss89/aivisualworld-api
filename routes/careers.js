// ─────────────────────────────────────────────────────────────────────────────
// routes/careers.js  — Career applications for AIVisualWorld
// Add to server.js: app.use('/api/careers', require('./routes/careers'));
// ─────────────────────────────────────────────────────────────────────────────
//
// Required env vars (Render → Environment):
//   SMTP_HOST     — e.g. smtp.hostinger.com
//   SMTP_PORT     — 465
//   SMTP_USER     — contact@aivisualworld.com
//   SMTP_PASS     — your email password
//   CONTACT_EMAIL — contact@aivisualworld.com
//
// npm install nodemailer mongoose
//
// Routes:
//   POST /api/careers/apply         — submit application (public)
//   GET  /api/careers/applications  — list all applications (admin+)
//   PUT  /api/careers/applications/:id/status — update status (admin+)
// ─────────────────────────────────────────────────────────────────────────────

const express    = require('express');
const router     = express.Router();
const nodemailer = require('nodemailer');
const mongoose   = require('mongoose');

// ── EMAIL TRANSPORTER ─────────────────────────────────────────────────────────
function getTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.hostinger.com',
    port:   parseInt(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER || process.env.CONTACT_EMAIL,
      pass: process.env.SMTP_PASS,
    }
  });
}

// ── APPLICATION SCHEMA ────────────────────────────────────────────────────────
const ApplicationSchema = new mongoose.Schema({
  role:         { type: String, required: true },
  firstName:    { type: String, required: true },
  lastName:     { type: String, required: true },
  email:        { type: String, required: true },
  portfolioUrl: { type: String, default: '' },
  experience:   { type: String, default: '' },
  availability: { type: String, default: '' },
  coverLetter:  { type: String, required: true },
  status:       { type: String, enum: ['new','reviewing','shortlisted','rejected'], default: 'new' },
  ipAddress:    { type: String },
  createdAt:    { type: Date, default: Date.now }
});

const Application = mongoose.model('Application', ApplicationSchema);

const protect = require('../middleware/auth');

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.user.isAdmin && req.user.email !== 'maenalmarei89@hotmail.com') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/careers/apply
// ─────────────────────────────────────────────────────────────────────────────
router.post('/apply', async (req, res) => {
  try {
    const { role, firstName, lastName, email, portfolioUrl, experience, availability, coverLetter } = req.body;

    if (!role || !firstName || !lastName || !email || !coverLetter) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Save to DB
    const app = await Application.create({
      role, firstName, lastName, email,
      portfolioUrl: portfolioUrl || '',
      experience:   experience   || '',
      availability: availability || '',
      coverLetter,
      ipAddress: req.ip
    });

    // Send email notification to contact@aivisualworld.com
    const CONTACT = process.env.CONTACT_EMAIL || 'contact@aivisualworld.com';
    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from:    `"AIVisualWorld Careers" <${process.env.SMTP_USER}>`,
        to:      CONTACT,
        subject: `[Career Application] ${role} — ${firstName} ${lastName}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">
            <div style="background:#0a0a0a;padding:24px;border-radius:8px 8px 0 0">
              <h2 style="color:#c8ff00;margin:0;font-size:20px">New Career Application</h2>
              <p style="color:#aaa;margin:4px 0 0">AIVisualWorld Careers</p>
            </div>
            <div style="padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#666;width:140px">Role Applied</td><td style="padding:8px 0;font-weight:600">${role}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Full Name</td><td style="padding:8px 0">${firstName} ${lastName}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Email</td><td style="padding:8px 0"><a href="mailto:${email}">${email}</a></td></tr>
                <tr><td style="padding:8px 0;color:#666">Portfolio</td><td style="padding:8px 0">${portfolioUrl ? `<a href="${portfolioUrl}">${portfolioUrl}</a>` : '—'}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Experience</td><td style="padding:8px 0">${experience || '—'}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Availability</td><td style="padding:8px 0">${availability || '—'}</td></tr>
              </table>
              <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
              <h4 style="margin:0 0 8px">Cover Letter</h4>
              <p style="color:#333;line-height:1.7;white-space:pre-wrap">${coverLetter}</p>
              <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
              <p style="font-size:12px;color:#999">Submitted: ${new Date().toUTCString()}<br>Application ID: ${app._id}</p>
            </div>
          </div>
        `
      });

      // Auto-reply to applicant
      await transporter.sendMail({
        from:    `"AIVisualWorld" <${process.env.SMTP_USER}>`,
        to:      email,
        subject: `Your application for ${role} — AIVisualWorld`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#0a0a0a;padding:24px;border-radius:8px 8px 0 0">
              <h2 style="color:#c8ff00;margin:0">Application Received</h2>
            </div>
            <div style="padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
              <p>Hi ${firstName},</p>
              <p>Thank you for applying for the <strong>${role}</strong> position at AIVisualWorld. We've received your application and will review it within 5 business days.</p>
              <p>If your background looks like a great fit, we'll reach out to arrange a conversation.</p>
              <p>Best,<br><strong>The AIVisualWorld Team</strong></p>
            </div>
          </div>
        `
      });
    } catch (emailErr) {
      console.error('Email send error:', emailErr.message);
      // Don't fail the request if email fails — application is already saved
    }

    console.log(`✅ Career application received: ${role} from ${email}`);
    res.json({ success: true, applicationId: app._id });
  } catch (err) {
    console.error('POST /careers/apply:', err);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/careers/applications
// List all applications (admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/applications', protect, requireAdmin, async (req, res) => {
  try {
    const { status, role, limit = 100, skip = 0 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (role)   filter.role   = { $regex: role, $options: 'i' };

    const [applications, total] = await Promise.all([
      Application.find(filter).sort({ createdAt: -1 }).limit(parseInt(limit)).skip(parseInt(skip)),
      Application.countDocuments(filter)
    ]);

    res.json({ applications, total });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/careers/applications/:id/status
// Update application status (admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/applications/:id/status', protect, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['new', 'reviewing', 'shortlisted', 'rejected'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const app = await Application.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!app) return res.status(404).json({ error: 'Application not found' });
    res.json({ success: true, application: app });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/careers/contact  — General contact form
// ─────────────────────────────────────────────────────────────────────────────
router.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email and message are required' });
    }

    const CONTACT = process.env.CONTACT_EMAIL || 'contact@aivisualworld.com';
    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from:    `"AIVisualWorld Contact" <${process.env.SMTP_USER}>`,
        to:      CONTACT,
        replyTo: email,
        subject: `[Contact] ${subject || 'General Inquiry'} — ${name}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#0a0a0a;padding:24px;border-radius:8px 8px 0 0">
              <h2 style="color:#c8ff00;margin:0">New Contact Message</h2>
            </div>
            <div style="padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#666;width:100px">From</td><td style="padding:8px 0">${name} &lt;${email}&gt;</td></tr>
                <tr><td style="padding:8px 0;color:#666">Subject</td><td style="padding:8px 0">${subject || 'General Inquiry'}</td></tr>
              </table>
              <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
              <p style="color:#333;line-height:1.7;white-space:pre-wrap">${message}</p>
              <p style="font-size:12px;color:#999">Sent: ${new Date().toUTCString()}</p>
            </div>
          </div>
        `
      });
    } catch (emailErr) {
      console.error('Contact email error:', emailErr.message);
      return res.status(500).json({ error: 'Failed to send message. Please try again.' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
