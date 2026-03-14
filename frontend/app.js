/* =====================================================
   StudyFlow — Frontend Application Logic
   app.js
===================================================== */

'use strict';

// ─── Config ──────────────────────────────────────────
const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3001/api'
  : 'https://study-dashboard-api-b17y.onrender.com/api'; // ← Replace with your Render URL

// ─── State ───────────────────────────────────────────
let tasks = [];
let flashcards = [];
let filteredCards = [];
let currentCardIndex = 0;
let subjects = [];
let chatHistory = [];
let studyTimerInterval = null;
let studySeconds = 0;
let studyTimerRunning = false;
let studyTimerSubject = '';
let dragSrcIndex = null;
let currentFilter = 'all';
let currentSubjectFilter = 'all';
let selectedIcon = '📁';
let selectedAvatar = '🎓';
let profile = null;
let countdownInterval = null;

// ─── Anti DevTools (basic) ────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.key === 'F12') e.preventDefault();
  if (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key)) e.preventDefault();
  if (e.ctrlKey && e.key === 'U') e.preventDefault();
});
// Disable right-click (optional — comment out if unwanted)
// document.addEventListener('contextmenu', e => e.preventDefault());

// ─── Utilities ───────────────────────────────────────
const $ = id => document.getElementById(id);
const toast = (msg, type = 'success') => {
  const c = $('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3200);
};

async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`API error [${path}]:`, err.message);
    throw err;
  }
}

// ─── Navigation ───────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $(`page-${page}`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

  // Page-specific loads
  if (page === 'tasks') loadTasks();
  if (page === 'materials') { loadSubjects(); loadMaterials(); }
  if (page === 'flashcards') loadFlashcards();
  if (page === 'stats') loadStats();
  if (page === 'profile') loadProfile();
  if (page === 'ai') loadChatHistory();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => navigate(item.dataset.page));
});

// ─── Particles on Home ───────────────────────────────
function initParticles() {
  const container = $('particles');
  if (!container) return;
  for (let i = 0; i < 25; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 3 + 1;
    p.style.cssText = `
      width: ${size}px; height: ${size}px;
      left: ${Math.random() * 100}%;
      bottom: ${Math.random() * 50}%;
      animation-duration: ${Math.random() * 6 + 4}s;
      animation-delay: ${Math.random() * 5}s;
    `;
    container.appendChild(p);
  }
}

// ─── Countdown Timer ─────────────────────────────────
function startCountdown(examDate) {
  if (countdownInterval) clearInterval(countdownInterval);
  const update = () => {
    const now = new Date();
    const exam = new Date(examDate);
    const diff = exam - now;
    if (diff <= 0) {
      $('cdDays').textContent = '00';
      $('cdHours').textContent = '00';
      $('cdMins').textContent = '00';
      $('cdExamName').textContent = '🎉 Exam Day!';
      clearInterval(countdownInterval);
      return;
    }
    $('cdDays').textContent = String(Math.floor(diff / 86400000)).padStart(2, '0');
    $('cdHours').textContent = String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0');
    $('cdMins').textContent = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
  };
  update();
  countdownInterval = setInterval(update, 30000);
}

// ─── Study Timer (sidebar) ────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

function updateTimerDisplay() {
  const h = Math.floor(studySeconds / 3600);
  const m = Math.floor((studySeconds % 3600) / 60);
  const s = studySeconds % 60;
  $('miniTimerDisplay').textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function toggleStudyTimer() {
  if (studyTimerRunning) {
    clearInterval(studyTimerInterval);
    studyTimerRunning = false;
    $('timerBtn').textContent = '▶';
  } else {
    studyTimerRunning = true;
    $('timerBtn').textContent = '⏸';
    studyTimerInterval = setInterval(() => {
      studySeconds++;
      updateTimerDisplay();
    }, 1000);
  }
}

async function stopStudyTimer() {
  if (studyTimerRunning) {
    clearInterval(studyTimerInterval);
    studyTimerRunning = false;
    $('timerBtn').textContent = '▶';
  }
  const mins = Math.floor(studySeconds / 60);
  if (mins > 0) {
    const subject = prompt('What subject did you study? (optional)') || '';
    try {
      await apiFetch('/sessions', {
        method: 'POST',
        body: JSON.stringify({ subject, duration_minutes: mins }),
      });
      toast(`✅ Logged ${mins} minute${mins > 1 ? 's' : ''} of study!`);
    } catch { /* ignore */ }
  }
  studySeconds = 0;
  updateTimerDisplay();
}

// ─── TASKS ────────────────────────────────────────────
async function loadTasks() {
  const list = $('tasksList');
  list.innerHTML = '<div class="loading-state">Loading tasks...</div>';
  try {
    tasks = await apiFetch('/tasks');
    renderTasks();
  } catch {
    list.innerHTML = '<div class="loading-state">Failed to load tasks. Is the backend running?</div>';
  }
}

function renderTasks() {
  const list = $('tasksList');
  let filtered = tasks;
  if (currentFilter === 'pending') filtered = tasks.filter(t => !t.completed);
  if (currentFilter === 'done') filtered = tasks.filter(t => t.completed);

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="es-icon">📋</div><div class="es-text">No tasks here. Add one above!</div></div>`;
  } else {
    list.innerHTML = filtered.map((t, i) => `
      <div class="task-item ${t.completed ? 'completed' : ''}" draggable="true"
           data-id="${t.id}" data-index="${i}"
           ondragstart="dragStart(event,${i})"
           ondragover="dragOver(event)"
           ondrop="dropTask(event,${i})"
           ondragend="dragEnd(event)">
        <div class="task-checkbox ${t.completed ? 'checked' : ''}" onclick="toggleTask(${t.id})">
          ${t.completed ? '✓' : ''}
        </div>
        <div class="task-body">
          <div class="task-title">${escHtml(t.title)}</div>
          <div class="task-meta">
            ${t.subject ? `<span class="task-tag">${escHtml(t.subject)}</span>` : ''}
            ${t.deadline ? `<span class="task-deadline ${isOverdue(t.deadline) && !t.completed ? 'overdue' : ''}">${formatDate(t.deadline)}</span>` : ''}
          </div>
        </div>
        <button class="task-delete" onclick="deleteTask(${t.id})">✕</button>
      </div>
    `).join('');
  }

  // Update badge
  const pending = tasks.filter(t => !t.completed).length;
  const badge = $('taskBadge');
  if (pending > 0) { badge.textContent = pending; badge.style.display = 'flex'; }
  else badge.style.display = 'none';
}

async function addTask() {
  const title = $('taskTitle').value.trim();
  if (!title) return;
  const subject = $('taskSubject').value.trim();
  const deadline = $('taskDeadline').value;
  try {
    const task = await apiFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, subject, deadline }),
    });
    tasks.unshift(task);
    renderTasks();
    $('taskTitle').value = '';
    $('taskSubject').value = '';
    $('taskDeadline').value = '';
    toast('Task added!');
    await apiFetch('/profile/exp', { method: 'POST', body: JSON.stringify({ amount: 5 }) });
  } catch (err) { toast(err.message, 'error'); }
}

async function toggleTask(id) {
  try {
    const updated = await apiFetch(`/tasks/${id}/toggle`, { method: 'PATCH' });
    const idx = tasks.findIndex(t => t.id === id);
    if (idx > -1) tasks[idx] = updated;
    renderTasks();
    if (updated.completed) {
      toast('Task completed! +10 EXP ⭐');
      await apiFetch('/profile/exp', { method: 'POST', body: JSON.stringify({ amount: 10 }) });
      loadSidebarProfile();
    }
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteTask(id) {
  try {
    await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
    tasks = tasks.filter(t => t.id !== id);
    renderTasks();
    toast('Task deleted');
  } catch (err) { toast(err.message, 'error'); }
}

// Task filters
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTasks();
  });
});

// Drag & Drop
function dragStart(e, i) { dragSrcIndex = i; e.currentTarget.classList.add('dragging'); }
function dragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function dragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.task-item').forEach(el => el.classList.remove('drag-over'));
}
async function dropTask(e, targetIdx) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (dragSrcIndex === null || dragSrcIndex === targetIdx) return;

  let filtered = [...tasks];
  if (currentFilter === 'pending') filtered = tasks.filter(t => !t.completed);
  if (currentFilter === 'done') filtered = tasks.filter(t => t.completed);

  const moved = filtered.splice(dragSrcIndex, 1)[0];
  filtered.splice(targetIdx, 0, moved);

  // Update sort_order
  const updates = filtered.map((t, i) => ({ id: t.id, sort_order: i }));
  try {
    await apiFetch('/tasks/reorder/bulk', { method: 'PUT', body: JSON.stringify({ tasks: updates }) });
    tasks = await apiFetch('/tasks');
    renderTasks();
  } catch { /* silent */ }
  dragSrcIndex = null;
}

// ─── MATERIALS ────────────────────────────────────────
async function loadSubjects() {
  try {
    subjects = await apiFetch('/materials/subjects');
    renderSubjectChips();
    populateSubjectSelects();
  } catch { /* ignore */ }
}

function renderSubjectChips() {
  const row = $('subjectsRow');
  row.innerHTML = `<button class="subject-chip ${currentSubjectFilter === 'all' ? 'active' : ''}" data-id="all" onclick="filterBySubject('all', this)">All</button>`;
  subjects.forEach(s => {
    const chip = document.createElement('button');
    chip.className = `subject-chip ${currentSubjectFilter === s.id ? 'active' : ''}`;
    chip.dataset.id = s.id;
    chip.textContent = `${s.icon} ${s.name}`;
    chip.onclick = () => filterBySubject(s.id, chip);
    row.appendChild(chip);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'add-subject-btn';
  addBtn.textContent = '+ New Folder';
  addBtn.onclick = () => openModal('addSubjectModal');
  row.appendChild(addBtn);
}

function populateSubjectSelects() {
  ['matSubject', 'matFileSubject'].forEach(id => {
    const sel = $(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">No Subject</option>' +
      subjects.map(s => `<option value="${s.id}">${s.icon} ${s.name}</option>`).join('');
  });
}

function filterBySubject(id, btn) {
  currentSubjectFilter = id;
  document.querySelectorAll('#subjectsRow .subject-chip').forEach(c => c.classList.remove('active'));
  btn?.classList.add('active');
  loadMaterials();
}

async function loadMaterials() {
  const grid = $('materialsGrid');
  grid.innerHTML = '<div class="loading-state">Loading materials...</div>';
  try {
    const params = currentSubjectFilter !== 'all' ? `?subject_id=${currentSubjectFilter}` : '';
    const mats = await apiFetch(`/materials${params}`);
    if (mats.length === 0) {
      grid.innerHTML = `<div class="empty-state"><div class="es-icon">📁</div><div class="es-text">No materials yet. Add some notes or upload a file!</div></div>`;
      return;
    }
    grid.innerHTML = mats.map(m => `
      <div class="material-card" onclick="viewMaterial(${m.id}, '${escAttr(m.title)}', '${escAttr(m.file_type)}', '${escAttr(m.file_url || '')}', '${escAttr(m.content || '')}')">
        <div class="mat-type-icon">${matIcon(m.file_type)}</div>
        <div class="mat-title">${escHtml(m.title)}</div>
        ${m.subject_name ? `<span class="mat-subject-badge" style="background:${m.subject_color}22;color:${m.subject_color}">${escHtml(m.subject_name)}</span>` : ''}
        <button class="mat-delete" onclick="event.stopPropagation();deleteMaterial(${m.id})">✕</button>
      </div>
    `).join('');
  } catch {
    grid.innerHTML = '<div class="loading-state">Failed to load materials.</div>';
  }
}

function matIcon(type) {
  if (type === 'pdf') return '📄';
  if (type === 'image') return '🖼️';
  return '📝';
}

function viewMaterial(id, title, type, fileUrl, content) {
  if (fileUrl) {
    window.open(`${API.replace('/api','')}${fileUrl}`, '_blank');
  } else {
    alert(`📝 ${title}\n\n${content || '(no content)'}`);
  }
}

async function deleteMaterial(id) {
  try {
    await apiFetch(`/materials/${id}`, { method: 'DELETE' });
    loadMaterials();
    toast('Material deleted');
  } catch (err) { toast(err.message, 'error'); }
}

let materialTab = 'note';
function setMaterialTab(tab) {
  materialTab = tab;
  document.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  $('noteTab').style.display = tab === 'note' ? 'flex' : 'none';
  $('fileTab').style.display = tab === 'file' ? 'flex' : 'none';
  if (!$('noteTab').style.flexDirection) $('noteTab').style.flexDirection = 'column';
  $('noteTab').style.gap = '0.9rem';
}

// File drop zone setup
function setupFileDropZone() {
  const zone = $('fileDropZone');
  const input = $('fileInput');
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) {
      input.files = e.dataTransfer.files;
      $('filePreview').textContent = `📎 ${e.dataTransfer.files[0].name}`;
    }
  });
  input.addEventListener('change', () => {
    if (input.files[0]) $('filePreview').textContent = `📎 ${input.files[0].name}`;
  });
}

async function addMaterial() {
  try {
    if (materialTab === 'note') {
      const title = $('matTitle').value.trim();
      const subject_id = $('matSubject').value;
      const content = $('matContent').value.trim();
      if (!title && !content) return toast('Add a title or content', 'error');

      await apiFetch('/materials', {
        method: 'POST',
        body: JSON.stringify({ title: title || 'Untitled Note', subject_id, content, type: 'note' }),
      });
    } else {
      const fileInput = $('fileInput');
      const title = $('matFileTitle').value.trim();
      const subject_id = $('matFileSubject').value;
      const formData = new FormData();
      if (fileInput.files[0]) formData.append('file', fileInput.files[0]);
      if (title) formData.append('title', title);
      if (subject_id) formData.append('subject_id', subject_id);

      const res = await fetch(`${API}/materials`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
    }
    closeModal('addMaterialModal');
    loadMaterials();
    toast('Material saved!');
    $('matTitle').value = '';
    $('matContent').value = '';
    $('filePreview').textContent = '';
  } catch (err) { toast(err.message, 'error'); }
}

async function createSubject() {
  const name = $('newSubjectName').value.trim();
  if (!name) return;
  const color = $('newSubjectColor').value;
  const icon = selectedIcon;
  try {
    await apiFetch('/materials/subjects', {
      method: 'POST',
      body: JSON.stringify({ name, color, icon }),
    });
    closeModal('addSubjectModal');
    $('newSubjectName').value = '';
    loadSubjects();
    toast(`Folder "${name}" created!`);
  } catch (err) { toast(err.message, 'error'); }
}

function selectIcon(el) {
  document.querySelectorAll('.icon-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedIcon = el.dataset.icon;
}

// ─── FLASHCARDS ───────────────────────────────────────
async function loadFlashcards() {
  try {
    flashcards = await apiFetch('/flashcards');
    filteredCards = [...flashcards];
    currentCardIndex = 0;
    renderFCDeck();
    renderFCSubjectFilter();
    renderCurrentCard();
  } catch { /* ignore */ }
}

function renderFCSubjectFilter() {
  const container = $('fcSubjectFilter');
  const subjs = [...new Set(flashcards.map(c => c.subject).filter(Boolean))];
  container.innerHTML = `<button class="subject-chip active" onclick="filterCards('all', this)">All (${flashcards.length})</button>`;
  subjs.forEach(s => {
    const count = flashcards.filter(c => c.subject === s).length;
    const btn = document.createElement('button');
    btn.className = 'subject-chip';
    btn.textContent = `${s} (${count})`;
    btn.onclick = () => filterCards(s, btn);
    container.appendChild(btn);
  });
}

function filterCards(subject, btn) {
  document.querySelectorAll('#fcSubjectFilter .subject-chip').forEach(c => c.classList.remove('active'));
  btn?.classList.add('active');
  filteredCards = subject === 'all' ? [...flashcards] : flashcards.filter(c => c.subject === subject);
  currentCardIndex = 0;
  const card = $('fcCard');
  if (card.classList.contains('flipped')) card.classList.remove('flipped');
  renderCurrentCard();
}

function renderCurrentCard() {
  const card = $('fcCard');
  if (card.classList.contains('flipped')) card.classList.remove('flipped');
  if (filteredCards.length === 0) {
    $('fcQuestion').textContent = 'No flashcards yet. Create your first one!';
    $('fcAnswer').textContent = '—';
    $('fcCounter').textContent = '0 / 0';
    $('fcCardSubject').textContent = '';
  } else {
    const c = filteredCards[currentCardIndex];
    $('fcQuestion').textContent = c.question;
    $('fcAnswer').textContent = c.answer;
    $('fcCounter').textContent = `${currentCardIndex + 1} / ${filteredCards.length}`;
    $('fcCardSubject').textContent = c.subject ? `📚 ${c.subject}` : '';
  }
}

function flipCard() {
  if (filteredCards.length === 0) return;
  $('fcCard').classList.toggle('flipped');
}

function nextCard() {
  if (filteredCards.length === 0) return;
  currentCardIndex = (currentCardIndex + 1) % filteredCards.length;
  $('fcCard').classList.remove('flipped');
  setTimeout(renderCurrentCard, 100);
}

function prevCard() {
  if (filteredCards.length === 0) return;
  currentCardIndex = (currentCardIndex - 1 + filteredCards.length) % filteredCards.length;
  $('fcCard').classList.remove('flipped');
  setTimeout(renderCurrentCard, 100);
}

function renderFCDeck() {
  const deck = $('fcDeck');
  if (flashcards.length === 0) {
    deck.innerHTML = '';
    return;
  }
  deck.innerHTML = flashcards.map((c, i) => `
    <div class="fc-deck-item" onclick="jumpToCard(${i})">
      <div class="fdi-subject">${escHtml(c.subject || 'General')}</div>
      <div class="fdi-q">${escHtml(c.question)}</div>
      <button class="fdi-delete" onclick="event.stopPropagation();deleteFlashcard(${c.id})">✕</button>
    </div>
  `).join('');
}

function jumpToCard(i) {
  const idx = filteredCards.findIndex(c => c.id === flashcards[i].id);
  if (idx > -1) {
    currentCardIndex = idx;
    renderCurrentCard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

async function addFlashcard() {
  const question = $('cardQuestion').value.trim();
  const answer = $('cardAnswer').value.trim();
  const subject = $('cardSubject').value.trim() || 'General';
  if (!question || !answer) return toast('Question and answer are required', 'error');
  try {
    await apiFetch('/flashcards', { method: 'POST', body: JSON.stringify({ question, answer, subject }) });
    closeModal('addCardModal');
    $('cardQuestion').value = '';
    $('cardAnswer').value = '';
    $('cardSubject').value = '';
    loadFlashcards();
    toast('Flashcard created! +5 EXP');
    apiFetch('/profile/exp', { method: 'POST', body: JSON.stringify({ amount: 5 }) });
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteFlashcard(id) {
  try {
    await apiFetch(`/flashcards/${id}`, { method: 'DELETE' });
    flashcards = flashcards.filter(c => c.id !== id);
    filteredCards = filteredCards.filter(c => c.id !== id);
    if (currentCardIndex >= filteredCards.length) currentCardIndex = Math.max(0, filteredCards.length - 1);
    renderFCDeck();
    renderFCSubjectFilter();
    renderCurrentCard();
    toast('Card deleted');
  } catch (err) { toast(err.message, 'error'); }
}

// ─── STATS ────────────────────────────────────────────
async function loadStats() {
  try {
    const [stats, prof] = await Promise.all([
      apiFetch('/sessions/stats'),
      apiFetch('/profile'),
    ]);

    $('statToday').textContent = `${stats.today.hours}h ${stats.today.minutes}m`;
    $('statWeek').textContent = `${stats.week.hours}h ${stats.week.minutes}m`;
    $('statBest').textContent = stats.subjects[0]?.subject || '—';
    $('statTotal').textContent = `${Math.floor(prof.total_study_hours || 0)}h`;

    $('hsTodayHours').textContent = `${stats.today.hours}h ${stats.today.minutes}m`;
    $('hsWeekHours').textContent = `${stats.week.hours}h ${stats.week.minutes}m`;
    $('hsBestSubject').textContent = stats.subjects[0]?.subject || '—';

    renderWeekChart(stats.daily);
    renderSubjectChart(stats.subjects);
  } catch { /* ignore */ }
}

function renderWeekChart(daily) {
  const chart = $('weekChart');
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const today = new Date();
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const found = daily.find(r => r.day === key);
    week.push({ label: days[d.getDay()], minutes: found ? parseInt(found.minutes) : 0 });
  }
  const maxMin = Math.max(...week.map(d => d.minutes), 1);
  chart.innerHTML = week.map(d => `
    <div class="bar-wrap">
      <div class="bar" style="height:${Math.max((d.minutes / maxMin) * 100, d.minutes > 0 ? 5 : 0)}px"
           title="${Math.floor(d.minutes/60)}h ${d.minutes%60}m"></div>
      <div class="bar-label">${d.label}</div>
    </div>
  `).join('');
}

function renderSubjectChart(subjects) {
  const chart = $('subjectChart');
  if (!subjects.length) {
    chart.innerHTML = '<div class="empty-state" style="padding:1rem"><div class="es-text">No study sessions logged yet</div></div>';
    return;
  }
  const max = Math.max(...subjects.map(s => parseInt(s.total)), 1);
  const colors = ['#7c6fff','#ff6fb0','#4af0d4','#ffe05a','#ff9f43'];
  chart.innerHTML = subjects.map((s, i) => `
    <div class="sub-bar-row">
      <div class="sub-name">${escHtml(s.subject || 'Other')}</div>
      <div class="sub-bar-bg">
        <div class="sub-bar-fill" style="width:${(parseInt(s.total)/max)*100}%;background:${colors[i%colors.length]}"></div>
      </div>
      <div class="sub-mins">${Math.floor(parseInt(s.total)/60)}h</div>
    </div>
  `).join('');
}

async function logSession() {
  const subject = $('sessionSubject').value.trim();
  const hours = parseInt($('sessionHours').value) || 0;
  const mins = parseInt($('sessionMins').value) || 0;
  const note = $('sessionNote').value.trim();
  const total = hours * 60 + mins;
  if (!total) return toast('Enter study duration', 'error');
  try {
    await apiFetch('/sessions', { method: 'POST', body: JSON.stringify({ subject, duration_minutes: total, note }) });
    closeModal('logSessionModal');
    $('sessionSubject').value = '';
    $('sessionHours').value = '';
    $('sessionMins').value = '';
    $('sessionNote').value = '';
    loadStats();
    toast(`Logged ${hours}h ${mins}m!`);
  } catch (err) { toast(err.message, 'error'); }
}

// ─── AI TUTOR ─────────────────────────────────────────
let currentSubject = 'Chung';
let currentChatId = null;
let chatSessions = [];

function selectSubject(btn) {
  document.querySelectorAll('.ai-subj-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentSubject = btn.dataset.subject;
  const icon = btn.dataset.icon;
  $('aiSubjectIcon').textContent = icon;
  $('aiSubjectName').textContent = btn.querySelector('.asb-name').textContent;

  // Reset chat for new subject
  newChat(false);
  const greetings = {
    'Toán': '📐 Xin chào! Tôi là gia sư Toán của bạn. Hãy đưa ra bài toán hoặc khái niệm bạn cần giải thích!',
    'Lý': '⚡ Xin chào! Tôi chuyên về Vật Lý. Hỏi tôi về cơ học, điện học, quang học...',
    'Hóa': '🧪 Xin chào! Tôi là gia sư Hóa Học. Cần cân bằng phương trình hay giải thích phản ứng? Cứ hỏi!',
    'Văn': '📖 Xin chào! Tôi chuyên về Ngữ Văn. Phân tích tác phẩm, làm văn nghị luận — tôi sẵn sàng!',
    'Ngoại ngữ 1': '🌍 Hello! I am your English tutor. Tôi có thể giúp bạn về ngữ pháp, từ vựng, và luyện thi!',
    'Lịch sử': '🏛️ Xin chào! Tôi chuyên về Lịch Sử. Hỏi tôi về các sự kiện, nhân vật và giai đoạn lịch sử!',
    'Sinh': '🔬 Xin chào! Tôi là gia sư Sinh Học. Di truyền, tế bào, sinh thái — hỏi gì cũng được!',
    'Chung': '🤖 Xin chào! Tôi là Gia sư AI của bạn. Hãy chọn môn học bên phải hoặc đặt câu hỏi bất kỳ!',
  };
  const greeting = greetings[currentSubject] || greetings['Chung'];
  $('chatMessages').innerHTML = `
    <div class="chat-msg ai">
      <div class="chat-avatar">${icon}</div>
      <div class="chat-bubble"><p>${greeting}</p></div>
    </div>`;
}

async function loadChatHistory() {
  try {
    chatSessions = await apiFetch('/chats');
    renderChatHistory();
  } catch { /* ignore */ }
}

function renderChatHistory() {
  const list = $('aiHistoryList');
  if (!chatSessions.length) {
    list.innerHTML = '<div style="padding:0.8rem;font-size:0.72rem;color:var(--text-muted);text-align:center">Chưa có lịch sử</div>';
    return;
  }
  list.innerHTML = chatSessions.map(s => `
    <div class="ai-history-item ${s.id === currentChatId ? 'active' : ''}" onclick="loadChatSession(${s.id})">
      <div class="ahi-subject">${escHtml(s.subject || 'Chung')}</div>
      <div class="ahi-title">${escHtml(s.title || 'Cuộc trò chuyện')}</div>
      <div class="ahi-date">${formatTimeAgo(s.updated_at)}</div>
      <button class="ahi-delete" onclick="event.stopPropagation();deleteChatSession(${s.id})">✕</button>
    </div>
  `).join('');
}

async function loadChatSession(id) {
  try {
    const session = await apiFetch('/chats/' + id);
    currentChatId = id;
    chatHistory = session.messages || [];
    currentSubject = session.subject || 'Chung';

    // Update subject button
    document.querySelectorAll('.ai-subj-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.subject === currentSubject);
      if (b.dataset.subject === currentSubject) {
        $('aiSubjectIcon').textContent = b.dataset.icon;
        $('aiSubjectName').textContent = b.querySelector('.asb-name').textContent;
      }
    });

    // Render messages
    const container = $('chatMessages');
    container.innerHTML = chatHistory.map(m => `
      <div class="chat-msg ${m.role === 'user' ? 'user' : 'ai'}">
        <div class="chat-avatar">${m.role === 'user' ? '👤' : '🤖'}</div>
        <div class="chat-bubble">${m.role === 'user' ? escHtml(m.content) : formatAIResponse(m.content)}</div>
      </div>
    `).join('');
    container.scrollTop = container.scrollHeight;
    renderChatHistory();
  } catch (err) { toast('Lỗi tải chat', 'error'); }
}

async function saveChatSession() {
  if (!chatHistory.length) return toast('Chưa có tin nhắn để lưu', 'error');
  const firstMsg = chatHistory.find(m => m.role === 'user');
  const title = firstMsg ? firstMsg.content.substring(0, 40) + (firstMsg.content.length > 40 ? '...' : '') : 'Cuộc trò chuyện';
  try {
    if (currentChatId) {
      await apiFetch('/chats/' + currentChatId, {
        method: 'PUT',
        body: JSON.stringify({ title, messages: chatHistory }),
      });
    } else {
      const session = await apiFetch('/chats', {
        method: 'POST',
        body: JSON.stringify({ title, subject: currentSubject, messages: chatHistory }),
      });
      currentChatId = session.id;
    }
    await loadChatHistory();
    toast('Đã lưu cuộc trò chuyện! 💾');
  } catch (err) { toast('Lỗi lưu chat', 'error'); }
}

async function deleteChatSession(id) {
  try {
    await apiFetch('/chats/' + id, { method: 'DELETE' });
    if (currentChatId === id) newChat(false);
    chatSessions = chatSessions.filter(s => s.id !== id);
    renderChatHistory();
    toast('Đã xóa cuộc trò chuyện');
  } catch (err) { toast('Lỗi xóa', 'error'); }
}

function newChat(resetSubject = true) {
  currentChatId = null;
  chatHistory = [];
  if (resetSubject) {
    currentSubject = 'Chung';
    document.querySelectorAll('.ai-subj-btn').forEach(b => b.classList.toggle('active', b.dataset.subject === 'Chung'));
    $('aiSubjectIcon').textContent = '🤖';
    $('aiSubjectName').textContent = 'Gia sư AI';
  }
  $('chatMessages').innerHTML = `
    <div class="chat-msg ai">
      <div class="chat-avatar">🤖</div>
      <div class="chat-bubble">
        <p>Xin chào! Tôi là Gia sư AI của bạn. ✨</p>
        <p>Hãy chọn môn học bên phải rồi đặt câu hỏi nhé!</p>
      </div>
    </div>`;
  $('suggestedPrompts').style.display = 'flex';
  renderChatHistory();
}

function formatTimeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return Math.floor(diff/60) + ' phút trước';
  if (diff < 86400) return Math.floor(diff/3600) + ' giờ trước';
  return Math.floor(diff/86400) + ' ngày trước';
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function sendSuggestion(btn) {
  $('chatInput').value = btn.textContent;
  $('suggestedPrompts').style.display = 'none';
  sendMessage();
}

async function sendMessage() {
  const input = $('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  $('suggestedPrompts').style.display = 'none';

  const messages = $('chatMessages');
  messages.innerHTML += `
    <div class="chat-msg user">
      <div class="chat-avatar">👤</div>
      <div class="chat-bubble">${escHtml(msg)}</div>
    </div>`;

  const typing = document.createElement('div');
  typing.className = 'chat-msg ai';
  typing.id = 'typingIndicator';
  typing.innerHTML = `<div class="chat-avatar">🤖</div><div class="chat-bubble chat-typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
  messages.appendChild(typing);
  messages.scrollTop = messages.scrollHeight;

  chatHistory.push({ role: 'user', content: msg });

  try {
    const data = await apiFetch('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message: msg, history: chatHistory.slice(-10), subject: currentSubject }),
    });
    $('typingIndicator')?.remove();
    const reply = data.reply;
    chatHistory.push({ role: 'assistant', content: reply });
    messages.innerHTML += `
      <div class="chat-msg ai">
        <div class="chat-avatar">🤖</div>
        <div class="chat-bubble">${formatAIResponse(reply)}</div>
      </div>`;
  } catch {
    $('typingIndicator')?.remove();
    messages.innerHTML += `
      <div class="chat-msg ai">
        <div class="chat-avatar">🤖</div>
        <div class="chat-bubble">Xin lỗi, không thể kết nối. Hãy thử lại!</div>
      </div>`;
  }
  messages.scrollTop = messages.scrollHeight;
}

function formatAIResponse(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '</p><p>')
    .replace(/^/, '<p>').replace(/$/, '</p>');
}

function clearChat() {
  chatHistory = [];
  currentChatId = null;
  $('chatMessages').innerHTML = `
    <div class="chat-msg ai">
      <div class="chat-avatar">🤖</div>
      <div class="chat-bubble"><p>Chat đã được xóa! Hỏi tôi bất cứ điều gì nhé 😊</p></div>
    </div>`;
  $('suggestedPrompts').style.display = 'flex';
}

// ─── PROFILE ──────────────────────────────────────────
async function loadProfile() {
  document.getElementById('logoutBtn').style.display = 'block';
  try {
    profile = await apiFetch('/profile');
    $('profileName').value = profile.name || '';
    $('profileAvatar').textContent = profile.avatar || '🎓';
    selectedAvatar = profile.avatar || '🎓';
    if (profile.exam_date) $('profileExamDate').value = profile.exam_date.split('T')[0];
    $('profileTarget').value = profile.target_subject || '';

    const level = profile.level || 1;
    const exp = profile.exp || 0;
    const expNeeded = level * 100;
    const expPct = Math.min((exp % 100) / 100 * 100, 100);
    $('profileLevelBadge').textContent = `Lv.${level}`;
    $('profileExpFill').style.width = `${expPct}%`;
    $('profileExpText').textContent = `${exp % 100} / 100 EXP`;
    $('profileTotalHours').textContent = `${Math.floor(profile.total_study_hours || 0)}h`;

    // Task + card counts
    const [taskData, cardData] = await Promise.all([
      apiFetch('/tasks').catch(() => []),
      apiFetch('/flashcards').catch(() => []),
    ]);
    $('profileTasks').textContent = taskData.filter(t => t.completed).length;
    $('profileCards').textContent = cardData.length;
  } catch { /* ignore */ }
}

async function saveProfile() {
  const name = $('profileName').value.trim() || 'Student';
  const exam_date = $('profileExamDate').value;
  const target_subject = $('profileTarget').value.trim();
  try {
    profile = await apiFetch('/profile', {
      method: 'POST',
      body: JSON.stringify({ name, avatar: selectedAvatar, exam_date, target_subject }),
    });
    loadSidebarProfile();
    if (exam_date) startCountdown(exam_date);
    toast('Profile saved!');
  } catch (err) { toast(err.message, 'error'); }
}

function selectAvatar(el) {
  document.querySelectorAll('.av-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedAvatar = el.textContent;
  $('profileAvatar').textContent = selectedAvatar;
}

async function loadSidebarProfile() {
  try {
    const p = await apiFetch('/profile');
    $('avatarName').textContent = p.name || 'Student';
    $('avatarLevel').textContent = `Lv.${p.level || 1}`;
    $('avatarOrb', document.querySelector('.avatar-orb')); // ignore
    document.querySelector('.avatar-orb').textContent = p.avatar || '🎓';
    const expPct = ((p.exp || 0) % 100);
    $('expFill').style.width = `${expPct}%`;
    if (p.exam_date) startCountdown(p.exam_date);
  } catch { /* ignore */ }
}

// ─── THEMES ───────────────────────────────────────────
function applyTheme(theme, card) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('studyflow_theme', theme);
  document.querySelectorAll('.theme-card').forEach(c => {
    c.classList.remove('active');
    c.querySelector('.theme-check')?.remove();
  });
  card.classList.add('active');
  const info = card.querySelector('.theme-info');
  if (info && !info.querySelector('.theme-check')) {
    const check = document.createElement('span');
    check.className = 'theme-check';
    check.textContent = '✓';
    info.appendChild(check);
  }
  toast(`Theme "${theme}" applied!`);
}

function loadSavedTheme() {
  const saved = localStorage.getItem('studyflow_theme') || 'dark';
  document.body.setAttribute('data-theme', saved);
  const card = document.querySelector(`[data-theme="${saved}"]`);
  if (card) card.classList.add('active');
}

// ─── Modals ───────────────────────────────────────────
function openModal(id) { $(id)?.classList.add('open'); }
function closeModal(id) { $(id)?.classList.remove('open'); }

document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});

// ─── Helpers ──────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) { return String(str || '').replace(/'/g, "\\'").replace(/\n/g, ' '); }

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(dateStr) {
  return new Date(dateStr) < new Date();
}

// ─── Auth ─────────────────────────────────────────────
let currentUser = null;

async function checkAuth() {
  if (window.location.pathname.includes('login')) return false;
  try {
    const res = await fetch(API.replace('/api', '') + '/api/auth/me', {
      credentials: 'include',
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      window.location.href = '/login.html';
      return false;
    }
    const data = await res.json();
    if (!data.authenticated) {
      window.location.href = '/login.html';
      return false;
    }
    currentUser = data.user;
    return true;
  } catch (err) {
    console.warn('Auth check failed:', err.message);
    // Backend đang wake up - không redirect ngay, đợi rồi thử lại
    await new Promise(r => setTimeout(r, 3000));
    try {
      const res2 = await fetch(API.replace('/api', '') + '/api/auth/me', {
        credentials: 'include'
      });
      const data2 = await res2.json();
      if (data2.authenticated) { currentUser = data2.user; return true; }
    } catch {}
    window.location.href = '/login.html';
    return false;
  }
}

async function logout() {
  try {
    await fetch(API.replace('/api','') + '/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {}
  window.location.href = '/login.html';
}

// Override apiFetch to include credentials
const _origFetch = apiFetch;
async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      credentials: 'include',
      ...options,
    });
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (err.message && err.message.includes('login')) window.location.href = '/login.html';
    console.error(`API error [${path}]:`, err.message);
    throw err;
  }
}

// ─── Avatar Upload ────────────────────────────────────
function openAvatarUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async function() {
    if (!input.files[0]) return;
    const formData = new FormData();
    formData.append('avatar', input.files[0]);
    try {
      const res = await fetch(`${API}/profile/avatar`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const data = await res.json();
      if (data.url) {
        const fullUrl = API.replace('/api','') + data.url;
        updateAvatarDisplay(fullUrl);
        toast('Ảnh đại diện đã được cập nhật! 🎉');
      }
    } catch (err) { toast('Lỗi tải ảnh lên', 'error'); }
  };
  input.click();
}

function updateAvatarDisplay(url) {
  // Sidebar avatar
  const orb = document.querySelector('.avatar-orb');
  if (orb) { orb.innerHTML = `<img src="${url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover"/>`; }
  // Profile page avatar
  const pa = $('profileAvatar');
  if (pa) { pa.innerHTML = `<img src="${url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover"/>`; }
}

// ─── Init ─────────────────────────────────────────────
async function init() {
  loadSavedTheme();
  initParticles();
  setupFileDropZone();

  // Check login
  const authed = await checkAuth();
  if (!authed) return;

  // Load initial data
  await loadSidebarProfile();
  loadStats();
}

document.addEventListener('DOMContentLoaded', init);