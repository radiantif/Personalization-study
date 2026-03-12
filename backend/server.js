// server.js — Study Dashboard API
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const tasksRouter = require('./routes/tasks');
const flashcardsRouter = require('./routes/flashcards');
const materialsRouter = require('./routes/materials');
const profileRouter = require('./routes/profile');
const sessionsRouter = require('./routes/sessions');
const aiRouter = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/tasks',      tasksRouter);
app.use('/api/flashcards', flashcardsRouter);
app.use('/api/materials',  materialsRouter);
app.use('/api/profile',    profileRouter);
app.use('/api/sessions',   sessionsRouter);
app.use('/api/ai',         aiRouter);

// ─── 404 ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Error handler ────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 Study Dashboard API running on port ${PORT}`);
});
