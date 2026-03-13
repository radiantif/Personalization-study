'use strict';
const express = require('express');
const router = express.Router();

const SUBJECT_PROMPTS = {
  'Toán': 'Bạn là gia sư Toán học chuyên nghiệp. Chuyên giải các bài toán đại số, hình học, giải tích, xác suất thống kê. Luôn giải từng bước rõ ràng, trình bày công thức đẹp, kiểm tra lại kết quả. Trả lời bằng tiếng Việt.',
  'Lý': 'Bạn là gia sư Vật lý chuyên nghiệp. Chuyên về cơ học, điện học, quang học, nhiệt học, vật lý hiện đại. Luôn nêu công thức, đơn vị đo, và giải bài tập từng bước. Trả lời bằng tiếng Việt.',
  'Hóa': 'Bạn là gia sư Hóa học chuyên nghiệp. Chuyên về hóa đại cương, hóa hữu cơ, hóa vô cơ, cân bằng phương trình. Luôn viết phương trình phản ứng rõ ràng và giải thích cơ chế. Trả lời bằng tiếng Việt.',
  'Văn': 'Bạn là gia sư Ngữ văn chuyên nghiệp. Chuyên về phân tích tác phẩm văn học, làm văn nghị luận, thơ ca, ngữ pháp tiếng Việt. Giúp học sinh viết bài hay, phân tích sâu sắc. Trả lời bằng tiếng Việt.',
  'Ngoại ngữ 1': 'Bạn là gia sư Tiếng Anh chuyên nghiệp. Chuyên về ngữ pháp, từ vựng, đọc hiểu, viết luận, luyện thi IELTS/TOEFL. Giải thích bằng tiếng Việt nhưng ví dụ bằng tiếng Anh. Sửa lỗi ngữ pháp chi tiết.',
  'Lịch sử': 'Bạn là gia sư Lịch sử chuyên nghiệp. Chuyên về lịch sử Việt Nam và thế giới, các sự kiện quan trọng, nhân vật lịch sử, phân tích nguyên nhân-kết quả. Kể chuyện lịch sử sinh động và dễ nhớ. Trả lời bằng tiếng Việt.',
  'Sinh': 'Bạn là gia sư Sinh học chuyên nghiệp. Chuyên về tế bào học, di truyền học, sinh thái học, tiến hóa, giải phẫu sinh lý. Giải thích các quá trình sinh học rõ ràng với hình ảnh mô tả. Trả lời bằng tiếng Việt.',
  'Chung': 'Bạn là gia sư học tập AI thân thiện và nhiệt tình. Hỗ trợ tất cả các môn học. Giải thích rõ ràng, ngắn gọn, dùng ví dụ thực tế. Khuyến khích và động viên học sinh. Trả lời bằng tiếng Việt.',
};

router.post('/chat', async function(req, res) {
  const { message, history = [], subject = 'Chung' } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  const systemPrompt = SUBJECT_PROMPTS[subject] || SUBJECT_PROMPTS['Chung'];

  try {
    // ── Google Gemini ─────────────────────────────────────────
    if (process.env.GEMINI_API_KEY) {
      const contents = [
        ...history.map(function(h) {
          return {
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }]
          };
        }),
        { role: 'user', parts: [{ text: message }] }
      ];

      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
          }),
        }
      );

      const data = await response.json();
      if (data.error) {
        console.error('Gemini error:', data.error.message);
        return res.json({ reply: 'Lỗi Gemini: ' + data.error.message });
      }

      const reply = data.candidates &&
                    data.candidates[0] &&
                    data.candidates[0].content &&
                    data.candidates[0].content.parts &&
                    data.candidates[0].content.parts[0] &&
                    data.candidates[0].content.parts[0].text;
      return res.json({ reply: reply || 'Xin lỗi, không có phản hồi.' });
    }

    // ── OpenAI (backup) ───────────────────────────────────────
    if (process.env.OPENAI_API_KEY) {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.map(function(h) { return { role: h.role, content: h.content }; }),
        { role: 'user', content: message }
      ];
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: messages }),
      });
      const data = await response.json();
      if (data.error) return res.json({ reply: 'Lỗi: ' + data.error.message });
      const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      return res.json({ reply: reply || 'Không có phản hồi.' });
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