-- =====================================================
-- Study Dashboard — Full Schema v2
-- Chạy toàn bộ file này trong Neon SQL Editor
-- =====================================================

-- ─── Users ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  email             VARCHAR(200) UNIQUE NOT NULL,
  name              VARCHAR(100) NOT NULL DEFAULT 'Student',
  password_hash     VARCHAR(200),
  password_salt     VARCHAR(100),
  avatar            VARCHAR(10) DEFAULT '🎓',
  custom_avatar     TEXT,
  level             INT NOT NULL DEFAULT 1,
  exp               INT NOT NULL DEFAULT 0,
  total_study_hours DECIMAL(10,2) DEFAULT 0,
  streak_days       INT DEFAULT 0,
  last_study_date   DATE,
  exam_date         TIMESTAMPTZ,
  target_subject    VARCHAR(100),
  last_login        TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

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

-- ─── Flashcards ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS flashcards (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  subject     VARCHAR(100) DEFAULT 'General',
  is_public   BOOLEAN DEFAULT FALSE,
  share_code  VARCHAR(20) UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flashcards_user ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_public ON flashcards(is_public);

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
  content_html  TEXT,
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

-- ─── Calendar Events ──────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  subject     VARCHAR(100),
  event_date  DATE NOT NULL,
  event_time  TIME,
  type        VARCHAR(30) DEFAULT 'study',
  color       VARCHAR(20) DEFAULT '#7c6fff',
  remind_at   TIMESTAMPTZ,
  completed   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calendar_user ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar_events(event_date);

-- ─── Quizzes ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
  id         SERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(200) NOT NULL,
  subject    VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id            SERIAL PRIMARY KEY,
  quiz_id       INT REFERENCES quizzes(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  options       JSONB NOT NULL,
  correct_index INT NOT NULL,
  explanation   TEXT
);

CREATE TABLE IF NOT EXISTS quiz_results (
  id           SERIAL PRIMARY KEY,
  quiz_id      INT REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id      INT REFERENCES users(id) ON DELETE CASCADE,
  score        INT NOT NULL,
  total        INT NOT NULL,
  time_seconds INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quiz_user ON quizzes(user_id);

-- ─── Study Rooms ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_rooms (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  subject     VARCHAR(100) DEFAULT 'Chung',
  owner_id    INT REFERENCES users(id) ON DELETE CASCADE,
  invite_code VARCHAR(10) UNIQUE NOT NULL,
  is_private  BOOLEAN DEFAULT FALSE,
  password_hash VARCHAR(10),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id       INT REFERENCES study_rooms(id) ON DELETE CASCADE,
  user_id       INT REFERENCES users(id) ON DELETE CASCADE,
  status        VARCHAR(30) DEFAULT 'studying',
  study_subject VARCHAR(100),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_messages (
  id         SERIAL PRIMARY KEY,
  room_id    INT REFERENCES study_rooms(id) ON DELETE CASCADE,
  user_id    INT REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_room_messages ON room_messages(room_id, created_at);

-- ─── Roadmaps ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roadmaps (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  subject     VARCHAR(100),
  goal        TEXT,
  level       VARCHAR(50),
  total_weeks INT DEFAULT 8,
  data        JSONB,
  progress    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_roadmaps_user ON roadmaps(user_id);

-- Thêm cột password nếu chưa có (chạy nếu bảng đã tồn tại)
ALTER TABLE study_rooms ADD COLUMN IF NOT EXISTS password_hash VARCHAR(10);