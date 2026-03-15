'use strict';
const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db');
const crypto = require('crypto');

// Multer memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh'));
  }
});

// Upload Cloudinary dùng multipart/form-data thuần — không cần form-data package
async function uploadToCloudinary(buffer, mimetype, userId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error('Chưa cấu hình Cloudinary');

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'studyflow/avatars';
  const publicId = `avatar_${userId}_${timestamp}`;

  const signStr = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha256').update(signStr).digest('hex');

  // Tạo multipart boundary thủ công
  const boundary = '----FormBoundary' + crypto.randomBytes(8).toString('hex');
  const ext = mimetype.split('/')[1] || 'jpg';

  function buildPart(name, value) {
    return `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  }

  const parts = [
    buildPart('api_key', apiKey),
    buildPart('timestamp', timestamp),
    buildPart('signature', signature),
    buildPart('folder', folder),
    buildPart('public_id', publicId),
    buildPart('transformation', 'w_200,h_200,c_fill,g_face,r_max,q_auto,f_auto'),
  ];

  const textPart = parts.join('');
  const filePart = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="avatar.${ext}"\r\nContent-Type: ${mimetype}\r\n\r\n`;
  const endPart = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(textPart, 'utf8'),
    Buffer.from(filePart, 'utf8'),
    buffer,
    Buffer.from(endPart, 'utf8'),
  ]);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      body,
    }
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

// POST upload avatar
router.post('/avatar', upload.single('avatar'), async function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Không có file ảnh' });
  try {
    const url = await uploadToCloudinary(req.file.buffer, req.file.mimetype, req.user.id);
    const result = await pool.query(
      'UPDATE users SET custom_avatar=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [url, req.user.id]
    );
    res.json({ url, user: result.rows[0] });
  } catch (err) {
    console.error('Avatar upload error:', err.message);
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