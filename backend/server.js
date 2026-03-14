'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'studyflow-jwt-secret-2024';

const tasksRouter      = require('./routes/tasks');
const flashcardsRouter = require('./routes/flashcards');
const materialsRouter  = require('./routes/materials');
const profileRouter    = require('./routes/profile');
const sessionsRouter   = require('./routes/sessions');
const aiRouter         = require('./routes/ai');
const chatsRouter      = require('./routes/chats');
const authRouter       = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── CORS ─────────────────────────────────────────────
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = [
      'https://personalization-study.vercel.app',
      'http://localhost:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
    ];
    if (allowed.some(function(o) { return origin.startsWith(o); })) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── JWT Auth Middleware ───────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Chưa đăng nhập', code: 'UNAUTHORIZED' });
  }
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    req.user = { id: decoded.id };
    next();
  } catch {
    res.status(401).json({ error: 'Token không hợp lệ', code: 'UNAUTHORIZED' });
  }
}

// ─── Health ───────────────────────────────────────────
app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────
app.use('/api/auth',       authRouter);
app.use('/api/tasks',      requireAuth, tasksRouter);
app.use('/api/flashcards', requireAuth, flashcardsRouter);
app.use('/api/materials',  requireAuth, materialsRouter);
app.use('/api/profile',    requireAuth, profileRouter);
app.use('/api/sessions',   requireAuth, sessionsRouter);
app.use('/api/ai',         requireAuth, aiRouter);
app.use('/api/chats',      requireAuth, chatsRouter);

app.use(function(req, res) { res.status(404).json({ error: 'Route not found' }); });
app.use(function(err, req, res, next) { res.status(500).json({ error: err.message }); });

app.listen(PORT, function() {
  console.log('🚀 Study Dashboard API running on port ' + PORT);
});