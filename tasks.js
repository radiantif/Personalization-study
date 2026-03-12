// routes/tasks.js
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET all tasks
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tasks ORDER BY sort_order ASC, created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create task
router.post('/', async (req, res) => {
  const { title, subject, deadline } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  try {
    const result = await pool.query(
      `INSERT INTO tasks (title, subject, deadline, completed, sort_order)
       VALUES ($1, $2, $3, false, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks))
       RETURNING *`,
      [title, subject || null, deadline || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update task
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, subject, deadline, completed, sort_order } = req.body;
  try {
    const result = await pool.query(
      `UPDATE tasks
       SET title=$1, subject=$2, deadline=$3, completed=$4, sort_order=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [title, subject, deadline, completed, sort_order, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH toggle complete
router.patch('/:id/toggle', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE tasks SET completed = NOT completed, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE task
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM tasks WHERE id=$1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted', task: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT reorder tasks
router.put('/reorder/bulk', async (req, res) => {
  const { tasks } = req.body; // [{id, sort_order}]
  try {
    const client = await pool.connect();
    await client.query('BEGIN');
    for (const t of tasks) {
      await client.query('UPDATE tasks SET sort_order=$1 WHERE id=$2', [t.sort_order, t.id]);
    }
    await client.query('COMMIT');
    client.release();
    res.json({ message: 'Reordered successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
