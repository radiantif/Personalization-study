-- =====================================================
-- Study Dashboard — Full Schema (with Auth)
-- Run toàn bộ file này trong Neon SQL Editor
-- =====================================================

-- ─── Users (updated for Google OAuth) ────────────────
CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  google_id         VARCHAR(100) UNIQUE,
  email             VARCHAR(200) UNIQUE,
  name              VARCHAR(100) NOT NULL DEFAULT 'Student',
  avatar            VARCHAR(10) DEFAULT '🎓',
  google_avatar     TEXT,
  custom_avatar     TEXT,
  level             INT NOT NULL DEFAULT 1,
  exp               INT NOT NULL DEFAULT 0,
  total_study_hours DECIMAL(10,2) DEFAULT 0,
  exam_date         TIMESTAMPTZ,
  target_subject    VARCHAR(100),
  last_login        TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Sessions table (for express-session) ────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  sid    VARCHAR NOT NULL COLLATE "default",
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON user_sessions(expire);

-- ─── Tasks ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(500) NOT NULL,
  subject     VARCHAR(100),
  deadline    DATE,
  completed   BOOLEAN DEFAULT FALSE,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);

-- ─── Subjects ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id         SERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  color      VARCHAR(20) DEFAULT '#6366f1',
  icon       VARCHAR(10) DEFAULT '📁',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subjects_user ON subjects(user_id);

-- ─── Flashcards ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS flashcards (
  id         SERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id) ON DELETE CASCADE,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  subject    VARCHAR(100) DEFAULT 'General',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flashcards_user ON flashcards(user_id);

-- ─── Materials ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materials (
  id            SERIAL PRIMARY KEY,
  user_id       INT REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(500) NOT NULL,
  subject_id    INT REFERENCES subjects(id) ON DELETE SET NULL,
  file_url      TEXT,
  file_type     VARCHAR(20) DEFAULT 'note',
  original_name VARCHAR(500),
  content       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_materials_user ON materials(user_id);

-- ─── Study Sessions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS study_sessions (
  id               SERIAL PRIMARY KEY,
  user_id          INT REFERENCES users(id) ON DELETE CASCADE,
  subject          VARCHAR(100),
  duration_minutes INT NOT NULL,
  note             TEXT,
  started_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON study_sessions(user_id);

-- ─── Chat Sessions ────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
  id         SERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(200) DEFAULT 'Cuộc trò chuyện mới',
  subject    VARCHAR(50) DEFAULT 'Chung',
  messages   JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chats_user ON chat_sessions(user_id);