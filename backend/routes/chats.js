'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET all chat sessions
router.get('/', async function(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, title, subject, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single chat with messages
router.get('/:id', async function(req, res) {
  try {
    const result = await pool.query('SELECT * FROM chat_sessions WHERE id=$1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Chat not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create new chat session
router.post('/', async function(req, res) {
  const { title, subject, messages } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO chat_sessions (title, subject, messages) VALUES ($1, $2, $3) RETURNING *',
      [title || 'Cuộc trò chuyện mới', subject || 'Chung', JSON.stringify(messages || [])]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update chat messages
router.put('/:id', async function(req, res) {
  const { title, messages } = req.body;
  try {
    const result = await pool.query(
      'UPDATE chat_sessions SET title=$1, messages=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [title, JSON.stringify(messages), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Chat not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE chat session
router.delete('/:id', async function(req, res) {
  try {
    await pool.query('DELETE FROM chat_sessions WHERE id=$1', [req.params.id]);
    res.json({ message: 'Đã xóa' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;