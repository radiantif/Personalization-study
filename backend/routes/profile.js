'use strict';
const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db');
const crypto = require('crypto');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh'));
  }
});

async function uploadToCloudinary(buffer, mimetype) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || 'studyflow_avatars';
  if (!cloudName) throw new Error('Thiếu CLOUDINARY_CLOUD_NAME');

  const ext = mimetype.includes('png') ? 'png'
    : mimetype.includes('gif') ? 'gif'
    : mimetype.includes('webp') ? 'webp' : 'jpg';

  const boundary = '----Boundary' + crypto.randomBytes(8).toString('hex');
  const fields = [
    ['upload_preset', uploadPreset],
    ['folder', 'studyflow/avatars'],
  ];
  let textPart = '';
  for (const [name, value] of fields) {
    textPart += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  }
  const filePart = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="avatar.${ext}"\r\nContent-Type: ${mimetype}\r\n\r\n`;
  const endPart = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([Buffer.from(textPart), Buffer.from(filePart), buffer, Buffer.from(endPart)]);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const data = await response.json();
  if (data.error) throw new Error('Cloudinary: ' + data.error.message);
  if (!data.secure_url) throw new Error('Không nhận được URL từ Cloudinary');
  return data.secure_url;
}

// GET profile — never return password fields
router.get('/', async function(req, res) {
  try {
    const result = await pool.query(
      'SELECT id,name,email,avatar,custom_avatar,level,exp,total_study_hours,streak_days,exam_date,target_subject,created_at FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST update profile — validate all inputs
router.post('/', async function(req, res) {
  const { name, avatar, exam_date, target_subject } = req.body;

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length < 1)
      return res.status(400).json({ error: 'Tên không hợp lệ' });
    if (name.length > 100) return res.status(400).json({ error: 'Tên tối đa 100 ký tự' });
  }
  if (avatar !== undefined && (typeof avatar !== 'string' || [...(avatar || '')].length > 2))
    return res.status(400).json({ error: 'Avatar không hợp lệ' });
  if (target_subject !== undefined && target_subject !== null && String(target_subject).length > 100)
    return res.status(400).json({ error: 'Môn học tối đa 100 ký tự' });

  // Validate exam_date
  let safeDate = null;
  if (exam_date) {
    const d = new Date(exam_date);
    if (isNaN(d.getTime())) return res.status(400).json({ error: 'Ngày thi không hợp lệ' });
    safeDate = d.toISOString();
  }

  try {
    const result = await pool.query(
      `UPDATE users SET name=$1, avatar=$2, exam_date=$3, target_subject=$4, updated_at=NOW()
       WHERE id=$5 RETURNING id,name,email,avatar,custom_avatar,level,exp,total_study_hours,exam_date,target_subject`,
      [name?.trim(), avatar, safeDate, target_subject || null, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST upload avatar
router.post('/avatar', upload.single('avatar'), async function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Không có file ảnh' });
  try {
    const url = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
    const result = await pool.query(
      'UPDATE users SET custom_avatar=$1, updated_at=NOW() WHERE id=$2 RETURNING id,name,custom_avatar,avatar',
      [url, req.user.id]
    );
    res.json({ url, user: result.rows[0] });
  } catch (err) {
    console.error('Avatar error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST add EXP — cap to prevent cheating
router.post('/exp', async function(req, res) {
  const amount = Math.max(0, Math.min(parseInt(req.body.amount) || 10, 100));
  try {
    const result = await pool.query(
      `UPDATE users
       SET exp = exp + $1,
           level = CASE WHEN (exp + $1) >= level * 100 THEN level + 1 ELSE level END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id,level,exp`,
      [amount, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;