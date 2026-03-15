'use strict';
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../db');
const { v4: uuidv4 } = require('uuid');

// Multer for avatar upload
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: function(req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, 'avatar-' + uuidv4() + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh'));
  }
});

// GET profile — req.user.id đã được set bởi requireAuth trong server.js
router.get('/', async function(req, res) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST update profile
router.post('/', async function(req, res) {
  const { name, avatar, exam_date, target_subject } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users SET name=$1, avatar=$2, exam_date=$3, target_subject=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [name, avatar, exam_date || null, target_subject, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload avatar image
router.post('/avatar', upload.single('avatar'), async function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Không có file' });
  try {
    const fileUrl = '/uploads/' + req.file.filename;
    const result = await pool.query(
      'UPDATE users SET custom_avatar=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [fileUrl, req.user.id]
    );
    res.json({ url: fileUrl, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add EXP
router.post('/exp', async function(req, res) {
  const { amount } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users
       SET exp = exp + $1,
           level = CASE WHEN (exp + $1) >= level * 100 THEN level + 1 ELSE level END,
           updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [amount || 10, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;