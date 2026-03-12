# 📚 StudyFlow — Full Stack Study Dashboard

A beautiful, anime-inspired study dashboard with task management, flashcards, AI tutoring, statistics, and more.

---

## 🗂️ Project Structure

```
study-dashboard/
├── frontend/
│   ├── index.html       ← Main SPA
│   ├── style.css        ← All styles (4 themes)
│   └── app.js           ← All frontend logic
├── backend/
│   ├── server.js        ← Express entry point
│   ├── db.js            ← Neon Postgres connection
│   ├── schema.sql       ← Database schema
│   ├── package.json
│   ├── .env.example     ← Environment variable template
│   └── routes/
│       ├── tasks.js
│       ├── flashcards.js
│       ├── materials.js
│       ├── profile.js
│       ├── sessions.js
│       └── ai.js
├── vercel.json          ← Vercel frontend config
└── render.yaml          ← Render backend config
```

---

## 🚀 Deployment Guide

### Step 1 — Set Up Neon Postgres Database

1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project named `study-dashboard`
3. In the Neon Console, click **SQL Editor**
4. Paste the entire contents of `backend/schema.sql` and click **Run**
5. Copy your connection string from **Dashboard → Connection Details**
   - It looks like: `postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require`

---

### Step 2 — Deploy Backend to Render

1. Push your code to a GitHub repository
2. Go to [render.com](https://render.com) and sign in
3. Click **New → Web Service**
4. Connect your GitHub repo
5. Configure:
   - **Name:** `study-dashboard-api`
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
6. Add Environment Variables:
   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Your Neon connection string |
   | `FRONTEND_URL` | Your Vercel URL (add after step 3) |
   | `NODE_ENV` | `production` |
   
   Optional AI keys:
   | Key | Value |
   |-----|-------|
   | `ANTHROPIC_API_KEY` | `sk-ant-...` (for Claude AI) |
   | `OPENAI_API_KEY` | `sk-...` (for GPT, alternative) |

7. Click **Create Web Service**
8. Wait for deployment — note your URL: `https://study-dashboard-api.onrender.com`

---

### Step 3 — Deploy Frontend to Vercel

1. **Update the API URL** in `frontend/app.js` line 8:
   ```js
   : 'https://YOUR-RENDER-APP.onrender.com/api'  // ← Replace this
   ```
   Change to:
   ```js
   : 'https://study-dashboard-api.onrender.com/api'
   ```

2. Go to [vercel.com](https://vercel.com) and sign in
3. Click **New Project** → Import your GitHub repo
4. Configure:
   - **Framework Preset:** Other
   - **Root Directory:** `./` (leave as default)
5. Click **Deploy**
6. Note your Vercel URL: `https://study-dashboard-xxx.vercel.app`

---

### Step 4 — Update CORS in Render

1. Go back to Render → your web service → Environment
2. Update `FRONTEND_URL` to your Vercel URL
3. Click **Save Changes** (service will redeploy automatically)

---

## 💻 Local Development

### Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your Neon DATABASE_URL
node server.js
# API runs at http://localhost:3001
```

### Frontend
Open `frontend/index.html` directly in a browser, or use a local server:
```bash
cd frontend
npx serve .
# Opens at http://localhost:3000
```

> The `API` constant in `app.js` auto-detects localhost and uses `http://localhost:3001/api`.

---

## 🎨 Features

| Feature | Description |
|---------|-------------|
| 🏠 **Home** | Animated exam countdown, quick stats, quick actions |
| ✅ **Tasks** | Add/delete/complete tasks with drag & drop sorting |
| 📚 **Materials** | Upload PDFs/images, write notes, organize in subject folders |
| 🃏 **Flashcards** | Anki-style flip cards with subject filtering |
| 📊 **Statistics** | Weekly bar chart, subject breakdown, study time tracking |
| 🤖 **AI Tutor** | Chat interface connected to Claude/OpenAI or smart fallback |
| 👤 **Profile** | Avatar, level, EXP system, achievements |
| 🎨 **Themes** | Dark Study, Anime Study, Library, Cyberpunk |
| ⏱️ **Study Timer** | Sidebar timer that auto-logs sessions to the database |

---

## 🔑 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/tasks` | Get all tasks |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task |
| PATCH | `/api/tasks/:id/toggle` | Toggle complete |
| DELETE | `/api/tasks/:id` | Delete task |
| PUT | `/api/tasks/reorder/bulk` | Reorder tasks |
| GET | `/api/flashcards` | Get all flashcards |
| POST | `/api/flashcards` | Create flashcard |
| PUT | `/api/flashcards/:id` | Update flashcard |
| DELETE | `/api/flashcards/:id` | Delete flashcard |
| GET | `/api/materials` | Get all materials |
| POST | `/api/materials` | Upload material/note |
| DELETE | `/api/materials/:id` | Delete material |
| GET | `/api/materials/subjects` | Get subject folders |
| POST | `/api/materials/subjects` | Create subject folder |
| GET | `/api/profile` | Get profile |
| POST | `/api/profile` | Update profile |
| POST | `/api/profile/exp` | Add EXP |
| GET | `/api/sessions` | Get sessions |
| POST | `/api/sessions` | Log study session |
| GET | `/api/sessions/stats` | Get statistics |
| POST | `/api/ai/chat` | AI tutor chat |

---

## 🤖 Enabling Real AI Responses

The AI tutor works out of the box with smart simulated responses. To enable real AI:

**Option A — Anthropic Claude (Recommended):**
1. Get an API key at [console.anthropic.com](https://console.anthropic.com)
2. Add `ANTHROPIC_API_KEY=sk-ant-...` to Render environment variables

**Option B — OpenAI GPT:**
1. Get an API key at [platform.openai.com](https://platform.openai.com)
2. Add `OPENAI_API_KEY=sk-...` to Render environment variables

The backend auto-detects which key is available. Anthropic is checked first.

---

## 🛡️ Security Notes

- Basic DevTools protection (F12, Ctrl+Shift+I blocking) is included
- For production, consider adding authentication (JWT/sessions)
- The `uploads/` folder should be served via a CDN in production (e.g., Cloudinary, AWS S3)
- Render free tier spins down after inactivity — first request may take ~30s to wake up

---

## 📦 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML5, CSS3, Vanilla JS |
| Backend | Node.js, Express.js |
| Database | Neon Postgres (serverless) |
| File Storage | Local (`/uploads` folder) |
| Frontend Deploy | Vercel |
| Backend Deploy | Render |
| AI | Anthropic Claude / OpenAI (optional) |
