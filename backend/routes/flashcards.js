'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');
const crypto = require('crypto');

const MAX_BULK = 50;

function generateShareCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

router.get('/', async function(req, res) {
  const { subject } = req.query;
  try {
    let query = 'SELECT * FROM flashcards WHERE user_id=$1 ORDER BY created_at DESC';
    let params = [req.user.id];
    if (subject && typeof subject === 'string') {
      query = 'SELECT * FROM flashcards WHERE user_id=$1 AND subject=$2 ORDER BY created_at DESC';
      params = [req.user.id, subject];
    }
    res.json((await pool.query(query, params)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/shared/:code', async function(req, res) {
  try {
    const result = await pool.query(
      `SELECT f.id, f.question, f.answer, f.subject, u.name as creator_name
       FROM flashcards f JOIN users u ON f.user_id=u.id
       WHERE f.share_code=$1 AND f.is_public=true`,
      [req.params.code.toUpperCase()]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async function(req, res) {
  const { question, answer, subject } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'Cần câu hỏi và câu trả lời' });
  if (String(question).length > 2000 || String(answer).length > 2000)
    return res.status(400).json({ error: 'Câu hỏi/đáp án tối đa 2000 ký tự' });
  try {
    const result = await pool.query(
      'INSERT INTO flashcards (user_id,question,answer,subject) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.id, question, answer, subject || 'General']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk create — single query instead of N round-trips
router.post('/bulk', async function(req, res) {
  const { flashcards, subject } = req.body;
  if (!Array.isArray(flashcards) || flashcards.length === 0)
    return res.status(400).json({ error: 'Không có flashcard' });
  if (flashcards.length > MAX_BULK)
    return res.status(400).json({ error: `Tối đa ${MAX_BULK} flashcard mỗi lần` });

  // Validate each card
  for (const fc of flashcards) {
    if (!fc.question || !fc.answer) return res.status(400).json({ error: 'Mỗi flashcard cần câu hỏi và đáp án' });
  }

  try {
    // Build single multi-row INSERT
    const placeholders = flashcards.map((_, i) => `($1,$${i*3+2},$${i*3+3},$${i*3+4})`).join(',');
    const values = [req.user.id, ...flashcards.flatMap(fc => [
      String(fc.question).substring(0, 2000),
      String(fc.answer).substring(0, 2000),
      subject || fc.subject || 'General'
    ])];
    const result = await pool.query(
      `INSERT INTO flashcards (user_id,question,answer,subject) VALUES ${placeholders} RETURNING *`,
      values
    );
    res.status(201).json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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

router.delete('/:id', async function(req, res) {
  try {
    await pool.query('DELETE FROM flashcards WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Đã xóa' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;