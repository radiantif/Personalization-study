// routes/profile.js
const express = require('express');
const router = express.Router();
const pool = require('../db');

const DEFAULT_USER_ID = 1; // Single-user app

// GET profile
router.get('/', async (req, res) => {
  try {
    let result = await pool.query('SELECT * FROM users WHERE id=$1', [DEFAULT_USER_ID]);
    if (result.rows.length === 0) {
      // Auto-create default profile
      result = await pool.query(
        `INSERT INTO users (id, name, avatar, level, exp, total_study_hours, exam_date)
         VALUES ($1, 'Student', '🎓', 1, 0, 0, NOW() + INTERVAL '120 days')
         RETURNING *`,
        [DEFAULT_USER_ID]
      );
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / PUT update profile
router.post('/', async (req, res) => {
  const { name, avatar, exam_date, target_subject } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO users (id, name, avatar, exam_date, target_subject)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
       SET name=$2, avatar=$3, exam_date=$4, target_subject=$5, updated_at=NOW()
       RETURNING *`,
      [DEFAULT_USER_ID, name, avatar, exam_date, target_subject]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add EXP
router.post('/exp', async (req, res) => {
  const { amount } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users
       SET exp = exp + $1,
           level = CASE WHEN (exp + $1) >= level * 100 THEN level + 1 ELSE level END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [amount || 10, DEFAULT_USER_ID]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
