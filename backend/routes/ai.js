'use strict';
const express = require('express');
const router = express.Router();

const SUBJECT_PROMPTS = {
  'Toán': 'Bạn là gia sư Toán học. Giải từng bước rõ ràng, nêu công thức sử dụng, kiểm tra kết quả. Trả lời bằng tiếng Việt.',
  'Lý': 'Bạn là gia sư Vật lý. Nêu công thức, đơn vị đo, phân tích hiện tượng, giải bài tập từng bước. Trả lời bằng tiếng Việt.',
  'Hóa': 'Bạn là gia sư Hóa học. Viết PTHH đầy đủ, cân bằng, giải thích cơ chế phản ứng. Trả lời bằng tiếng Việt.',
  'Văn': 'Bạn là gia sư Ngữ văn. Phân tích tác phẩm sâu sắc, hướng dẫn làm văn nghị luận đúng cấu trúc. Trả lời bằng tiếng Việt.',
  'Ngoại ngữ 1': 'Bạn là gia sư Tiếng Anh. Giải thích ngữ pháp bằng tiếng Việt, cho ví dụ bằng tiếng Anh, sửa lỗi chi tiết.',
  'Lịch sử': 'Bạn là gia sư Lịch sử. Trình bày sự kiện theo trình tự, phân tích nguyên nhân-kết quả, liên hệ thực tế. Trả lời bằng tiếng Việt.',
  'Sinh': 'Bạn là gia sư Sinh học. Giải thích cơ chế sinh học rõ ràng, dùng sơ đồ mô tả bằng text khi cần. Trả lời bằng tiếng Việt.',
  'Chung': 'Bạn là gia sư học tập AI thân thiện. Hỗ trợ tất cả môn học, giải thích rõ ràng với ví dụ thực tế. Luôn trả lời bằng tiếng Việt.',
};

const LEVEL_PROMPTS = {
  'THCS': `Học sinh đang học chương trình THCS (lớp 6-9).
Yêu cầu khi trả lời:
- Dùng ngôn ngữ đơn giản, dễ hiểu, tránh thuật ngữ phức tạp
- Giải thích bằng ví dụ thực tế gần gũi với học sinh
- Chia nhỏ từng bước, không bỏ qua bước nào
- Khuyến khích và động viên học sinh
- Không dùng kiến thức vượt chương trình THCS`,

  'THPT': `Học sinh đang học chương trình THPT (lớp 10-12), chuẩn bị thi THPT Quốc gia.
Yêu cầu khi trả lời:
- Giải đúng phương pháp thi THPT, trình bày rõ ràng
- Nêu công thức, định lý cần nhớ
- Chỉ ra các dạng bài thường gặp trong đề thi
- Lưu ý các bẫy thường gặp trong đề thi
- Có thể dùng thuật ngữ THPT đầy đủ`,

  'Đại học': `Sinh viên đang học ở bậc Đại học / Cao đẳng.
Yêu cầu khi trả lời:
- Giải thích chuyên sâu, có thể dùng thuật ngữ học thuật
- Trình bày chứng minh đầy đủ khi cần thiết
- Kết nối lý thuyết với ứng dụng thực tiễn
- Có thể đề xuất tài liệu tham khảo thêm
- Giải quyết vấn đề theo tư duy phân tích, tổng hợp`,

  'Chung': `Trả lời phù hợp với mọi cấp độ học.
- Giải thích rõ ràng, dễ hiểu
- Dùng ví dụ minh họa khi cần
- Điều chỉnh độ phức tạp theo câu hỏi`,
};

async function callGroq(messages, maxTokens = 1024, jsonMode = false) {
  if (!process.env.GROQ_API_KEY) return null;
  const body = {
    model: 'llama-3.3-70b-versatile',
    messages,
    max_tokens: maxTokens,
    temperature: jsonMode ? 0.2 : 0.7
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content || null;
}

// ── Chat ──────────────────────────────────────────────
router.post('/chat', async function(req, res) {
  const { message, history = [], subject = 'Chung', level = 'Chung' } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  const subjectPrompt = SUBJECT_PROMPTS[subject] || SUBJECT_PROMPTS['Chung'];
  const levelPrompt = LEVEL_PROMPTS[level] || LEVEL_PROMPTS['Chung'];
  const systemPrompt = `${subjectPrompt}

=== CẤP ĐỘ HỌC: ${level.toUpperCase()} ===
${levelPrompt}`;
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
    const result = await callGroq([
      { role: 'system', content: 'Bạn là API JSON. Chỉ trả JSON thuần túy, không markdown.' },
      { role: 'user', content: prompt }
    ], 2000, true);
    if (!result) return res.status(500).json({ error: 'Không thể tạo flashcard — kiểm tra GROQ_API_KEY' });

    // Parse linh hoạt
    let data = null;
    try { data = JSON.parse(result.trim()); } catch {}
    if (!data) {
      const fence = result.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) { try { data = JSON.parse(fence[1].trim()); } catch {} }
    }
    if (!data) {
      const s = result.indexOf('{'), e = result.lastIndexOf('}');
      if (s !== -1 && e > s) {
        try { data = JSON.parse(result.slice(s, e + 1)); } catch {}
      }
    }
    if (!data?.flashcards?.length) {
      console.warn('Flashcard parse failed. Raw:', result.substring(0, 200));
      return res.status(500).json({ error: 'AI không trả về đúng format. Thử lại.' });
    }
    res.json({ flashcards: data.flashcards, subject: subject || 'Chung' });
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
    let sumData = null;
    try { sumData = JSON.parse(result.trim()); } catch {}
    if (!sumData) {
      const s = result.indexOf('{'), e = result.lastIndexOf('}');
      if (s !== -1 && e > s) { try { sumData = JSON.parse(result.slice(s, e+1)); } catch {} }
    }
    if (!sumData) return res.status(500).json({ error: 'AI không trả về đúng format' });
    res.json(sumData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;