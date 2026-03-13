'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/stats', async function(req, res) {
  const uid = req.user.id;
  try {
    const today = new Date().toISOString().split('T')[0];
    const todayR = await pool.query('SELECT COALESCE(SUM(duration_minutes),0) as m FROM study_sessions WHERE user_id=$1 AND date_trunc(\'day\',started_at)=$2::date', [uid, today]);
    const weekR = await pool.query('SELECT COALESCE(SUM(duration_minutes),0) as m FROM study_sessions WHERE user_id=$1 AND started_at>=NOW()-INTERVAL \'7 days\'', [uid]);
    const subjR = await pool.query('SELECT subject,SUM(duration_minutes) as total FROM study_sessions WHERE user_id=$1 AND subject IS NOT NULL GROUP BY subject ORDER BY total DESC LIMIT 5', [uid]);
    const dailyR = await pool.query('SELECT date_trunc(\'day\',started_at)::date as day,SUM(duration_minutes) as minutes FROM study_sessions WHERE user_id=$1 AND started_at>=NOW()-INTERVAL \'7 days\' GROUP BY day ORDER BY day ASC', [uid]);
    const tm = parseInt(todayR.rows[0].m), wm = parseInt(weekR.rows[0].m);
    res.json({ today:{hours:Math.floor(tm/60),minutes:tm%60}, week:{hours:Math.floor(wm/60),minutes:wm%60}, subjects:subjR.rows, daily:dailyR.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async function(req, res) {
  const { subject, duration_minutes, note } = req.body;
  if (!duration_minutes) return res.status(400).json({ error: 'Duration required' });
  try {
    const result = await pool.query(
      'INSERT INTO study_sessions (user_id,subject,duration_minutes,note) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.id, subject || null, duration_minutes, note || null]
    );
    await pool.query('UPDATE users SET total_study_hours=total_study_hours+$1/60.0 WHERE id=$2', [duration_minutes, req.user.id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;