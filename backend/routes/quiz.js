'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET all quizzes
router.get('/', async function(req, res) {
  try {
    const result = await pool.query(
      `SELECT q.*, COUNT(qq.id) as question_count,
       (SELECT score FROM quiz_results WHERE quiz_id=q.id AND user_id=$1 ORDER BY created_at DESC LIMIT 1) as last_score,
       (SELECT total FROM quiz_results WHERE quiz_id=q.id AND user_id=$1 ORDER BY created_at DESC LIMIT 1) as last_total
       FROM quizzes q LEFT JOIN quiz_questions qq ON q.id=qq.quiz_id
       WHERE q.user_id=$1 GROUP BY q.id ORDER BY q.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET quiz with questions
router.get('/:id', async function(req, res) {
  try {
    const quiz = await pool.query('SELECT * FROM quizzes WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!quiz.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    const questions = await pool.query('SELECT * FROM quiz_questions WHERE quiz_id=$1 ORDER BY id', [req.params.id]);
    res.json({ ...quiz.rows[0], questions: questions.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST generate quiz with AI
router.post('/generate', async function(req, res) {
  const { subject, topic, count = 5 } = req.body;
  if (!topic) return res.status(400).json({ error: 'Cần có chủ đề' });

  const prompt = `Tạo ${count} câu hỏi trắc nghiệm bằng tiếng Việt về chủ đề "${topic}" môn ${subject || 'chung'}.

QUAN TRỌNG: Chỉ trả về JSON thuần túy, KHÔNG có text trước hoặc sau, KHÔNG có markdown, KHÔNG có \`\`\`.

Format JSON bắt buộc:
{"title":"Tên quiz","questions":[{"question":"Câu hỏi?","options":["A. lựa chọn 1","B. lựa chọn 2","C. lựa chọn 3","D. lựa chọn 4"],"correct":0,"explanation":"Giải thích"}]}

Lưu ý:
- "correct" là số nguyên: 0=A, 1=B, 2=C, 3=D
- Mỗi options phải bắt đầu bằng "A. ", "B. ", "C. ", "D. "
- Chỉ trả về JSON, không thêm gì khác`;

  try {
    let quizData = null;
    if (process.env.GROQ_API_KEY) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 2000, temperature: 0.5 })
      });
      const d = await r.json();
      const text = d.choices?.[0]?.message?.content || '';
      // Thử nhiều cách parse khác nhau
      let jsonStr = null;
      // Tìm JSON block trong markdown code fence
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonStr = fenceMatch[1].trim();
      // Hoặc tìm { ... } trực tiếp
      if (!jsonStr) {
        const objMatch = text.match(/\{[\s\S]*\}/);
        if (objMatch) jsonStr = objMatch[0];
      }
      if (jsonStr) {
        try { quizData = JSON.parse(jsonStr); }
        catch (parseErr) {
          // Thử clean JSON: xóa trailing comma
          const cleaned = jsonStr.replace(/,\s*([}\]])/g, '$1');
          quizData = JSON.parse(cleaned);
        }
      }
    }
    if (!quizData) return res.status(500).json({ error: 'Không thể tạo quiz. Kiểm tra GROQ_API_KEY.' });

    const quiz = await pool.query('INSERT INTO quizzes (user_id,title,subject) VALUES ($1,$2,$3) RETURNING *',
      [req.user.id, quizData.title || `Quiz: ${topic}`, subject || 'Chung']);
    const qid = quiz.rows[0].id;
    for (const q of quizData.questions) {
      await pool.query('INSERT INTO quiz_questions (quiz_id,question,options,correct_index,explanation) VALUES ($1,$2,$3,$4,$5)',
        [qid, q.question, JSON.stringify(q.options), q.correct, q.explanation || '']);
    }
    const questions = await pool.query('SELECT * FROM quiz_questions WHERE quiz_id=$1 ORDER BY id', [qid]);
    res.status(201).json({ ...quiz.rows[0], questions: questions.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE quiz
router.delete('/:id', async function(req, res) {
  try {
    await pool.query('DELETE FROM quizzes WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Đã xóa' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST save result
router.post('/:id/result', async function(req, res) {
  const { score, total, time_seconds } = req.body;
  try {
    await pool.query('INSERT INTO quiz_results (quiz_id,user_id,score,total,time_seconds) VALUES ($1,$2,$3,$4,$5)',
      [req.params.id, req.user.id, score, total, time_seconds || 0]);
    const exp = Math.floor((score / total) * 20);
    await pool.query('UPDATE users SET exp=exp+$1 WHERE id=$2', [exp, req.user.id]);
    res.json({ success: true, exp_gained: exp });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;