// routes/sessions.js
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET stats summary
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const todayResult = await pool.query(
      `SELECT COALESCE(SUM(duration_minutes), 0) as today_minutes
       FROM study_sessions
       WHERE date_trunc('day', started_at) = $1::date`,
      [today]
    );

    const weekResult = await pool.query(
      `SELECT COALESCE(SUM(duration_minutes), 0) as week_minutes
       FROM study_sessions
       WHERE started_at >= NOW() - INTERVAL '7 days'`
    );

    const subjectResult = await pool.query(
      `SELECT subject, SUM(duration_minutes) as total
       FROM study_sessions
       WHERE subject IS NOT NULL
       GROUP BY subject
       ORDER BY total DESC
       LIMIT 5`
    );

    const dailyResult = await pool.query(
      `SELECT date_trunc('day', started_at)::date as day,
              SUM(duration_minutes) as minutes
       FROM study_sessions
       WHERE started_at >= NOW() - INTERVAL '7 days'
       GROUP BY day
       ORDER BY day ASC`
    );

    const todayMin = parseInt(todayResult.rows[0].today_minutes);
    const weekMin = parseInt(weekResult.rows[0].week_minutes);

    res.json({
      today: { hours: Math.floor(todayMin / 60), minutes: todayMin % 60 },
      week: { hours: Math.floor(weekMin / 60), minutes: weekMin % 60 },
      subjects: subjectResult.rows,
      daily: dailyResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all sessions
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM study_sessions ORDER BY started_at DESC LIMIT 50'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST log session
router.post('/', async (req, res) => {
  const { subject, duration_minutes, note } = req.body;
  if (!duration_minutes) return res.status(400).json({ error: 'Duration required' });
  try {
    const result = await pool.query(
      `INSERT INTO study_sessions (subject, duration_minutes, note, started_at)
       VALUES ($1, $2, $3, NOW()) RETURNING *`,
      [subject || null, duration_minutes, note || null]
    );

    // Update user total hours
    await pool.query(
      `UPDATE users SET total_study_hours = total_study_hours + $1 / 60.0
       WHERE id = 1`,
      [duration_minutes]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
