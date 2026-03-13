'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async function(req, res) {
  try {
    const result = await pool.query('SELECT id,title,subject,created_at,updated_at FROM chat_sessions WHERE user_id=$1 ORDER BY updated_at DESC', [req.user.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async function(req, res) {
  try {
    const result = await pool.query('SELECT * FROM chat_sessions WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async function(req, res) {
  const { title, subject, messages } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO chat_sessions (user_id,title,subject,messages) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.id, title || 'Cuộc trò chuyện mới', subject || 'Chung', JSON.stringify(messages || [])]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async function(req, res) {
  const { title, messages } = req.body;
  try {
    const result = await pool.query(
      'UPDATE chat_sessions SET title=$1,messages=$2,updated_at=NOW() WHERE id=$3 AND user_id=$4 RETURNING *',
      [title, JSON.stringify(messages), req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async function(req, res) {
  try {
    await pool.query('DELETE FROM chat_sessions WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Đã xóa' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;