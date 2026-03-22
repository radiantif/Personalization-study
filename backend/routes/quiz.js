'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async function(req, res) {
  try {
    const result = await pool.query(
      `SELECT q.*, COUNT(qq.id)::int as question_count,
       (SELECT score FROM quiz_results WHERE quiz_id=q.id AND user_id=$1 ORDER BY created_at DESC LIMIT 1) as last_score,
       (SELECT total FROM quiz_results WHERE quiz_id=q.id AND user_id=$1 ORDER BY created_at DESC LIMIT 1) as last_total
       FROM quizzes q LEFT JOIN quiz_questions qq ON q.id=qq.quiz_id
       WHERE q.user_id=$1 GROUP BY q.id ORDER BY q.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async function(req, res) {
  try {
    const [quizR, questionsR] = await Promise.all([
      pool.query('SELECT * FROM quizzes WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]),
      pool.query('SELECT * FROM quiz_questions WHERE quiz_id=$1 ORDER BY id', [req.params.id])
    ]);
    if (!quizR.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json({ ...quizR.rows[0], questions: questionsR.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function extractJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text.trim()); } catch {}
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) { try { return JSON.parse(fenceMatch[1].trim()); } catch {} }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const jsonStr = text.slice(start, end + 1);
    try { return JSON.parse(jsonStr); } catch {
      try { return JSON.parse(jsonStr.replace(/,\s*([}\]])/g, '$1')); } catch {}
    }
  }
  return null;
}

router.post('/generate', async function(req, res) {
  const { subject, topic, count = 5 } = req.body;
  if (!topic || typeof topic !== 'string' || topic.trim().length < 2)
    return res.status(400).json({ error: 'Cần có chủ đề (tối thiểu 2 ký tự)' });
  const safeCount = Math.max(1, Math.min(parseInt(count) || 5, 20));
  const safeTopic = topic.trim().substring(0, 200);
  const safeSubject = subject ? String(subject).substring(0, 100) : null;

  const prompt = `Tạo ${safeCount} câu hỏi trắc nghiệm về "${safeTopic}"${safeSubject ? ' môn ' + safeSubject : ''}.

Trả về JSON theo đúng mẫu này:
{"title":"Quiz về ${safeTopic}","questions":[{"question":"Câu hỏi?","options":["A. đáp án 1","B. đáp án 2","C. đáp án 3","D. đáp án 4"],"correct":0,"explanation":"Giải thích ngắn"}]}

correct là số nguyên (0=A,1=B,2=C,3=D). Chỉ trả JSON, không có text khác.`;

  try {
    if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'Cần GROQ_API_KEY' });

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Bạn là API JSON. Chỉ trả JSON thuần túy, không markdown, không giải thích.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 3000,
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    });

    const d = await r.json();
    if (d.error) return res.status(500).json({ error: 'Groq: ' + d.error.message });

    const rawText = d.choices?.[0]?.message?.content || '';
    const quizData = extractJSON(rawText);

    if (!quizData?.questions?.length) {
      console.warn('Quiz parse failed. Raw:', rawText.substring(0, 300));
      return res.status(500).json({ error: 'AI không trả về đúng format. Hãy thử lại.' });
    }

    const quiz = await pool.query(
      'INSERT INTO quizzes (user_id,title,subject) VALUES ($1,$2,$3) RETURNING *',
      [req.user.id, quizData.title || 'Quiz: ' + safeTopic, safeSubject || 'Chung']
    );
    const qid = quiz.rows[0].id;

    for (const q of quizData.questions) {
      const options = Array.isArray(q.options) ? q.options : ['A. ?', 'B. ?', 'C. ?', 'D. ?'];
      const correct = Math.max(0, Math.min(parseInt(q.correct) || 0, options.length - 1));
      await pool.query(
        'INSERT INTO quiz_questions (quiz_id,question,options,correct_index,explanation) VALUES ($1,$2,$3,$4,$5)',
        [qid, String(q.question || '?').substring(0, 1000), JSON.stringify(options), correct, String(q.explanation || '').substring(0, 500)]
      );
    }

    const questions = await pool.query('SELECT * FROM quiz_questions WHERE quiz_id=$1 ORDER BY id', [qid]);
    res.status(201).json({ ...quiz.rows[0], questions: questions.rows });
  } catch (err) {
    console.error('Quiz generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async function(req, res) {
  try {
    await pool.query('DELETE FROM quizzes WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Đã xóa' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST save result — server validates score against DB, never trusts client
router.post('/:id/result', async function(req, res) {
  const { answers, time_seconds } = req.body;
  // answers = array of user's chosen option indices, e.g. [0, 2, 1, 3, 0]
  try {
    const questions = await pool.query(
      'SELECT id, correct_index FROM quiz_questions WHERE quiz_id=$1 ORDER BY id',
      [req.params.id]
    );
    if (!questions.rows.length) return res.status(404).json({ error: 'Quiz không tồn tại' });

    // Verify quiz belongs to this user
    const quiz = await pool.query('SELECT id FROM quizzes WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!quiz.rows.length) return res.status(403).json({ error: 'Không có quyền' });

    const total = questions.rows.length;
    let score = 0;

    if (Array.isArray(answers)) {
      questions.rows.forEach((q, i) => {
        if (answers[i] === q.correct_index) score++;
      });
    }

    await pool.query(
      'INSERT INTO quiz_results (quiz_id,user_id,score,total,time_seconds) VALUES ($1,$2,$3,$4,$5)',
      [req.params.id, req.user.id, score, total, Math.max(0, parseInt(time_seconds) || 0)]
    );

    const exp = Math.floor((score / total) * 20);
    if (exp > 0) await pool.query('UPDATE users SET exp=exp+$1 WHERE id=$2', [exp, req.user.id]);

    res.json({ success: true, score, total, exp_gained: exp });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;