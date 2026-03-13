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
const chatsRouter = require('./routes/chats');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: function(origin, callback) {
    const allowed = [
      'https://personalization-study.vercel.app',
      'http://localhost:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
    ];
    if (!origin || allowed.some(function(o) { return origin.startsWith(o); })) {
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

app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/tasks',      tasksRouter);
app.use('/api/flashcards', flashcardsRouter);
app.use('/api/materials',  materialsRouter);
app.use('/api/profile',    profileRouter);
app.use('/api/sessions',   sessionsRouter);
app.use('/api/ai',         aiRouter);
app.use('/api/chats',      chatsRouter);

app.use(function(req, res) {
  res.status(404).json({ error: 'Route not found' });
});

app.use(function(err, req, res, next) {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, function() {
  console.log('chạy ở ' + PORT);
});