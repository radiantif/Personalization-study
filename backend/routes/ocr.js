/**
 * OCR Route — Deep OCR bằng Groq Vision (LLaMA 4) + Tesseract.js fallback
 * Tối ưu cho: ảnh chat Messenger/Zalo/Discord, bài tập, chữ viết tay
 */
'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');

// ── Multer: nhận ảnh vào memory ──────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: function(req, file, cb) {
    const allowed = ['image/png','image/jpeg','image/jpg','image/gif','image/webp','image/bmp','image/tiff'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh'));
  }
});

/**
 * Tiền xử lý ảnh — tăng độ tương phản, làm sắc nét
 * Giúp OCR đọc tốt hơn ảnh chụp màn hình chat và chữ hơi mờ
 */
async function preprocessImage(buffer) {
  return await sharp(buffer)
    // Resize nếu ảnh quá nhỏ (tăng độ chính xác OCR)
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: false })
    // Tăng contrast để chữ rõ hơn
    .normalize()
    // Tăng độ sắc nét
    .sharpen({ sigma: 1.5 })
    // Tăng contrast thêm
    .linear(1.3, -20)
    // Convert sang PNG để OCR ổn định
    .png({ quality: 95 })
    .toBuffer();
}

/**
 * OCR bằng Groq Vision API (LLaMA 4 Scout — hỗ trợ vision)
 * Chất lượng cao nhất, hiểu ngữ cảnh, tối ưu cho chat/bài tập
 */
async function ocrWithGroqVision(imageBuffer, mimetype) {
  if (!process.env.GROQ_API_KEY) return null;

  // Convert sang base64
  const base64 = imageBuffer.toString('base64');
  const dataUrl = `data:image/png;base64,${base64}`;

  const systemPrompt = `Bạn là công cụ OCR chuyên nghiệp. Nhiệm vụ của bạn là trích xuất TOÀN BỘ văn bản từ ảnh.

Quy tắc:
1. Trích xuất TẤT CẢ văn bản nhìn thấy trong ảnh, không bỏ sót
2. Giữ nguyên cấu trúc xuống dòng, đoạn văn
3. Nếu là ảnh chat: giữ tên người gửi và nội dung tin nhắn
4. Nếu là bài tập: giữ nguyên số thứ tự, câu hỏi, công thức
5. Làm sạch ký tự OCR lỗi (ví dụ: "1" bị nhận nhầm thành "l")
6. Không thêm bình luận hay giải thích — chỉ trả về văn bản thuần
7. Nếu có công thức toán học, viết dạng text (vd: x^2 + 2x + 1)`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct', // Model vision của Groq
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail: 'high' }
            },
            {
              type: 'text',
              text: 'Hãy trích xuất toàn bộ văn bản trong ảnh này.'
            }
          ]
        }
      ],
      max_tokens: 4096,
      temperature: 0.1, // Thấp để OCR chính xác hơn
    })
  });

  const data = await response.json();
  if (data.error) {
    console.error('Groq Vision error:', data.error.message);
    return null;
  }
  return data.choices?.[0]?.message?.content || null;
}

/**
 * OCR fallback bằng Tesseract.js
 * Dùng khi không có Groq API key
 */
async function ocrWithTesseract(imageBuffer) {
  const Tesseract = require('tesseract.js');
  const { data: { text } } = await Tesseract.recognize(
    imageBuffer,
    'vie+eng', // Nhận diện cả tiếng Việt lẫn tiếng Anh
    {
      logger: () => {}, // Tắt log
      tessedit_pageseg_mode: '6', // Assume single block of text
    }
  );
  return text;
}

/**
 * Làm sạch văn bản sau OCR
 * Xử lý: ký tự thừa, dòng trống nhiều, ký tự đặc biệt lỗi
 */
function cleanText(text) {
  if (!text) return '';
  return text
    // Xóa ký tự null bytes
    .replace(/\x00/g, '')
    // Xóa ký tự control không cần thiết (trừ newline, tab)
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize nhiều dòng trống thành tối đa 2 dòng
    .replace(/\n{3,}/g, '\n\n')
    // Xóa khoảng trắng thừa ở đầu/cuối mỗi dòng
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    // Trim toàn bộ
    .trim();
}

// ── POST /api/ocr ─────────────────────────────────────
router.post('/', upload.single('image'), async function(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Không có file ảnh' });
  }

  console.log('OCR request — file size:', req.file.size, 'type:', req.file.mimetype);

  try {
    // Bước 1: Tiền xử lý ảnh (tăng contrast, sharpen)
    let processedBuffer;
    try {
      processedBuffer = await preprocessImage(req.file.buffer);
      console.log('Image preprocessed successfully');
    } catch (preprocessErr) {
      console.warn('Preprocess failed, dùng ảnh gốc:', preprocessErr.message);
      processedBuffer = req.file.buffer;
    }

    // Bước 2: OCR — thử Groq Vision trước
    let rawText = null;
    let method = 'unknown';

    if (process.env.GROQ_API_KEY) {
      try {
        console.log('Trying Groq Vision OCR...');
        rawText = await ocrWithGroqVision(processedBuffer, 'image/png');
        if (rawText) method = 'groq-vision';
        console.log('Groq Vision OCR success, chars:', rawText?.length);
      } catch (groqErr) {
        console.warn('Groq Vision failed:', groqErr.message);
      }
    }

    // Bước 3: Fallback Tesseract nếu Groq thất bại
    if (!rawText) {
      try {
        console.log('Falling back to Tesseract.js...');
        rawText = await ocrWithTesseract(processedBuffer);
        if (rawText) method = 'tesseract';
        console.log('Tesseract OCR success, chars:', rawText?.length);
      } catch (tesseractErr) {
        console.error('Tesseract failed:', tesseractErr.message);
      }
    }

    // Bước 4: Làm sạch văn bản
    const cleanedText = cleanText(rawText || '');

    if (!cleanedText) {
      return res.status(422).json({
        error: 'Không đọc được văn bản trong ảnh',
        suggestion: 'Thử ảnh rõ hơn hoặc độ phân giải cao hơn'
      });
    }

    // Bước 5: Trả về kết quả
    res.json({
      text: cleanedText,
      method,
      char_count: cleanedText.length,
      line_count: cleanedText.split('\n').length,
    });

  } catch (err) {
    console.error('OCR error:', err.message);
    res.status(500).json({ error: 'Lỗi xử lý OCR: ' + err.message });
  }
});

// ── POST /api/ocr/ask-ai — OCR + hỏi AI luôn ────────
router.post('/ask-ai', upload.single('image'), async function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Không có file ảnh' });
  const { question = 'Hãy giải bài tập này', subject = 'Chung', level = 'THPT' } = req.body;

  try {
    // Preprocess
    let processedBuffer;
    try { processedBuffer = await preprocessImage(req.file.buffer); }
    catch { processedBuffer = req.file.buffer; }

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: 'Cần GROQ_API_KEY để dùng tính năng này' });
    }

    const base64 = processedBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    // Gửi ảnh + câu hỏi cho AI trong 1 request
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'system',
            content: `Bạn là gia sư AI môn ${subject}, cấp ${level}. Nhìn vào ảnh và ${question}. Trả lời bằng tiếng Việt, giải từng bước rõ ràng.`
          },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
              { type: 'text', text: question }
            ]
          }
        ],
        max_tokens: 4096,
        temperature: 0.3,
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const answer = data.choices?.[0]?.message?.content || '';
    res.json({ answer, subject, level });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;