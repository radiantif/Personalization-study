// routes/flashcards.js
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET all flashcards (optionally filter by subject)
router.get('/', async (req, res) => {
  const { subject } = req.query;
  try {
    let query = 'SELECT * FROM flashcards ORDER BY created_at DESC';
    let params = [];
    if (subject) {
      query = 'SELECT * FROM flashcards WHERE subject=$1 ORDER BY created_at DESC';
      params = [subject];
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create flashcard
router.post('/', async (req, res) => {
  const { question, answer, subject } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'Question and answer required' });
  try {
    const result = await pool.query(
      'INSERT INTO flashcards (question, answer, subject) VALUES ($1, $2, $3) RETURNING *',
      [question, answer, subject || 'General']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update flashcard
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { question, answer, subject } = req.body;
  try {
    const result = await pool.query(
      'UPDATE flashcards SET question=$1, answer=$2, subject=$3, updated_at=NOW() WHERE id=$4 RETURNING *',
      [question, answer, subject, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Flashcard not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE flashcard
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM flashcards WHERE id=$1', [id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
