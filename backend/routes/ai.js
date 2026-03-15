'use strict';
const express = require('express');
const router = express.Router();

const SUBJECT_PROMPTS = {
  'Toán': 'Bạn là gia sư Toán học chuyên nghiệp. Giải từng bước rõ ràng, trình bày công thức đẹp. Trả lời bằng tiếng Việt.',
  'Lý': 'Bạn là gia sư Vật lý chuyên nghiệp. Nêu công thức, đơn vị đo, giải bài tập từng bước. Trả lời bằng tiếng Việt.',
  'Hóa': 'Bạn là gia sư Hóa học chuyên nghiệp. Viết phương trình phản ứng rõ ràng và giải thích cơ chế. Trả lời bằng tiếng Việt.',
  'Văn': 'Bạn là gia sư Ngữ văn chuyên nghiệp. Giúp phân tích tác phẩm, làm văn nghị luận sâu sắc. Trả lời bằng tiếng Việt.',
  'Ngoại ngữ 1': 'Bạn là gia sư Tiếng Anh chuyên nghiệp. Giải thích bằng tiếng Việt, ví dụ bằng tiếng Anh.',
  'Lịch sử': 'Bạn là gia sư Lịch sử chuyên nghiệp. Kể chuyện lịch sử sinh động và dễ nhớ. Trả lời bằng tiếng Việt.',
  'Sinh': 'Bạn là gia sư Sinh học chuyên nghiệp. Giải thích các quá trình sinh học rõ ràng. Trả lời bằng tiếng Việt.',
  'Chung': 'Bạn là gia sư học tập AI thân thiện. Hỗ trợ tất cả môn học, giải thích rõ ràng với ví dụ thực tế. Luôn trả lời bằng tiếng Việt.',
};

async function callGroq(messages, maxTokens = 1024) {
  if (!process.env.GROQ_API_KEY) return null;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: maxTokens, temperature: 0.7 })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content || null;
}

// ── Chat ──────────────────────────────────────────────
router.post('/chat', async function(req, res) {
  const { message, history = [], subject = 'Chung' } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  const systemPrompt = SUBJECT_PROMPTS[subject] || SUBJECT_PROMPTS['Chung'];
  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(function(h) { return { role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content }; }),
      { role: 'user', content: message }
    ];
    const reply = await callGroq(messages);
    if (reply) return res.json({ reply });
    // Fallback
    res.json({ reply: 'Câu hỏi hay! Bạn đang học môn ' + subject + '. Hãy cho tôi biết thêm chi tiết nhé! 😊' });
  } catch (err) {
    console.error('AI chat error:', err.message);
    res.status(500).json({ error: 'AI service error', reply: 'Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại!' });
  }
});

// ── Generate flashcards from text ─────────────────────
router.post('/generate-flashcards', async function(req, res) {
  const { text, subject, count = 8 } = req.body;
  if (!text || text.trim().length < 50) return res.status(400).json({ error: 'Văn bản quá ngắn (cần ít nhất 50 ký tự)' });

  const prompt = `Đọc đoạn văn bản sau và tạo ${count} flashcard học tập bằng tiếng Việt.
Trả về ĐÚNG format JSON, không thêm text nào khác:
{"flashcards":[{"question":"Câu hỏi?","answer":"Câu trả lời ngắn gọn"}]}

Văn bản:
${text.substring(0, 3000)}`;

  try {
    const result = await callGroq([{ role: 'user', content: prompt }], 2000);
    if (!result) return res.status(500).json({ error: 'Không thể tạo flashcard' });
    const m = result.match(/\{[\s\S]*\}/);
    if (!m) return res.status(500).json({ error: 'AI trả về không đúng format' });
    const data = JSON.parse(m[0]);
    res.json({ flashcards: data.flashcards || [], subject: subject || 'Chung' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Summarize text/PDF content ────────────────────────
router.post('/summarize', async function(req, res) {
  const { text, title } = req.body;
  if (!text || text.trim().length < 100) return res.status(400).json({ error: 'Văn bản quá ngắn' });

  const prompt = `Tóm tắt tài liệu "${title || 'tài liệu'}" sau đây bằng tiếng Việt.
Trả về JSON format sau, không thêm text khác:
{
  "summary": "Tóm tắt tổng quan 2-3 câu",
  "key_points": ["điểm chính 1", "điểm chính 2", "điểm chính 3"],
  "keywords": ["từ khóa 1", "từ khóa 2", "từ khóa 3"],
  "difficulty": "Dễ|Trung bình|Khó"
}

Văn bản:
${text.substring(0, 4000)}`;

  try {
    const result = await callGroq([{ role: 'user', content: prompt }], 1500);
    if (!result) return res.status(500).json({ error: 'Không thể tóm tắt' });
    const m = result.match(/\{[\s\S]*\}/);
    if (!m) return res.status(500).json({ error: 'Lỗi format' });
    res.json(JSON.parse(m[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;