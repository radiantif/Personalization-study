'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');
const crypto = require('crypto');

// Hash password đơn giản bằng SHA-256 + salt
function hashPassword(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// ── Đăng ký ───────────────────────────────────────────
router.post('/register', async function(req, res) {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
  }
  try {
    // Kiểm tra email đã tồn tại
    const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email này đã được đăng ký' });
    }
    const salt = generateSalt();
    const hashed = hashPassword(password, salt);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, password_salt, avatar)
       VALUES ($1, $2, $3, $4, '🎓') RETURNING id, name, email, avatar, level, exp, total_study_hours`,
      [name, email, hashed, salt]
    );
    const user = result.rows[0];
    req.session.userId = user.id;
    req.session.save();
    res.status(201).json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Đăng nhập ─────────────────────────────────────────
router.post('/login', async function(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }
    const user = result.rows[0];
    const hashed = hashPassword(password, user.password_salt);
    if (hashed !== user.password_hash) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }
    req.session.userId = user.id;
    req.session.save();
    await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id]);
    res.json({ success: true, user: {
      id: user.id, name: user.name, email: user.email,
      avatar: user.avatar, custom_avatar: user.custom_avatar,
      level: user.level, exp: user.exp, total_study_hours: user.total_study_hours
    }});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Kiểm tra đăng nhập ────────────────────────────────
router.get('/me', async function(req, res) {
  if (!req.session.userId) {
    return res.json({ authenticated: false });
  }
  try {
    const result = await pool.query(
      'SELECT id, name, email, avatar, custom_avatar, level, exp, total_study_hours, exam_date, target_subject FROM users WHERE id=$1',
      [req.session.userId]
    );
    if (!result.rows.length) return res.json({ authenticated: false });
    res.json({ authenticated: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Đăng xuất ─────────────────────────────────────────
router.post('/logout', function(req, res) {
  req.session.destroy(function(err) {
    if (err) return res.status(500).json({ error: 'Lỗi đăng xuất' });
    res.json({ success: true });
  });
});

module.exports = router;