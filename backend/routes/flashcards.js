'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async function(req, res) {
  const { subject } = req.query;
  try {
    let query = 'SELECT * FROM flashcards WHERE user_id=$1 ORDER BY created_at DESC';
    let params = [req.user.id];
    if (subject) { query = 'SELECT * FROM flashcards WHERE user_id=$1 AND subject=$2 ORDER BY created_at DESC'; params = [req.user.id, subject]; }
    res.json((await pool.query(query, params)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async function(req, res) {
  const { question, answer, subject } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'Question and answer required' });
  try {
    const result = await pool.query(
      'INSERT INTO flashcards (user_id, question, answer, subject) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.id, question, answer, subject || 'General']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async function(req, res) {
  try {
    await pool.query('DELETE FROM flashcards WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;