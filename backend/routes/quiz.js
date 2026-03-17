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

/**
 * Cố gắng parse JSON từ text AI trả về
 * Xử lý nhiều trường hợp: JSON thuần, có markdown fence, có text thừa
 */
function extractJSON(text) {
  if (!text) return null;

  // 1. Thử parse thẳng
  try { return JSON.parse(text.trim()); } catch {}

  // 2. Tìm trong markdown code fence ```json ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }

  // 3. Tìm object { ... } đầu tiên
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const jsonStr = text.slice(start, end + 1);
    try { return JSON.parse(jsonStr); } catch {
      // 4. Clean JSON: xóa trailing comma, fix quotes
      try {
        const cleaned = jsonStr
          .replace(/,\s*([}\]])/g, '$1')  // trailing comma
          .replace(/([{,]\s*)(\w+):/g, '$1"$2":'); // unquoted keys
        return JSON.parse(cleaned);
      } catch {}
    }
  }

  return null;
}

/**
 * Parse quiz từ text AI kể cả khi AI không trả JSON
 * Fallback: tự tạo cấu trúc từ text thô
 */
function parseQuizFromText(text, topic, count) {
  const quizData = extractJSON(text);
  if (quizData && quizData.questions && quizData.questions.length > 0) {
    return quizData;
  }

  // Fallback: tạo quiz đơn giản nếu AI không trả JSON
  console.warn('AI did not return valid JSON, using fallback structure');
  return {
    title: `Quiz: ${topic}`,
    questions: [{
      question: `Không thể tạo quiz tự động. Vui lòng thử lại với chủ đề cụ thể hơn.`,
      options: ['A. Thử lại', 'B. Đổi chủ đề', 'C. Kiểm tra API', 'D. Liên hệ admin'],
      correct: 0,
      explanation: `AI trả về: ${text.substring(0, 100)}...`
    }]
  };
}

// POST generate quiz with AI
router.post('/generate', async function(req, res) {
  const { subject, topic, count = 5 } = req.body;
  if (!topic) return res.status(400).json({ error: 'Cần có chủ đề' });

  // Prompt rất đơn giản và rõ ràng để tránh AI trả text thừa
  const prompt = `Tạo ${count} câu hỏi trắc nghiệm về "${topic}"${subject ? ' môn ' + subject : ''}.

Trả về JSON theo đúng mẫu này:
{
  "title": "Quiz về ${topic}",
  "questions": [
    {
      "question": "Câu hỏi ở đây?",
      "options": ["A. đáp án 1", "B. đáp án 2", "C. đáp án 3", "D. đáp án 4"],
      "correct": 0,
      "explanation": "Giải thích ngắn"
    }
  ]
}

Chú ý: correct là số (0=A, 1=B, 2=C, 3=D). Chỉ trả JSON, không có text khác.`;

  try {
    if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'Cần GROQ_API_KEY' });

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'Bạn là API trả về JSON. Chỉ trả về JSON thuần túy, không có text, không có markdown, không có giải thích.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 3000,
        temperature: 0.3,
        response_format: { type: 'json_object' } // Force JSON mode nếu model hỗ trợ
      })
    });

    const d = await r.json();
    if (d.error) return res.status(500).json({ error: 'Groq: ' + d.error.message });

    const rawText = d.choices?.[0]?.message?.content || '';
    console.log('Raw AI response (first 200):', rawText.substring(0, 200));

    const quizData = parseQuizFromText(rawText, topic, count);

    // Lưu vào DB
    const quiz = await pool.query(
      'INSERT INTO quizzes (user_id,title,subject) VALUES ($1,$2,$3) RETURNING *',
      [req.user.id, quizData.title || 'Quiz: ' + topic, subject || 'Chung']
    );
    const qid = quiz.rows[0].id;

    for (const q of quizData.questions) {
      // Đảm bảo options là array
      let options = q.options;
      if (!Array.isArray(options)) {
        options = ['A. ?', 'B. ?', 'C. ?', 'D. ?'];
      }
      // Đảm bảo correct là số
      let correct = parseInt(q.correct);
      if (isNaN(correct)) correct = 0;

      await pool.query(
        'INSERT INTO quiz_questions (quiz_id,question,options,correct_index,explanation) VALUES ($1,$2,$3,$4,$5)',
        [qid, q.question || '?', JSON.stringify(options), correct, q.explanation || '']
      );
    }

    const questions = await pool.query('SELECT * FROM quiz_questions WHERE quiz_id=$1 ORDER BY id', [qid]);
    res.status(201).json({ ...quiz.rows[0], questions: questions.rows });

  } catch (err) {
    console.error('Quiz generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
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
    await pool.query(
      'INSERT INTO quiz_results (quiz_id,user_id,score,total,time_seconds) VALUES ($1,$2,$3,$4,$5)',
      [req.params.id, req.user.id, score, total, time_seconds || 0]
    );
    const exp = Math.floor((score / total) * 20);
    await pool.query('UPDATE users SET exp=exp+$1 WHERE id=$2', [exp, req.user.id]);
    res.json({ success: true, exp_gained: exp });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;