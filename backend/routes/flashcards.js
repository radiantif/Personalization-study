'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');
const crypto = require('crypto');

function generateShareCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// GET all flashcards
router.get('/', async function(req, res) {
  const { subject } = req.query;
  try {
    let query = 'SELECT * FROM flashcards WHERE user_id=$1 ORDER BY created_at DESC';
    let params = [req.user.id];
    if (subject) { query += ' AND subject=$2'; params.push(subject); }
    res.json((await pool.query(query, params)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET shared deck by code (public)
router.get('/shared/:code', async function(req, res) {
  try {
    const result = await pool.query(
      `SELECT f.*, u.name as creator_name FROM flashcards f
       JOIN users u ON f.user_id=u.id
       WHERE f.share_code=$1 AND f.is_public=true`,
      [req.params.code.toUpperCase()]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create flashcard
router.post('/', async function(req, res) {
  const { question, answer, subject } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'Cần câu hỏi và câu trả lời' });
  try {
    const result = await pool.query(
      'INSERT INTO flashcards (user_id,question,answer,subject) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.id, question, answer, subject || 'General']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST bulk create (from AI generation)
router.post('/bulk', async function(req, res) {
  const { flashcards, subject } = req.body;
  if (!flashcards || !flashcards.length) return res.status(400).json({ error: 'Không có flashcard' });
  try {
    const created = [];
    for (const fc of flashcards) {
      const result = await pool.query(
        'INSERT INTO flashcards (user_id,question,answer,subject) VALUES ($1,$2,$3,$4) RETURNING *',
        [req.user.id, fc.question, fc.answer, subject || fc.subject || 'General']
      );
      created.push(result.rows[0]);
    }
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST toggle share
router.post('/:id/share', async function(req, res) {
  try {
    const fc = await pool.query('SELECT * FROM flashcards WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!fc.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    const current = fc.rows[0];
    const newPublic = !current.is_public;
    const shareCode = newPublic ? (current.share_code || generateShareCode()) : current.share_code;
    const result = await pool.query(
      'UPDATE flashcards SET is_public=$1, share_code=$2 WHERE id=$3 RETURNING *',
      [newPublic, shareCode, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE flashcard
router.delete('/:id', async function(req, res) {
  try {
    await pool.query('DELETE FROM flashcards WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Đã xóa' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;