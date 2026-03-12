-- =====================================================
-- Study Dashboard — Neon Postgres Schema
-- Run this in your Neon SQL Editor to initialize DB
-- =====================================================

-- Drop tables if resetting (remove in production)
-- DROP TABLE IF EXISTS study_sessions, materials, flashcards, tasks, subjects, users CASCADE;

-- ─── Users ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(100) NOT NULL DEFAULT 'Student',
  avatar            VARCHAR(10) DEFAULT '🎓',
  level             INT NOT NULL DEFAULT 1,
  exp               INT NOT NULL DEFAULT 0,
  total_study_hours DECIMAL(10,2) DEFAULT 0,
  exam_date         TIMESTAMPTZ,
  target_subject    VARCHAR(100),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default user if not exists
INSERT INTO users (id, name, avatar, level, exp, exam_date)
VALUES (1, 'Student', '🎓', 1, 0, NOW() + INTERVAL '120 days')
ON CONFLICT (id) DO NOTHING;

-- ─── Tasks ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(500) NOT NULL,
  subject     VARCHAR(100),
  deadline    DATE,
  completed   BOOLEAN DEFAULT FALSE,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(sort_order);

-- ─── Subjects ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  color      VARCHAR(20) DEFAULT '#6366f1',
  icon       VARCHAR(10) DEFAULT '📁',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default subjects
INSERT INTO subjects (name, color, icon) VALUES
  ('Math',      '#f59e0b', '📐'),
  ('English',   '#10b981', '📖'),
  ('Physics',   '#3b82f6', '⚡'),
  ('Chemistry', '#ef4444', '🧪'),
  ('History',   '#8b5cf6', '🏛️'),
  ('Biology',   '#06b6d4', '🔬')
ON CONFLICT (name) DO NOTHING;

-- ─── Flashcards ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS flashcards (
  id         SERIAL PRIMARY KEY,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  subject    VARCHAR(100) DEFAULT 'General',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_subject ON flashcards(subject);

-- ─── Materials ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materials (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(500) NOT NULL,
  subject_id    INT REFERENCES subjects(id) ON DELETE SET NULL,
  file_url      TEXT,
  file_type     VARCHAR(20) DEFAULT 'note',  -- 'pdf', 'image', 'note'
  original_name VARCHAR(500),
  content       TEXT,  -- for text/markdown notes
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materials_subject ON materials(subject_id);

-- ─── Study Sessions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS study_sessions (
  id               SERIAL PRIMARY KEY,
  subject          VARCHAR(100),
  duration_minutes INT NOT NULL,
  note             TEXT,
  started_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_started ON study_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_subject ON study_sessions(subject);

-- =====================================================
-- Verification query — run to confirm tables exist:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public';
-- =====================================================
