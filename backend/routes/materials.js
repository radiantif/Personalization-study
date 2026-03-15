'use strict';
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../db');
const crypto = require('crypto');

// Multer memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: function(req, file, cb) {
    const allowed = ['.pdf','.png','.jpg','.jpeg','.gif','.webp','.txt','.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Loại file không được hỗ trợ'));
  }
});

async function uploadToCloudinary(buffer, originalname, mimetype) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName) throw new Error('Cloudinary chưa được cấu hình');

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'studyflow/materials';
  const publicId = `mat_${Date.now()}`;
  const isPDF = mimetype === 'application/pdf';
  const resourceType = isPDF ? 'raw' : 'image';

  const signStr = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha256').update(signStr).digest('hex');

  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', buffer, { filename: originalname, contentType: mimetype });
  form.append('api_key', apiKey);
  form.append('timestamp', timestamp.toString());
  form.append('signature', signature);
  form.append('folder', folder);
  form.append('public_id', publicId);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    { method: 'POST', body: form }
  );
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.secure_url;
}

// GET subjects
router.get('/subjects', async function(req, res) {
  try {
    const result = await pool.query('SELECT * FROM subjects WHERE user_id=$1 ORDER BY name ASC', [req.user.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create subject
router.post('/subjects', async function(req, res) {
  const { name, color, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'Cần tên môn học' });
  try {
    const result = await pool.query(
      'INSERT INTO subjects (user_id,name,color,icon) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.id, name, color||'#6366f1', icon||'📁']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET all materials
router.get('/', async function(req, res) {
  const { subject_id } = req.query;
  try {
    let query = `SELECT m.*, s.name as subject_name, s.color as subject_color
                 FROM materials m LEFT JOIN subjects s ON m.subject_id=s.id
                 WHERE m.user_id=$1 ORDER BY m.created_at DESC`;
    let params = [req.user.id];
    if (subject_id) { query = query.replace('WHERE m.user_id=$1', 'WHERE m.user_id=$1 AND m.subject_id=$2'); params.push(subject_id); }
    res.json((await pool.query(query, params)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST upload material
router.post('/', upload.single('file'), async function(req, res) {
  const { title, subject_id, content, content_html, type } = req.body;
  const file = req.file;
  try {
    let fileUrl = null;
    let fileType = type || 'note';

    if (file) {
      // Upload to Cloudinary
      fileUrl = await uploadToCloudinary(file.buffer, file.originalname, file.mimetype);
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.pdf') fileType = 'pdf';
      else if (['.png','.jpg','.jpeg','.gif','.webp'].includes(ext)) fileType = 'image';
    }

    const result = await pool.query(
      `INSERT INTO materials (user_id,title,subject_id,content,content_html,file_url,file_type,original_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, title||file?.originalname||'Untitled', subject_id||null,
       content||null, content_html||null, fileUrl, fileType, file?.originalname||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Material upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE material
router.delete('/:id', async function(req, res) {
  try {
    await pool.query('DELETE FROM materials WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Đã xóa' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;