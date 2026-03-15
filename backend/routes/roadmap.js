'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET all roadmaps
router.get('/', async function(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM roadmaps WHERE user_id=$1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET roadmap detail
router.get('/:id', async function(req, res) {
  try {
    const r = await pool.query('SELECT * FROM roadmaps WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST generate roadmap with AI
router.post('/generate', async function(req, res) {
  const { goal, subject, level, weeks, current_level } = req.body;
  if (!goal) return res.status(400).json({ error: 'Cần mục tiêu' });

  const prompt = `Tạo lộ trình học tập chi tiết bằng tiếng Việt cho mục tiêu: "${goal}"
Môn học: ${subject || 'Chung'}
Cấp độ hiện tại: ${current_level || 'Trung bình'}
Cấp độ mục tiêu: ${level || 'THPT'}
Số tuần: ${weeks || 8}

Trả về JSON đúng format sau (KHÔNG thêm text ngoài JSON):
{
  "title": "Tên lộ trình ngắn gọn",
  "description": "Mô tả tổng quan 1-2 câu",
  "total_weeks": ${weeks || 8},
  "weeks": [
    {
      "week": 1,
      "theme": "Chủ đề tuần",
      "goals": ["Mục tiêu 1", "Mục tiêu 2"],
      "tasks": [
        {"title": "Tên task", "type": "study|practice|review|test", "duration_mins": 60, "description": "Mô tả ngắn"}
      ],
      "resources": ["Tài liệu gợi ý 1", "Tài liệu 2"]
    }
  ],
  "tips": ["Mẹo học tập 1", "Mẹo 2", "Mẹo 3"]
}`;

  try {
    if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'Cần GROQ_API_KEY' });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000, temperature: 0.6
      })
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'AI không trả về đúng format' });

    const roadmapData = JSON.parse(match[0]);

    const saved = await pool.query(
      `INSERT INTO roadmaps (user_id, title, description, subject, goal, level, total_weeks, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, roadmapData.title, roadmapData.description, subject||'Chung',
       goal, level||'THPT', roadmapData.total_weeks, JSON.stringify(roadmapData)]
    );

    res.status(201).json(saved.rows[0]);
  } catch (err) {
    console.error('Roadmap error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH update week progress
router.patch('/:id/progress', async function(req, res) {
  const { week, completed } = req.body;
  try {
    const r = await pool.query('SELECT * FROM roadmaps WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    let progress = r.rows[0].progress || {};
    progress[`week_${week}`] = completed;
    await pool.query('UPDATE roadmaps SET progress=$1 WHERE id=$2', [JSON.stringify(progress), req.params.id]);
    res.json({ success: true, progress });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE roadmap
router.delete('/:id', async function(req, res) {
  try {
    await pool.query('DELETE FROM roadmaps WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Đã xóa' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;