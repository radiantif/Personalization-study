'use strict';
const express = require('express');
const router = express.Router();

const SUBJECT_PROMPTS = {
  'Toán': 'Bạn là gia sư Toán học chuyên nghiệp. Chuyên giải các bài toán đại số, hình học, giải tích, xác suất thống kê. Luôn giải từng bước rõ ràng, trình bày công thức đẹp, kiểm tra lại kết quả. Trả lời bằng tiếng Việt.',
  'Lý': 'Bạn là gia sư Vật lý chuyên nghiệp. Chuyên về cơ học, điện học, quang học, nhiệt học. Luôn nêu công thức, đơn vị đo, và giải bài tập từng bước. Trả lời bằng tiếng Việt.',
  'Hóa': 'Bạn là gia sư Hóa học chuyên nghiệp. Chuyên về hóa đại cương, hóa hữu cơ, hóa vô cơ. Luôn viết phương trình phản ứng rõ ràng và giải thích cơ chế. Trả lời bằng tiếng Việt.',
  'Văn': 'Bạn là gia sư Ngữ văn chuyên nghiệp. Chuyên về phân tích tác phẩm văn học, làm văn nghị luận, thơ ca. Giúp học sinh viết bài hay, phân tích sâu sắc. Trả lời bằng tiếng Việt.',
  'Ngoại ngữ 1': 'Bạn là gia sư Tiếng Anh chuyên nghiệp. Chuyên về ngữ pháp, từ vựng, đọc hiểu, viết luận, luyện thi. Giải thích bằng tiếng Việt nhưng ví dụ bằng tiếng Anh.',
  'Lịch sử': 'Bạn là gia sư Lịch sử chuyên nghiệp. Chuyên về lịch sử Việt Nam và thế giới. Kể chuyện lịch sử sinh động và dễ nhớ. Trả lời bằng tiếng Việt.',
  'Sinh': 'Bạn là gia sư Sinh học chuyên nghiệp. Chuyên về tế bào học, di truyền học, sinh thái học. Giải thích các quá trình sinh học rõ ràng. Trả lời bằng tiếng Việt.',
  'Chung': 'Bạn là gia sư học tập AI thân thiện và nhiệt tình. Hỗ trợ tất cả các môn học. Giải thích rõ ràng, ngắn gọn, dùng ví dụ thực tế. Khuyến khích và động viên học sinh. Trả lời bằng tiếng Việt.',
};

router.post('/chat', async function(req, res) {
  const { message, history = [], subject = 'Chung' } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  const systemPrompt = SUBJECT_PROMPTS[subject] || SUBJECT_PROMPTS['Chung'];

  try {
    // ── Groq API ──────────────────────────────────────────────
    if (process.env.GROQ_API_KEY) {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.map(function(h) {
          return { role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content };
        }),
        { role: 'user', content: message }
      ];

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: messages,
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });

      const data = await response.json();
      console.log('Groq status:', response.status);

      if (data.error) {
        console.error('Groq error:', data.error.message);
        return res.json({ reply: 'Lỗi Groq: ' + data.error.message });
      }

      const reply = data.choices &&
                    data.choices[0] &&
                    data.choices[0].message &&
                    data.choices[0].message.content;
      return res.json({ reply: reply || 'Xin lỗi, không có phản hồi.' });
    }

    // ── Fallback tiếng Việt ───────────────────────────────────
    var responses = [
      'Câu hỏi hay! Bạn đang học môn ' + subject + '. Hãy cho tôi biết thêm chi tiết để tôi giúp bạn nhé! 😊',
      '📖 Chủ đề thú vị trong môn ' + subject + '! Bạn muốn tôi giải thích từ cơ bản hay nâng cao?',
      '💡 Tôi sẵn sàng hỗ trợ môn ' + subject + '! Hãy đặt câu hỏi cụ thể hơn nhé!',
    ];
    return res.json({ reply: responses[Math.floor(Math.random() * responses.length)] });

  } catch (err) {
    console.error('AI route error:', err.message);
    return res.status(500).json({
      error: 'AI service error',
      reply: 'Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại sau!'
    });
  }
});

module.exports = router;