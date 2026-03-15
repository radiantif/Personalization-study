'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'studyflow-jwt-secret-2024';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = [
      'https://personalization-study.vercel.app',
      'http://localhost:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
    ];
    if (allowed.some(function(o) { return origin.startsWith(o); })) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập', code: 'UNAUTHORIZED' });
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    req.user = { id: decoded.id };
    next();
  } catch { res.status(401).json({ error: 'Token không hợp lệ', code: 'UNAUTHORIZED' }); }
}

app.get('/api/health', function(req, res) { res.json({ status: 'ok', timestamp: new Date().toISOString() }); });

// Public route for shared flashcards
app.get('/api/flashcards/shared/:code', require('./routes/flashcards').sharedRoute || function(req, res, next) {
  require('./routes/flashcards')(req, res, next);
});

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/tasks',      requireAuth, require('./routes/tasks'));
app.use('/api/flashcards', requireAuth, require('./routes/flashcards'));
app.use('/api/materials',  requireAuth, require('./routes/materials'));
app.use('/api/profile',    requireAuth, require('./routes/profile'));
app.use('/api/sessions',   requireAuth, require('./routes/sessions'));
app.use('/api/ai',         requireAuth, require('./routes/ai'));
app.use('/api/chats',      requireAuth, require('./routes/chats'));
app.use('/api/quiz',       requireAuth, require('./routes/quiz'));
app.use('/api/calendar',   requireAuth, require('./routes/calendar'));
app.use('/api/ocr',        requireAuth, require('./routes/ocr'));
app.use('/api/rooms',      requireAuth, require('./routes/rooms'));
app.use('/api/roadmap',    requireAuth, require('./routes/roadmap'));

app.use(function(req, res) { res.status(404).json({ error: 'Route not found' }); });
app.use(function(err, req, res, next) { console.error(err.stack); res.status(500).json({ error: err.message }); });

app.listen(PORT, function() { console.log('🚀 Study Dashboard API running on port ' + PORT); });