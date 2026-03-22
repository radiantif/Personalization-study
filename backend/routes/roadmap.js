'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

function extractJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text.trim()); } catch {}
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) { try { return JSON.parse(fenceMatch[1].trim()); } catch {} }
  // Find outermost { } reliably using a stack
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const jsonStr = text.slice(start, i + 1);
        try { return JSON.parse(jsonStr); } catch {
          try { return JSON.parse(jsonStr.replace(/,\s*([}\]])/g, '$1')); } catch {}
        }
      }
    }
  }
  return null;
}

router.get('/', async function(req, res) {
  try {
    res.json((await pool.query('SELECT * FROM roadmaps WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id])).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async function(req, res) {
  try {
    const r = await pool.query('SELECT * FROM roadmaps WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/generate', async function(req, res) {
  const { goal, subject, level, weeks, current_level } = req.body;
  if (!goal || typeof goal !== 'string' || goal.trim().length < 5)
    return res.status(400).json({ error: 'Cần mục tiêu học tập (tối thiểu 5 ký tự)' });

  // Sanitize inputs — limit length to prevent prompt injection blowup
  const safeGoal = goal.trim().substring(0, 300);
  const safeSubject = subject ? String(subject).substring(0, 100) : 'Chung';
  const safeLevel = ['THCS','THPT','Đại học','Chung'].includes(level) ? level : 'THPT';
  const safeWeeks = Math.max(1, Math.min(parseInt(weeks) || 8, 24));
  const safeCurrentLevel = current_level ? String(current_level).substring(0, 100) : 'Trung bình';

  // Wrap user content in clear delimiters to prevent injection
  const prompt = `Tạo lộ trình học tập bằng tiếng Việt với thông tin sau:
- Mục tiêu: [${safeGoal}]
- Môn: ${safeSubject}
- Cấp hiện tại: ${safeCurrentLevel}
- Cấp mục tiêu: ${safeLevel}
- Số tuần: ${safeWeeks}

Trả về JSON thuần, không có text khác:
{"title":"...","description":"...","total_weeks":${safeWeeks},"weeks":[{"week":1,"theme":"...","goals":["..."],"tasks":[{"title":"...","type":"study","duration_mins":60,"description":"..."}],"resources":["..."]}],"tips":["..."]}`;

  try {
    if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'Cần GROQ_API_KEY' });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Bạn là API JSON. Chỉ trả JSON thuần túy.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 4000,
        temperature: 0.6,
        response_format: { type: 'json_object' }
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: 'Groq: ' + data.error.message });

    const rawText = data.choices?.[0]?.message?.content || '';
    const roadmapData = extractJSON(rawText);
    if (!roadmapData?.weeks) return res.status(500).json({ error: 'AI không trả về đúng format. Thử lại.' });

    // Use transaction — insert only after validation succeeds
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const saved = await client.query(
        `INSERT INTO roadmaps (user_id, title, description, subject, goal, level, total_weeks, data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          req.user.id,
          String(roadmapData.title || 'Lộ trình: ' + safeGoal).substring(0, 200),
          String(roadmapData.description || '').substring(0, 500),
          safeSubject, safeGoal, safeLevel, safeWeeks,
          JSON.stringify(roadmapData)
        ]
      );
      await client.query('COMMIT');
      res.status(201).json(saved.rows[0]);
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Roadmap error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/progress', async function(req, res) {
  const { week, completed } = req.body;
  if (week === undefined || typeof completed !== 'boolean')
    return res.status(400).json({ error: 'Cần week và completed (boolean)' });
  try {
    const r = await pool.query('SELECT progress FROM roadmaps WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    const progress = r.rows[0].progress || {};
    progress[`week_${parseInt(week)}`] = completed;
    await pool.query('UPDATE roadmaps SET progress=$1 WHERE id=$2', [JSON.stringify(progress), req.params.id]);
    res.json({ success: true, progress });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async function(req, res) {
  try {
    await pool.query('DELETE FROM roadmaps WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Đã xóa' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;