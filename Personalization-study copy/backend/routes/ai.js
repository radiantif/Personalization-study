// routes/ai.js
const express = require('express');
const router = express.Router();

// POST chat with AI tutor
// Supports: OpenAI, Anthropic Claude, or simulated responses
router.post('/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  try {
    // ── Option 1: Anthropic Claude API ──────────────────────────
    if (process.env.ANTHROPIC_API_KEY) {
      const fetch = (await import('node-fetch')).default;
      const messages = [
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: message }
      ];

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1024,
          system: 'You are a helpful, encouraging study tutor. Explain concepts clearly and concisely. Use examples when helpful. Be warm and supportive.',
          messages,
        }),
      });
      const data = await response.json();
      return res.json({ reply: data.content?.[0]?.text || 'Sorry, I could not respond.' });
    }

    // ── Option 2: OpenAI API ─────────────────────────────────────
    if (process.env.OPENAI_API_KEY) {
      const fetch = (await import('node-fetch')).default;
      const messages = [
        { role: 'system', content: 'You are a helpful study tutor. Be clear, concise, and encouraging.' },
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: message }
      ];

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'gpt-3.5-turbo', messages }),
      });
      const data = await response.json();
      return res.json({ reply: data.choices?.[0]?.message?.content || 'Sorry, I could not respond.' });
    }

    // ── Option 3: Simulated responses (fallback) ─────────────────
    const lowerMsg = message.toLowerCase();
    let reply = '';

    if (lowerMsg.includes('photosynthesis')) {
      reply = '🌿 **Photosynthesis** is the process plants use to convert sunlight, water, and CO₂ into glucose and oxygen.\n\n**Formula:** 6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂\n\nIt happens in the chloroplasts, specifically using chlorophyll to absorb light energy.';
    } else if (lowerMsg.includes('pythagorean') || lowerMsg.includes('pythagoras')) {
      reply = '📐 **Pythagorean Theorem:** In a right triangle, a² + b² = c²\n\nWhere c is the hypotenuse (longest side). For example: a 3-4-5 triangle — 3² + 4² = 5² → 9 + 16 = 25 ✓';
    } else if (lowerMsg.includes('newton') || lowerMsg.includes('force')) {
      reply = '⚡ **Newton\'s Laws of Motion:**\n1. An object at rest stays at rest (inertia)\n2. F = ma (Force = mass × acceleration)\n3. Every action has an equal and opposite reaction';
    } else if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
      reply = '👋 Hello! I\'m your AI Study Tutor. Ask me anything — math, science, history, literature. I\'m here to help you ace your exams! 📚';
    } else if (lowerMsg.includes('help')) {
      reply = '📚 I can help you with:\n- **Explaining concepts** in any subject\n- **Solving math problems** step by step\n- **Summarizing topics** for quick review\n- **Creating study strategies**\n\nJust ask your question!';
    } else if (lowerMsg.includes('math') || lowerMsg.includes('calculus')) {
      reply = '🔢 Mathematics is the language of the universe! Tell me which specific concept or problem you need help with — algebra, calculus, geometry, statistics? I\'ll break it down step by step.';
    } else {
      const responses = [
        `Great question about "${message}"! Let me break this down for you. This topic is fascinating and connects to many other concepts. Could you share which subject this is for so I can give you the most relevant explanation?`,
        `📖 For "${message}", the key thing to understand is that it involves multiple interconnected ideas. Would you like me to start with the fundamentals or go straight to the advanced concepts?`,
        `💡 "${message}" is an important topic! To give you the best answer, tell me: are you studying this for an upcoming exam, or do you want a deep understanding?`,
      ];
      reply = responses[Math.floor(Math.random() * responses.length)];
    }

    res.json({ reply });
  } catch (err) {
    console.error('AI error:', err);
    res.status(500).json({ error: 'AI service error', reply: 'Sorry, I encountered an error. Please try again.' });
  }
});

module.exports = router;
