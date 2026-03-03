import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sendTempPassword } from '../lib/email.js';

const router = Router();
const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = '7d';

// ── In-memory rate limiter for login (5 attempts / 15 min per IP) ──────────
const loginAttempts = new Map(); // ip → { count, resetAt }

function checkRateLimit(ip) {
  const now = Date.now();
  const window = 15 * 60 * 1000; // 15 min
  const entry = loginAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + window });
    return false; // not limited
  }
  if (entry.count >= 5) return true; // limited
  entry.count++;
  return false;
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip);
  }
}, 5 * 60 * 1000);

// ── Helpers ────────────────────────────────────────────────────────────────

function generateTempPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  // Use Math.random — acceptable for temp passwords sent over email
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.must_change_password,
    },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── POST /api/auth/register ────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, fullName, phone } = req.body || {};

  if (!email || !fullName) {
    return res.status(400).json({ error: 'email and fullName are required' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    // Check for duplicate (but always return same message to avoid enumeration)
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      // Return success-looking message to prevent enumeration
      return res.json({ message: 'Account created. Check your email for your temporary password.' });
    }

    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    await pool.query(
      `INSERT INTO users (email, full_name, phone, password_hash)
       VALUES ($1, $2, $3, $4)`,
      [email.toLowerCase(), fullName.trim(), phone?.trim() || null, hash]
    );

    // Send email (non-blocking failure — log but don't crash registration)
    try {
      await sendTempPassword(email.toLowerCase(), fullName.trim(), tempPassword);
    } catch (emailErr) {
      console.error('Email send error:', emailErr.message);
    }

    return res.json({ message: 'Account created. Check your email for your temporary password.' });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';

  if (checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email.toLowerCase()]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last_login
    await pool.query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);

    const token = signToken(user);
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        mustChangePassword: user.must_change_password,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/change-password  [requireAuth] ─────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];

    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const sameAsOld = await bcrypt.compare(newPassword, user.password_hash);
    if (sameAsOld) {
      return res.status(400).json({ error: 'New password must differ from current password' });
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [newHash, user.id]
    );

    // Return new token with mustChangePassword=false
    const updatedUser = { ...user, password_hash: newHash, must_change_password: false };
    const token = signToken(updatedUser);

    return res.json({
      token,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        fullName: updatedUser.full_name,
        role: updatedUser.role,
        mustChangePassword: false,
      },
    });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Password change failed' });
  }
});

// ── GET /api/auth/me  [requireAuth] ───────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, full_name, phone, role, must_change_password FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      role: user.role,
      mustChangePassword: user.must_change_password,
    });
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;
