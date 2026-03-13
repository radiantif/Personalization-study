'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async function(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM tasks WHERE user_id=$1 ORDER BY sort_order ASC, created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async function(req, res) {
  const { title, subject, deadline } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  try {
    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, subject, deadline, completed, sort_order)
       VALUES ($1, $2, $3, $4, false, (SELECT COALESCE(MAX(sort_order),0)+1 FROM tasks WHERE user_id=$1))
       RETURNING *`,
      [req.user.id, title, subject || null, deadline || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/reorder/bulk', async function(req, res) {
  const { tasks } = req.body;
  try {
    const client = await pool.connect();
    await client.query('BEGIN');
    for (var i = 0; i < tasks.length; i++) {
      await client.query('UPDATE tasks SET sort_order=$1 WHERE id=$2 AND user_id=$3', [tasks[i].sort_order, tasks[i].id, req.user.id]);
    }
    await client.query('COMMIT');
    client.release();
    res.json({ message: 'Reordered' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async function(req, res) {
  const { title, subject, deadline, completed, sort_order } = req.body;
  try {
    const result = await pool.query(
      `UPDATE tasks SET title=$1,subject=$2,deadline=$3,completed=$4,sort_order=$5,updated_at=NOW()
       WHERE id=$6 AND user_id=$7 RETURNING *`,
      [title, subject, deadline, completed, sort_order, req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/toggle', async function(req, res) {
  try {
    const result = await pool.query(
      'UPDATE tasks SET completed=NOT completed, updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async function(req, res) {
  try {
    await pool.query('DELETE FROM tasks WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;