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
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    const allowed = ['.pdf','.png','.jpg','.jpeg','.gif','.webp','.txt','.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Loại file không được hỗ trợ'));
  }
});

// Upload lên Cloudinary dùng multipart thuần — không cần package form-data
async function uploadToCloudinary(buffer, originalname, mimetype) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || 'studyflow_materials';

  if (!cloudName) {
    // Nếu chưa cấu hình Cloudinary → lưu base64 trong DB (fallback)
    return null;
  }

  const ext = path.extname(originalname).toLowerCase().replace('.', '');
  const isPDF = mimetype === 'application/pdf';
  const resourceType = isPDF ? 'raw' : 'image';
  const boundary = '----Boundary' + crypto.randomBytes(8).toString('hex');

  const fields = [
    ['upload_preset', uploadPreset],
    ['folder', 'studyflow/materials'],
  ];

  let textPart = '';
  for (const [name, value] of fields) {
    textPart += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  }

  const filePart = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${originalname}"\r\nContent-Type: ${mimetype}\r\n\r\n`;
  const endPart = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(textPart),
    Buffer.from(filePart),
    buffer,
    Buffer.from(endPart),
  ]);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    }
  );

  const data = await response.json();
  if (data.error) throw new Error('Cloudinary: ' + data.error.message);
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
    if (subject_id) {
      query = `SELECT m.*, s.name as subject_name, s.color as subject_color
               FROM materials m LEFT JOIN subjects s ON m.subject_id=s.id
               WHERE m.user_id=$1 AND m.subject_id=$2 ORDER BY m.created_at DESC`;
      params = [req.user.id, subject_id];
    }
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
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.pdf') fileType = 'pdf';
      else if (['.png','.jpg','.jpeg','.gif','.webp'].includes(ext)) fileType = 'image';

      // Thử upload lên Cloudinary
      try {
        fileUrl = await uploadToCloudinary(file.buffer, file.originalname, file.mimetype);
      } catch (cloudErr) {
        console.warn('Cloudinary upload failed:', cloudErr.message);
        // Fallback: lưu tên file gốc, không có URL
        fileUrl = null;
      }
    }

    const result = await pool.query(
      `INSERT INTO materials (user_id,title,subject_id,content,content_html,file_url,file_type,original_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id,
       title || file?.originalname || 'Untitled',
       subject_id || null,
       content || null,
       content_html || null,
       fileUrl,
       fileType,
       file?.originalname || null]
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