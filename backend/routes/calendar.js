'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET events by month
router.get('/', async function(req, res) {
  const { month, year } = req.query;
  try {
    let query = 'SELECT * FROM calendar_events WHERE user_id=$1 ORDER BY event_date ASC, event_time ASC';
    let params = [req.user.id];
    if (month && year) {
      query = 'SELECT * FROM calendar_events WHERE user_id=$1 AND EXTRACT(MONTH FROM event_date)=$2 AND EXTRACT(YEAR FROM event_date)=$3 ORDER BY event_date ASC, event_time ASC';
      params = [req.user.id, month, year];
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET upcoming events (next 7 days)
router.get('/upcoming', async function(req, res) {
  try {
    const result = await pool.query(
      `SELECT * FROM calendar_events WHERE user_id=$1
       AND event_date >= CURRENT_DATE AND event_date <= CURRENT_DATE + INTERVAL '7 days'
       AND completed=false ORDER BY event_date ASC, event_time ASC LIMIT 10`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create event
router.post('/', async function(req, res) {
  const { title, description, subject, event_date, event_time, type, color } = req.body;
  if (!title || !event_date) return res.status(400).json({ error: 'Cần có tiêu đề và ngày' });
  try {
    const result = await pool.query(
      `INSERT INTO calendar_events (user_id,title,description,subject,event_date,event_time,type,color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, title, description||null, subject||null, event_date, event_time||null, type||'study', color||'#7c6fff']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update event
router.put('/:id', async function(req, res) {
  const { title, description, subject, event_date, event_time, type, color, completed } = req.body;
  try {
    const result = await pool.query(
      `UPDATE calendar_events SET title=$1,description=$2,subject=$3,event_date=$4,event_time=$5,type=$6,color=$7,completed=$8
       WHERE id=$9 AND user_id=$10 RETURNING *`,
      [title, description, subject, event_date, event_time, type, color, completed, req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE event
router.delete('/:id', async function(req, res) {
  try {
    await pool.query('DELETE FROM calendar_events WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Đã xóa' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;