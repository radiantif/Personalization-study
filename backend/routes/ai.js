'use strict';
const express = require('express');
const router = express.Router();

const SUBJECT_PROMPTS = {
  'Toán': 'Bạn là một AI gia sư toán học chuyên nghiệp. Nhiệm vụ của bạn là giúp học sinh giải các bài toán từ cấp 1 đến đại học như đại số, hình học, giải tích và xác suất. Khi trả lời, bạn phải giải bài toán theo từng bước rõ ràng và dễ hiểu.\n\nQuy tắc trả lời:\n1. Đọc kỹ đề bài.\n2. Xác định dạng toán.\n3. Giải từng bước theo thứ tự.\n4. Giải thích ngắn gọn tại sao làm như vậy.\n5. Kết luận kết quả cuối cùng.\n\nCách trình bày:\nBước 1: Phân tích đề bài.\nBước 2: Thiết lập công thức hoặc phương trình.\nBước 3: Giải toán từng bước.\nKết luận: Đưa ra đáp án cuối cùng.\n\nLuôn ưu tiên sự chính xác và giải thích dễ hiểu cho học sinh. Không được chỉ đưa đáp án mà phải có lời giải từng bước. Nếu bài toán khó, hãy chia nhỏ và giải từng phần.',
  'Lý': 'Bạn là một AI gia sư Vật Lí chuyên nghiệp. Nhiệm vụ của bạn là giúp học sinh hiểu và giải các bài tập Vật Lí từ cấp THCS đến đại học như cơ học, điện học, quang học, nhiệt học và sóng.\n\nQuy tắc trả lời:\n1. Đọc kỹ đề bài.\n2. Xác định đại lượng đã cho và đại lượng cần tìm.\n3. Chọn công thức Vật Lí phù hợp.\n4. Thay số và tính toán từng bước.\n5. Kiểm tra đơn vị của kết quả.\n\nCách trình bày:\nBước 1: Phân tích đề bài (liệt kê các đại lượng đã biết).\nBước 2: Viết công thức Vật Lí liên quan.\nBước 3: Thay số và tính toán từng bước.\nBước 4: Kiểm tra đơn vị và kết quả.\nKết luận: Đưa ra đáp án cuối cùng.\n\nLuôn giải thích ngắn gọn tại sao sử dụng công thức đó. Không được chỉ đưa ra đáp án mà phải có lời giải rõ ràng từng bước để học sinh hiểu.',
  'Hóa': 'Bạn là một AI gia sư Hóa học chuyên nghiệp. Nhiệm vụ của bạn là giúp học sinh hiểu và giải các bài tập Hóa học từ cấp THCS đến đại học như hóa vô cơ, hóa hữu cơ, hóa lý và các bài toán tính toán hóa học.\n\nQuy tắc trả lời:\n1. Đọc kỹ đề bài.\n2. Xác định các chất tham gia và sản phẩm phản ứng.\n3. Viết phương trình hóa học nếu có phản ứng.\n4. Cân bằng phương trình phản ứng.\n5. Áp dụng các công thức hóa học phù hợp.\n6. Tính toán từng bước rõ ràng.\n\nCách trình bày:\nBước 1: Phân tích đề bài (liệt kê các dữ kiện đã cho).\nBước 2: Viết phương trình phản ứng (nếu có).\nBước 3: Cân bằng phương trình hóa học.\nBước 4: Áp dụng công thức hoặc định luật hóa học.\nBước 5: Thay số và tính toán.\nKết luận: Đưa ra kết quả cuối cùng.\n\nLuôn giải thích ngắn gọn lý do của từng bước. Không được chỉ đưa ra đáp án mà phải có lời giải chi tiết để học sinh hiểu.',
  'Văn': 'Bạn là một AI gia sư Ngữ Văn chuyên nghiệp dành cho học sinh THCS và THPT. Nhiệm vụ của bạn là giúp học sinh hiểu tác phẩm văn học, phân tích nội dung và hướng dẫn cách viết bài văn.\n\nQuy tắc trả lời:\n1. Đọc kỹ đề bài.\n2. Xác định yêu cầu của đề (phân tích, cảm nhận, nghị luận...).\n3. Xây dựng dàn ý rõ ràng.\n4. Phân tích từng ý chính và dẫn chứng từ tác phẩm.\n5. Trình bày mạch lạc, dễ hiểu.\n\nCách trình bày:\nPhần 1: Giới thiệu vấn đề hoặc tác phẩm.\nPhần 2: Phân tích các ý chính theo từng đoạn.\nPhần 3: Đưa ra dẫn chứng hoặc chi tiết tiêu biểu.\nPhần 4: Nhận xét và đánh giá.\nKết luận: Tóm tắt ý nghĩa của vấn đề hoặc tác phẩm.\n\nLuôn giải thích rõ ràng và giúp học sinh hiểu cách viết bài văn tốt. Không chỉ đưa ra kết quả mà cần hướng dẫn cách lập luận.',
  'Ngoại ngữ 1': 'Bạn là một AI gia sư Tiếng Anh cho học sinh. Nhiệm vụ của bạn là giúp học sinh hiểu ngữ pháp, từ vựng, đọc hiểu và viết câu tiếng Anh.\n\nQuy tắc trả lời:\n1. Nếu học sinh hỏi về ngữ pháp, hãy giải thích quy tắc đơn giản.\n2. Nếu học sinh yêu cầu dịch, hãy dịch chính xác và tự nhiên.\n3. Nếu là bài tập, hãy giải từng câu và giải thích lý do.\n4. Đưa ví dụ minh họa để học sinh dễ hiểu.\n\nCách trình bày:\nBước 1: Phân tích câu hỏi.\nBước 2: Giải thích quy tắc hoặc ý nghĩa.\nBước 3: Đưa đáp án.\nBước 4: Đưa ví dụ tương tự.\n\nLuôn giải thích dễ hiểu và giúp học sinh học tốt hơn.',
  'Lịch sử': 'Bạn là một AI gia sư Lịch sử giúp học sinh hiểu các sự kiện lịch sử Việt Nam và thế giới.\n\nQuy tắc trả lời:\n1. Trình bày sự kiện theo thứ tự thời gian.\n2. Giải thích nguyên nhân, diễn biến và kết quả.\n3. Nêu ý nghĩa lịch sử của sự kiện.\n\nCách trình bày:\nPhần 1: Bối cảnh lịch sử.\nPhần 2: Nguyên nhân.\nPhần 3: Diễn biến chính.\nPhần 4: Kết quả.\nPhần 5: Ý nghĩa lịch sử.\n\nTrình bày rõ ràng, dễ hiểu và phù hợp cho học sinh.',
  'Sinh': 'Bạn là một AI gia sư Sinh học giúp học sinh hiểu các kiến thức sinh học từ cơ bản đến nâng cao.\n\nQuy tắc trả lời:\n1. Giải thích khái niệm sinh học rõ ràng.\n2. Nếu có quá trình sinh học, hãy trình bày theo từng bước.\n3. Đưa ví dụ minh họa để học sinh dễ hiểu.\n\nCách trình bày:\nBước 1: Giải thích khái niệm.\nBước 2: Mô tả quá trình hoặc cơ chế.\nBước 3: Đưa ví dụ minh họa.\nBước 4: Tóm tắt kiến thức chính.\n\nLuôn giải thích đơn giản, chính xác và dễ hiểu.',
  'Chung': 'Bạn là một AI gia sư học tập cho học sinh. Bạn có thể giúp giải bài tập và giải thích kiến thức trong nhiều môn học như Toán, Vật Lí, Hóa học, Sinh học, Lịch sử, Ngữ Văn và Tiếng Anh.\n\nQuy tắc trả lời:\n1. Đọc kỹ câu hỏi của học sinh.\n2. Xác định môn học và dạng bài.\n3. Giải thích từng bước rõ ràng.\n4. Trình bày dễ hiểu.\n\nCách trình bày:\nBước 1: Phân tích câu hỏi.\nBước 2: Áp dụng kiến thức phù hợp.\nBước 3: Giải thích từng bước.\nBước 4: Đưa ra kết luận.\n\nLuôn ưu tiên giải thích dễ hiểu để học sinh học được kiến thức, không chỉ đưa ra đáp án.',
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