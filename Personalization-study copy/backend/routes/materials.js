// routes/materials.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../db');
const { v4: uuidv4 } = require('uuid');

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

// GET all subjects
router.get('/subjects', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM subjects ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create subject
router.post('/subjects', async (req, res) => {
  const { name, color, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const result = await pool.query(
      'INSERT INTO subjects (name, color, icon) VALUES ($1, $2, $3) RETURNING *',
      [name, color || '#6366f1', icon || '📁']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all materials (optionally by subject)
router.get('/', async (req, res) => {
  const { subject_id } = req.query;
  try {
    let query = `SELECT m.*, s.name as subject_name, s.color as subject_color 
                 FROM materials m LEFT JOIN subjects s ON m.subject_id=s.id 
                 ORDER BY m.created_at DESC`;
    let params = [];
    if (subject_id) {
      query = `SELECT m.*, s.name as subject_name, s.color as subject_color 
               FROM materials m LEFT JOIN subjects s ON m.subject_id=s.id 
               WHERE m.subject_id=$1 ORDER BY m.created_at DESC`;
      params = [subject_id];
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload material
router.post('/', upload.single('file'), async (req, res) => {
  const { title, subject_id, content, type } = req.body;
  const file = req.file;

  try {
    let fileUrl = null;
    let fileType = type || 'note';

    if (file) {
      fileUrl = `/uploads/${file.filename}`;
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.pdf') fileType = 'pdf';
      else if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) fileType = 'image';
    }

    const result = await pool.query(
      `INSERT INTO materials (title, subject_id, content, file_url, file_type, original_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title || file?.originalname || 'Untitled', subject_id || null,
       content || null, fileUrl, fileType, file?.originalname || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE material
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM materials WHERE id=$1', [id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
