'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Fail at startup if secret is missing — never use a fallback
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET env var is required');
const JWT_EXPIRES = '30d';
const BCRYPT_ROUNDS = 12;

function makeToken(user) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

const SAFE_USER_FIELDS = 'id,name,email,avatar,custom_avatar,level,exp,total_study_hours,exam_date,target_subject';

// ── Đăng ký ───────────────────────────────────────────
router.post('/register', async function(req, res) {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
  if (typeof name !== 'string' || name.trim().length < 1 || name.length > 100)
    return res.status(400).json({ error: 'Tên phải từ 1–100 ký tự' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Email không hợp lệ' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (existing.rows.length > 0)
      return res.status(400).json({ error: 'Email này đã được đăng ký' });
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, avatar)
       VALUES ($1,$2,$3,'🎓')
       RETURNING ${SAFE_USER_FIELDS}`,
      [name.trim(), email.toLowerCase(), passwordHash]
    );
    const user = result.rows[0];
    res.status(201).json({ success: true, token: makeToken(user), user });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Đăng ký thất bại, vui lòng thử lại' });
  }
});

// ── Đăng nhập ─────────────────────────────────────────
router.post('/login', async function(req, res) {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    if (!result.rows.length)
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    const user = result.rows[0];

    // Support legacy HMAC hash (migration path)
    let passwordOk = false;
    if (user.password_hash && user.password_hash.length === 60) {
      // bcrypt hash (60 chars)
      passwordOk = await bcrypt.compare(password, user.password_hash);
    } else if (user.password_salt) {
      // Legacy HMAC — verify then upgrade to bcrypt
      const crypto = require('crypto');
      const legacyHash = crypto.createHmac('sha256', user.password_salt).update(password).digest('hex');
      if (legacyHash === user.password_hash) {
        passwordOk = true;
        // Upgrade hash in background
        const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        pool.query('UPDATE users SET password_hash=$1, password_salt=NULL WHERE id=$2', [newHash, user.id]).catch(() => {});
      }
    }

    if (!passwordOk)
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });

    await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id]);
    res.json({
      success: true,
      token: makeToken(user),
      user: {
        id: user.id, name: user.name, email: user.email,
        avatar: user.avatar, custom_avatar: user.custom_avatar,
        level: user.level, exp: user.exp,
        total_study_hours: user.total_study_hours
      }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Đăng nhập thất bại, vui lòng thử lại' });
  }
});

// ── Verify token ──────────────────────────────────────
router.get('/me', async function(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.json({ authenticated: false });
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    const result = await pool.query(
      `SELECT ${SAFE_USER_FIELDS} FROM users WHERE id=$1`,
      [decoded.id]
    );
    if (!result.rows.length) return res.json({ authenticated: false });
    res.json({ authenticated: true, user: result.rows[0] });
  } catch {
    res.json({ authenticated: false });
  }
});

module.exports = router;