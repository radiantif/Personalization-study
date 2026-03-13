'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pool = require('./db');
const passportConfig = require('./passport');

const tasksRouter     = require('./routes/tasks');
const flashcardsRouter = require('./routes/flashcards');
const materialsRouter = require('./routes/materials');
const profileRouter   = require('./routes/profile');
const sessionsRouter  = require('./routes/sessions');
const aiRouter        = require('./routes/ai');
const chatsRouter     = require('./routes/chats');
const authRouter      = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── CORS ─────────────────────────────────────────────
app.use(cors({
  origin: function(origin, callback) {
    const allowed = [
      process.env.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
    ].filter(Boolean);
    if (!origin || allowed.some(function(o) { return origin.startsWith(o.replace(/\/$/, '')); })) {
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

// ─── Session ──────────────────────────────────────────
app.use(session({
  store: new pgSession({ pool: pool, tableName: 'user_sessions' }),
  secret: process.env.SESSION_SECRET || 'studyflow-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  }
}));

// ─── Passport ─────────────────────────────────────────
app.use(passportConfig.initialize());
app.use(passportConfig.session());

// ─── Health check ─────────────────────────────────────
app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Auth middleware for protected routes ─────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Chưa đăng nhập', code: 'UNAUTHORIZED' });
}

// ─── Routes ───────────────────────────────────────────
app.use('/api/auth',       authRouter);
app.use('/api/tasks',      requireAuth, tasksRouter);
app.use('/api/flashcards', requireAuth, flashcardsRouter);
app.use('/api/materials',  requireAuth, materialsRouter);
app.use('/api/profile',    profileRouter);
app.use('/api/sessions',   requireAuth, sessionsRouter);
app.use('/api/ai',         requireAuth, aiRouter);
app.use('/api/chats',      requireAuth, chatsRouter);

// ─── 404 ──────────────────────────────────────────────
app.use(function(req, res) {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Error handler ────────────────────────────────────
app.use(function(err, req, res, next) {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, function() {
  console.log('🚀 Study Dashboard API running on port ' + PORT);
});