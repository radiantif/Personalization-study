'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'studyflow-jwt-secret-2024';
const JWT_EXPIRES = '30d';

function hashPassword(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}
function makeToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// ── Đăng ký ───────────────────────────────────────────
router.post('/register', async function(req, res) {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.rows.length > 0)
      return res.status(400).json({ error: 'Email này đã được đăng ký' });
    const salt = generateSalt();
    const hashed = hashPassword(password, salt);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, password_salt, avatar)
       VALUES ($1,$2,$3,$4,'🎓')
       RETURNING id, name, email, avatar, level, exp, total_study_hours`,
      [name, email, hashed, salt]
    );
    const user = result.rows[0];
    const token = makeToken(user);
    res.status(201).json({ success: true, token, user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Đăng nhập ─────────────────────────────────────────
router.post('/login', async function(req, res) {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (!result.rows.length)
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    const user = result.rows[0];
    const hashed = hashPassword(password, user.password_salt);
    if (hashed !== user.password_hash)
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id]);
    const token = makeToken(user);
    res.json({ success: true, token, user: {
      id: user.id, name: user.name, email: user.email,
      avatar: user.avatar, custom_avatar: user.custom_avatar,
      level: user.level, exp: user.exp, total_study_hours: user.total_study_hours
    }});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Verify token ──────────────────────────────────────
router.get('/me', function(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.json({ authenticated: false });
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    pool.query(
      'SELECT id,name,email,avatar,custom_avatar,level,exp,total_study_hours,exam_date,target_subject FROM users WHERE id=$1',
      [decoded.id]
    ).then(function(result) {
      if (!result.rows.length) return res.json({ authenticated: false });
      res.json({ authenticated: true, user: result.rows[0] });
    });
  } catch {
    res.json({ authenticated: false });
  }
});

module.exports = router;