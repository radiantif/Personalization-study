'use strict';
const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db');

// Multer — lưu vào memory thay vì disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: function(req, file, cb) {
    const allowed = ['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh'));
  }
});

// Upload lên Cloudinary dùng fetch (không cần SDK)
async function uploadToCloudinary(buffer, filename) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Chưa cấu hình Cloudinary');
  }

  // Tạo signature
  const crypto = require('crypto');
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'studyflow/avatars';
  const publicId = `avatar_${filename}_${timestamp}`;

  const signStr = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha256').update(signStr).digest('hex');

  // Tạo form data
  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', buffer, { filename: 'avatar.jpg', contentType: 'image/jpeg' });
  form.append('api_key', apiKey);
  form.append('timestamp', timestamp.toString());
  form.append('signature', signature);
  form.append('folder', folder);
  form.append('public_id', publicId);
  form.append('transformation', 'w_200,h_200,c_fill,g_face,r_max,q_auto,f_auto');

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: form }
  );

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.secure_url;
}

// GET profile
router.get('/', async function(req, res) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST upload avatar → Cloudinary
router.post('/avatar', upload.single('avatar'), async function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Không có file ảnh' });
  try {
    const url = await uploadToCloudinary(req.file.buffer, req.user.id);
    const result = await pool.query(
      'UPDATE users SET custom_avatar=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [url, req.user.id]
    );
    res.json({ url, user: result.rows[0] });
  } catch (err) {
    console.error('Cloudinary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST add EXP
router.post('/exp', async function(req, res) {
  const { amount } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users SET exp=exp+$1, level=CASE WHEN (exp+$1)>=level*100 THEN level+1 ELSE level END, updated_at=NOW()
       WHERE id=$2 RETURNING *`,
      [amount || 10, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;