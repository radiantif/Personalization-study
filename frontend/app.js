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
let currentLevel = null; // THCS | THPT | Đại học | Chung
let currentChatId = null;
let chatSessions = [];

// ─── LEVEL SELECTOR ──────────────────────────────────
function selectLevel(btn) {
  const level = btn.dataset.level;
  currentLevel = level;

  // Ẩn overlay, hiện chat
  const overlay = document.getElementById('aiLevelOverlay');
  const chat = document.getElementById('aiChatLayout');
  if (overlay) overlay.style.display = 'none';
  if (chat) chat.style.display = 'grid';

  // Cập nhật badge
  const badge = document.getElementById('aiLevelBadge');
  if (badge) {
    badge.textContent = level;
    badge.setAttribute('data-level', level);
  }

  // Hiện tin nhắn chào theo cấp
  const levelGreetings = {
    'THCS': '📗 Xin chào! Tôi sẽ giải thích theo chương trình **THCS** (lớp 6-9) — ngôn ngữ đơn giản, dễ hiểu, có nhiều ví dụ thực tế. Bạn cần giúp gì nào?',
    'THPT': '📘 Xin chào! Tôi sẽ giải theo chương trình **THPT** (lớp 10-12) — đúng phương pháp thi, có công thức và bước giải chuẩn. Hỏi gì đi!',
    'Đại học': '📙 Xin chào! Tôi sẽ giải ở mức **Đại học** — lý thuyết chuyên sâu, chứng minh đầy đủ, kết nối với ứng dụng thực tiễn. Bạn cần hỗ trợ gì?',
    'Chung': '🌐 Xin chào! Tôi sẽ giải thích theo cách **phổ thông nhất** — phù hợp mọi cấp độ. Cứ hỏi thoải mái nhé!',
  };

  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    chatMessages.innerHTML = `
      <div class="chat-msg ai">
        <div class="chat-avatar">🤖</div>
        <div class="chat-bubble">${formatAIResponse(levelGreetings[level] || levelGreetings['Chung'])}</div>
      </div>`;
  }

  // Load chat history
  loadChatHistory();
}

function showLevelSelector() {
  const overlay = document.getElementById('aiLevelOverlay');
  const chat = document.getElementById('aiChatLayout');
  if (overlay) overlay.style.display = 'flex';
  if (chat) chat.style.display = 'none';
  currentLevel = null;
}

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
  // Nếu chưa chọn cấp độ thì hiện overlay
  if (!currentLevel) {
    const overlay = document.getElementById('aiLevelOverlay');
    const chat = document.getElementById('aiChatLayout');
    if (overlay) overlay.style.display = 'flex';
    if (chat) chat.style.display = 'none';
    return;
  }
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
      body: JSON.stringify({ message: msg, history: chatHistory.slice(-10), subject: currentSubject, level: currentLevel || 'Chung' }),
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
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'block';
  try {
    profile = await apiFetch('/profile');
    if ($('profileName')) $('profileName').value = profile.name || '';

    // Hiển thị avatar — ưu tiên ảnh tải lên, rồi emoji
    const avatarEl = $('profileAvatar');
    if (avatarEl) {
      if (profile.custom_avatar) {
        const url = profile.custom_avatar.startsWith('http')
          ? profile.custom_avatar
          : API.replace('/api', '') + profile.custom_avatar;
        avatarEl.innerHTML = `<img src="${url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover"/><div class="avatar-upload-overlay">📷</div>`;
        updateAvatarDisplay(url);
      } else {
        avatarEl.innerHTML = `${profile.avatar || '🎓'}<div class="avatar-upload-overlay">📷</div>`;
      }
    }

    selectedAvatar = profile.avatar || '🎓';
    if (profile.exam_date && $('profileExamDate')) $('profileExamDate').value = profile.exam_date.split('T')[0];
    if ($('profileTarget')) $('profileTarget').value = profile.target_subject || '';

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

    // Tên và cấp độ
    if ($('avatarName')) $('avatarName').textContent = p.name || 'Student';
    if ($('avatarLevel')) $('avatarLevel').textContent = `Lv.${p.level || 1}`;

    // Ảnh đại diện — ưu tiên custom_avatar (ảnh tải lên), rồi emoji
    const orb = document.querySelector('.avatar-orb');
    if (orb) {
      if (p.custom_avatar) {
        // URL Cloudinary đã đầy đủ, không cần ghép thêm
        const url = p.custom_avatar.startsWith('http')
          ? p.custom_avatar
          : API.replace('/api', '') + p.custom_avatar;
        orb.innerHTML = `<img src="${url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`;
      } else {
        orb.textContent = p.avatar || '🎓';
      }
    }

    // EXP bar
    const expPct = (p.exp || 0) % 100;
    if ($('expFill')) $('expFill').style.width = `${expPct}%`;

    // Đếm ngược exam
    if (p.exam_date) startCountdown(p.exam_date);

    // Cập nhật cached user
    localStorage.setItem('sf_user', JSON.stringify(p));

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

function getToken() {
  return localStorage.getItem('sf_token');
}

async function checkAuth() {
  if (window.location.pathname.includes('login')) return false;
  const token = getToken();
  if (!token) {
    window.location.href = '/login.html';
    return false;
  }
  try {
    const res = await fetch(API + '/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (!data.authenticated) {
      localStorage.removeItem('sf_token');
      localStorage.removeItem('sf_user');
      window.location.href = '/login.html';
      return false;
    }
    currentUser = data.user;
    return true;
  } catch {
    const cached = localStorage.getItem('sf_user');
    if (cached) { currentUser = JSON.parse(cached); return true; }
    window.location.href = '/login.html';
    return false;
  }
}

async function logout() {
  localStorage.removeItem('sf_token');
  localStorage.removeItem('sf_user');
  window.location.href = '/login.html';
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  try {
    const res = await fetch(`${API}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? 'Bearer ' + token : '',
        ...options.headers
      },
      ...options,
    });
    if (res.status === 401) {
      localStorage.removeItem('sf_token');
      localStorage.removeItem('sf_user');
      window.location.href = '/login.html';
      return;
    }
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



// ─── Avatar Upload ────────────────────────────────────
function openAvatarUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async function() {
    if (!input.files[0]) return;

    // Kiểm tra dung lượng file
    if (input.files[0].size > 5 * 1024 * 1024) {
      toast('File quá lớn! Tối đa 5MB', 'error');
      return;
    }

    // Hiện toast đang tải
    toast('⏳ Đang tải ảnh lên...');

    const formData = new FormData();
    formData.append('avatar', input.files[0]);
    try {
      const res = await fetch(`${API}/profile/avatar`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken() },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast('❌ ' + (data.error || 'Lỗi tải ảnh lên'), 'error');
        return;
      }

      if (data.url) {
        // Cloudinary trả về URL đầy đủ — không cần ghép thêm gì
        const fullUrl = data.url.startsWith('http')
          ? data.url
          : API.replace('/api', '') + data.url;

        updateAvatarDisplay(fullUrl);

        // Cập nhật cached user
        const cached = localStorage.getItem('sf_user');
        if (cached) {
          const user = JSON.parse(cached);
          user.custom_avatar = data.url;
          localStorage.setItem('sf_user', JSON.stringify(user));
        }

        toast('✅ Ảnh đại diện đã cập nhật!');
      }
    } catch (err) {
      console.error('Avatar upload error:', err);
      toast('❌ Không thể kết nối server', 'error');
    }
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
// ═══════════════════════════════════════════════════════
// EXTENDED FEATURES
// ═══════════════════════════════════════════════════════

// ─── PWA Service Worker ───────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('✅ PWA ready'))
      .catch(() => {});
  });
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  // Show install button in sidebar
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) btn.style.display = 'flex';
});

async function installPWA() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') toast('StudyFlow đã được cài đặt! 📱');
  deferredPrompt = null;
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) btn.style.display = 'none';
}

// Request notification permission for deadline alerts
async function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') toast('✅ Đã bật thông báo nhắc học!');
  }
}

function sendNotif(title, body, url = '/') {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icon-192.png', data: { url } });
  }
}

// ─── POMODORO TIMER ───────────────────────────────────
let pomo = {
  mode: 'work', seconds: 25*60, running: false,
  interval: null, cycles: 0,
  work: 25, short: 5, long: 15
};

function openPomodoro() {
  let modal = $('pomodoroModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'pomodoroModal';
    modal.innerHTML = `
      <div class="modal-content card pomo-card">
        <div class="modal-header">
          <h2>⏱️ Pomodoro</h2>
          <button class="modal-close" onclick="closeModal('pomodoroModal')">✕</button>
        </div>
        <div class="pomo-tabs">
          <button class="pomo-tab active" onclick="setPomoMode('work',this)">🎯 Học</button>
          <button class="pomo-tab" onclick="setPomoMode('short',this)">☕ Nghỉ ngắn</button>
          <button class="pomo-tab" onclick="setPomoMode('long',this)">🌙 Nghỉ dài</button>
        </div>
        <div class="pomo-ring-wrap">
          <svg viewBox="0 0 120 120" class="pomo-svg">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8"/>
            <circle id="pomoRing" cx="60" cy="60" r="52" fill="none" stroke="var(--accent)"
              stroke-width="8" stroke-dasharray="326.7" stroke-dashoffset="0"
              stroke-linecap="round" transform="rotate(-90 60 60)"
              style="transition:stroke-dashoffset 1s linear,stroke 0.3s"/>
          </svg>
          <div class="pomo-center">
            <div class="pomo-time" id="pomoTime">25:00</div>
            <div class="pomo-cycles" id="pomoInfo">🍅 ×0</div>
          </div>
        </div>
        <input type="text" id="pomoSubject" class="input-field" placeholder="Môn học (tuỳ chọn)" style="margin:0.5rem 0"/>
        <div class="pomo-btns">
          <button class="btn btn-ghost" onclick="resetPomo()">↩</button>
          <button class="btn btn-primary" id="pomoBtn" onclick="togglePomo()">▶ Bắt đầu</button>
          <button class="btn btn-ghost" onclick="skipPomo()">⏭</button>
        </div>
        <div class="pomo-settings-row">
          <label>Học: <input type="number" id="pomoW" value="25" min="1" max="99" style="width:45px" class="input-field" onchange="updatePomoDur()"/> phút</label>
          <label>Ngắn: <input type="number" id="pomoS" value="5" min="1" max="30" style="width:45px" class="input-field" onchange="updatePomoDur()"/> phút</label>
          <label>Dài: <input type="number" id="pomoL" value="15" min="1" max="60" style="width:45px" class="input-field" onchange="updatePomoDur()"/> phút</label>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
  }
  modal.classList.add('open');
  renderPomo();
}

function renderPomo() {
  const total = pomo.mode==='work' ? pomo.work*60 : pomo.mode==='short' ? pomo.short*60 : pomo.long*60;
  const pct = pomo.seconds / total;
  const c = 326.7;
  const ring = $('pomoRing');
  if (ring) {
    ring.style.strokeDashoffset = c * (1-pct);
    ring.style.stroke = pomo.mode==='work' ? 'var(--accent)' : pomo.mode==='short' ? 'var(--accent3)' : 'var(--accent2)';
  }
  const t = $('pomoTime'); if (t) t.textContent = `${pad(Math.floor(pomo.seconds/60))}:${pad(pomo.seconds%60)}`;
  const info = $('pomoInfo'); if (info) info.textContent = `🍅 ×${pomo.cycles}`;
  const btn = $('pomoBtn'); if (btn) btn.textContent = pomo.running ? '⏸ Dừng' : '▶ Bắt đầu';
}

function togglePomo() {
  if (pomo.running) { clearInterval(pomo.interval); pomo.running = false; }
  else {
    requestNotifPermission();
    pomo.running = true;
    pomo.interval = setInterval(async () => {
      pomo.seconds--;
      renderPomo();
      if (pomo.seconds <= 0) await finishPomo();
    }, 1000);
  }
  renderPomo();
}

async function finishPomo() {
  clearInterval(pomo.interval); pomo.running = false;
  if (pomo.mode === 'work') {
    pomo.cycles++;
    const subj = $('pomoSubject')?.value || '';
    try { await apiFetch('/sessions', { method:'POST', body:JSON.stringify({ subject:subj, duration_minutes:pomo.work }) }); } catch {}
    toast(`🍅 Xong! +${pomo.work} phút đã lưu`);
    sendNotif('StudyFlow — Nghỉ giải lao!', `Bạn đã học ${pomo.work} phút. Hãy nghỉ ngơi!`);
    setPomoMode(pomo.cycles%4===0 ? 'long' : 'short');
    setTimeout(togglePomo, 800);
  } else {
    toast('☕ Hết giờ nghỉ! Tiếp tục học nào 💪');
    sendNotif('StudyFlow — Bắt đầu học!', 'Hết giờ nghỉ rồi. Cố lên!');
    setPomoMode('work');
    setTimeout(togglePomo, 800);
  }
}

function setPomoMode(mode, btn) {
  pomo.mode = mode;
  pomo.seconds = mode==='work' ? pomo.work*60 : mode==='short' ? pomo.short*60 : pomo.long*60;
  pomo.running = false; clearInterval(pomo.interval);
  document.querySelectorAll('.pomo-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else {
    const idx = {'work':0,'short':1,'long':2}[mode];
    document.querySelectorAll('.pomo-tab')[idx]?.classList.add('active');
  }
  renderPomo();
}

function resetPomo() { clearInterval(pomo.interval); pomo.running=false; pomo.seconds=pomo.mode==='work'?pomo.work*60:pomo.mode==='short'?pomo.short*60:pomo.long*60; renderPomo(); }
function skipPomo() { pomo.seconds=0; finishPomo(); }
function updatePomoDur() {
  pomo.work=parseInt($('pomoW')?.value)||25; pomo.short=parseInt($('pomoS')?.value)||5; pomo.long=parseInt($('pomoL')?.value)||15;
  resetPomo();
}

// ─── CALENDAR / DEADLINE VIEW ─────────────────────────
function openCalendar() {
  let modal = $('calendarModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'calendarModal';
    modal.innerHTML = `
      <div class="modal-content card" style="max-width:600px">
        <div class="modal-header">
          <h2>📅 Lịch học & Deadline</h2>
          <button class="modal-close" onclick="closeModal('calendarModal')">✕</button>
        </div>
        <div class="cal-nav">
          <button class="btn btn-ghost" onclick="changeCalMonth(-1)">←</button>
          <span id="calTitle" style="font-family:var(--font-display);font-size:1.1rem"></span>
          <button class="btn btn-ghost" onclick="changeCalMonth(1)">→</button>
        </div>
        <div class="cal-grid" id="calGrid"></div>
        <div class="cal-upcoming" id="calUpcoming"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
  }
  modal.classList.add('open');
  renderCalendar();
}

let calDate = new Date();
function changeCalMonth(delta) { calDate.setMonth(calDate.getMonth()+delta); renderCalendar(); }

async function renderCalendar() {
  const title = $('calTitle');
  const grid = $('calGrid');
  const upcoming = $('calUpcoming');
  if (!grid) return;

  const months = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
  if (title) title.textContent = `${months[calDate.getMonth()]} ${calDate.getFullYear()}`;

  // Get tasks with deadlines
  let deadlines = {};
  try {
    const all = tasks.length ? tasks : await apiFetch('/tasks');
    all.forEach(t => { if (t.deadline) { const d = t.deadline.split('T')[0]; if (!deadlines[d]) deadlines[d] = []; deadlines[d].push(t); }});
  } catch {}

  const year = calDate.getFullYear(), month = calDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  const days = ['CN','T2','T3','T4','T5','T6','T7'];
  let html = days.map(d => `<div class="cal-day-header">${d}</div>`).join('');

  for (let i=0; i<firstDay; i++) html += '<div class="cal-day empty"></div>';
  for (let d=1; d<=daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === today;
    const hasTasks = deadlines[dateStr];
    html += `<div class="cal-day ${isToday?'today':''} ${hasTasks?'has-task':''}" onclick="showDayTasks('${dateStr}')">
      <span>${d}</span>
      ${hasTasks ? `<div class="cal-dot">${hasTasks.length}</div>` : ''}
    </div>`;
  }
  grid.innerHTML = html;

  // Upcoming deadlines
  const upcomingTasks = Object.entries(deadlines)
    .filter(([d]) => d >= today)
    .sort(([a],[b]) => a.localeCompare(b))
    .slice(0, 5);

  if (upcoming) {
    if (!upcomingTasks.length) { upcoming.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:1rem;font-size:0.82rem">Không có deadline sắp tới</div>'; return; }
    upcoming.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem">Deadline sắp tới</div>' +
      upcomingTasks.map(([date, tasks]) =>
        tasks.map(t => `<div class="cal-upcoming-item ${t.completed?'done':''}">
          <span class="cui-date">${formatDate(date)}</span>
          <span class="cui-title">${escHtml(t.title)}</span>
          ${t.subject ? `<span class="task-tag">${escHtml(t.subject)}</span>` : ''}
        </div>`).join('')
      ).join('');
  }
}

function showDayTasks(dateStr) {
  const dayTasks = tasks.filter(t => t.deadline && t.deadline.startsWith(dateStr));
  if (!dayTasks.length) return;
  const lines = dayTasks.map(t => `${t.completed ? '✅' : '⬜'} ${t.title}`).join('\n');
  alert(`📅 ${formatDate(dateStr)}\n\n${lines}`);
}

// ─── AI TOOLS ─────────────────────────────────────────
function openAITools() {
  let modal = $('aiToolsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'aiToolsModal';
    modal.innerHTML = `
      <div class="modal-content card" style="max-width:560px">
        <div class="modal-header">
          <h2>🤖 AI Tools</h2>
          <button class="modal-close" onclick="closeModal('aiToolsModal')">✕</button>
        </div>
        <div class="ai-tools-tabs">
          <button class="ait-tab active" onclick="setAITab('flashcard',this)">🃏 Tạo Flashcard</button>
          <button class="ait-tab" onclick="setAITab('summary',this)">📄 Tóm tắt</button>
          <button class="ait-tab" onclick="setAITab('quiz',this)">🧠 Quiz</button>
        </div>

        <div id="ait-flashcard">
          <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem">Nhập văn bản → AI tự tạo flashcard</p>
          <textarea id="aitFCText" class="input-field textarea" placeholder="Dán văn bản, ghi chú, hoặc nội dung sách vào đây..." rows="5"></textarea>
          <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.5rem">
            <input type="text" id="aitFCSubject" class="input-field" placeholder="Môn học" style="flex:1"/>
            <select id="aitFCCount" class="input-field" style="width:80px">
              <option value="3">3 thẻ</option>
              <option value="5" selected>5 thẻ</option>
              <option value="10">10 thẻ</option>
            </select>
          </div>
          <div id="aitFCPreview" style="margin-top:0.8rem"></div>
          <div class="modal-footer" style="margin-top:0.5rem">
            <button class="btn btn-ghost" onclick="closeModal('aiToolsModal')">Huỷ</button>
            <button class="btn btn-primary" onclick="genFlashcards()">✨ Tạo Flashcard</button>
          </div>
        </div>

        <div id="ait-summary" style="display:none">
          <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem">AI tóm tắt nội dung thành điểm chính</p>
          <textarea id="aitSumText" class="input-field textarea" placeholder="Dán nội dung cần tóm tắt..." rows="6"></textarea>
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
            <button class="btn btn-ghost ${''}" onclick="setSumStyle('bullet')" id="sumBulletBtn" style="flex:1">• Bullet points</button>
            <button class="btn btn-ghost" onclick="setSumStyle('paragraph')" id="sumParaBtn" style="flex:1">¶ Đoạn văn</button>
          </div>
          <div id="aitSumResult" style="margin-top:0.8rem"></div>
          <div class="modal-footer" style="margin-top:0.5rem">
            <button class="btn btn-ghost" onclick="closeModal('aiToolsModal')">Huỷ</button>
            <button class="btn btn-primary" onclick="genSummary()">✨ Tóm tắt</button>
          </div>
        </div>

        <div id="ait-quiz" style="display:none">
          <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem">AI tạo quiz trắc nghiệm từ nội dung</p>
          <textarea id="aitQuizText" class="input-field textarea" placeholder="Dán nội dung để tạo câu hỏi..." rows="4"></textarea>
          <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.5rem">
            <input type="text" id="aitQuizSubject" class="input-field" placeholder="Môn học" style="flex:1"/>
            <select id="aitQuizCount" class="input-field" style="width:80px">
              <option value="3">3 câu</option>
              <option value="5" selected>5 câu</option>
              <option value="10">10 câu</option>
            </select>
          </div>
          <div id="aitQuizResult" style="margin-top:0.8rem;max-height:300px;overflow-y:auto"></div>
          <div class="modal-footer" style="margin-top:0.5rem">
            <button class="btn btn-ghost" onclick="closeModal('aiToolsModal')">Huỷ</button>
            <button class="btn btn-primary" onclick="genQuiz()">✨ Tạo Quiz</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
  }
  modal.classList.add('open');
}

let aiTab = 'flashcard', sumStyle = 'bullet';
function setAITab(tab, btn) {
  aiTab = tab;
  document.querySelectorAll('.ait-tab').forEach(t=>t.classList.remove('active'));
  btn?.classList.add('active');
  ['flashcard','summary','quiz'].forEach(t => {
    const el = $('ait-'+t); if (el) el.style.display = t===tab?'block':'none';
  });
}
function setSumStyle(s) { sumStyle=s; $('sumBulletBtn')?.classList.toggle('btn-primary',s==='bullet'); $('sumParaBtn')?.classList.toggle('btn-primary',s==='paragraph'); }

async function genFlashcards() {
  const text = $('aitFCText')?.value.trim();
  const subject = $('aitFCSubject')?.value.trim() || 'Chung';
  const count = parseInt($('aitFCCount')?.value) || 5;
  if (!text) return toast('Vui lòng nhập văn bản', 'error');

  const preview = $('aitFCPreview');
  if (preview) preview.innerHTML = '<div class="loading-state" style="padding:0.8rem">🤖 Đang tạo flashcard...</div>';

  try {
    const data = await apiFetch('/ai/generate-flashcards', {
      method: 'POST', body: JSON.stringify({ text, subject, count })
    });
    const cards = data.cards;
    if (!cards?.length) return toast('Không tạo được flashcard', 'error');

    if (preview) {
      preview.innerHTML = `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem">Xem trước ${cards.length} thẻ:</div>` +
        cards.map((c,i) => `<div class="fc-preview-item"><span class="fc-pre-num">${i+1}</span><div><div style="font-weight:600;font-size:0.82rem">Q: ${escHtml(c.question)}</div><div style="color:var(--text-muted);font-size:0.78rem">A: ${escHtml(c.answer)}</div></div></div>`).join('');
    }

    // Save button
    const footer = preview.nextElementSibling;
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.style.marginTop = '0.5rem';
    saveBtn.textContent = `💾 Lưu ${cards.length} thẻ vào bộ sưu tập`;
    saveBtn.onclick = async () => {
      try {
        await apiFetch('/flashcards/bulk', { method:'POST', body:JSON.stringify({ cards, subject }) });
        toast(`Đã lưu ${cards.length} flashcard! 🎉`);
        closeModal('aiToolsModal');
        if (document.getElementById('page-flashcards').classList.contains('active')) loadFlashcards();
      } catch (err) { toast(err.message, 'error'); }
    };
    if (preview) preview.appendChild(saveBtn);
  } catch (err) { toast(err.message, 'error'); if (preview) preview.innerHTML=''; }
}

async function genSummary() {
  const text = $('aitSumText')?.value.trim();
  if (!text) return toast('Vui lòng nhập nội dung', 'error');
  const result = $('aitSumResult');
  if (result) result.innerHTML = '<div class="loading-state" style="padding:0.8rem">🤖 Đang tóm tắt...</div>';
  try {
    const data = await apiFetch('/ai/summarize', { method:'POST', body:JSON.stringify({ text, style: sumStyle }) });
    if (result) result.innerHTML = `<div class="ai-summary-result">${formatAIResponse(data.summary)}<br><button class="btn btn-ghost" style="margin-top:0.5rem;font-size:0.75rem" onclick="saveAsNote(this)">📝 Lưu thành ghi chú</button></div>`;
    result._summaryText = data.summary;
  } catch (err) { toast(err.message,'error'); if (result) result.innerHTML=''; }
}

async function genQuiz() {
  const text = $('aitQuizText')?.value.trim();
  const subject = $('aitQuizSubject')?.value.trim() || 'Chung';
  const count = parseInt($('aitQuizCount')?.value) || 5;
  if (!text) return toast('Vui lòng nhập nội dung', 'error');
  const result = $('aitQuizResult');
  if (result) result.innerHTML = '<div class="loading-state" style="padding:0.8rem">🤖 Đang tạo quiz...</div>';
  try {
    const data = await apiFetch('/ai/generate-quiz', { method:'POST', body:JSON.stringify({ text, subject, count }) });
    renderQuiz(data.questions, result);
  } catch (err) { toast(err.message,'error'); if (result) result.innerHTML=''; }
}

let quizAnswers = {};
function renderQuiz(questions, container) {
  quizAnswers = {};
  container.innerHTML = questions.map((q,qi) => `
    <div class="quiz-item" id="quiz-${qi}">
      <div class="quiz-q"><span class="quiz-num">${qi+1}</span>${escHtml(q.question)}</div>
      <div class="quiz-opts">
        ${q.options.map((o,oi) => `<button class="quiz-opt" onclick="answerQuiz(${qi},${oi},${q.correct},'${escAttr(q.explanation||'')}')">${escHtml(o)}</button>`).join('')}
      </div>
    </div>`).join('') +
    `<button class="btn btn-primary" style="width:100%;margin-top:1rem" onclick="scoreQuiz(${questions.length})">📊 Xem kết quả</button>`;
}

function answerQuiz(qi, oi, correct, explanation) {
  quizAnswers[qi] = oi;
  const item = $(`quiz-${qi}`);
  if (!item) return;
  item.querySelectorAll('.quiz-opt').forEach((btn, i) => {
    btn.disabled = true;
    if (i === correct) btn.classList.add('correct');
    else if (i === oi && oi !== correct) btn.classList.add('wrong');
  });
  if (explanation) {
    const exp = document.createElement('div');
    exp.className = 'quiz-explanation';
    exp.textContent = '💡 ' + explanation;
    item.appendChild(exp);
  }
}

function scoreQuiz(total) {
  const correct = Object.values(quizAnswers).filter((a,i) => a === parseInt(Object.keys(quizAnswers)[i])).length;
  const score = Object.entries(quizAnswers).filter(([qi, ans]) => {
    const item = $(`quiz-${qi}`);
    return item?.querySelector('.quiz-opt.correct')?.classList.contains('quiz-opt');
  }).length;
  toast(`📊 Kết quả: ${Object.keys(quizAnswers).length}/${total} câu đã trả lời`);
}

// ─── FLASHCARD SHARING ────────────────────────────────
async function shareFlashcardDeck(subject) {
  if (!subject) { subject = prompt('Nhập tên môn học muốn chia sẻ:'); if (!subject) return; }
  try {
    const data = await apiFetch('/flashcards/share', { method:'POST', body:JSON.stringify({ subject }) });
    const url = data.shareUrl;
    // Copy to clipboard
    navigator.clipboard?.writeText(url).then(() => toast('📋 Đã copy link chia sẻ!'));
    prompt('Link chia sẻ bộ thẻ:', url);
  } catch (err) { toast(err.message, 'error'); }
}

// ─── DEADLINE NOTIFICATIONS CHECK ────────────────────
function checkDeadlineNotifications() {
  if (!tasks.length) return;
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate()+1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  tasks.filter(t => !t.completed && t.deadline).forEach(t => {
    const dl = new Date(t.deadline);
    const daysLeft = Math.ceil((dl-now) / 86400000);
    if (daysLeft === 1) {
      sendNotif(`⚠️ Deadline ngày mai!`, `Task: ${t.title}`, '/');
    } else if (daysLeft === 0) {
      sendNotif(`🚨 Deadline hôm nay!`, `Task: ${t.title}`, '/');
    }
  });
}

// ═══════════════════════════════════════════════════════
// NEW FEATURES v2
// ═══════════════════════════════════════════════════════

// ─── PWA Setup ────────────────────────────────────────
function initPWA() {
  // Service Worker đã được đăng ký ở trên
  // Chỉ xử lý install banner ở đây
}

function showInstallBanner(prompt) {
  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:9999;background:var(--card-bg);border:1px solid var(--accent);border-radius:16px;padding:1rem 1.2rem;display:flex;align-items:center;gap:0.8rem;box-shadow:0 8px 30px rgba(0,0,0,0.3);backdrop-filter:blur(12px);animation:slideInRight 0.3s ease;';
  banner.innerHTML = `<span style="font-size:1.5rem">📱</span><div><div style="font-weight:700;font-size:0.85rem">Cài StudyFlow</div><div style="font-size:0.72rem;color:var(--text-muted)">Dùng như app trên điện thoại</div></div><button onclick="installApp()" style="background:var(--accent);color:white;border:none;border-radius:8px;padding:0.4rem 0.8rem;font-size:0.78rem;font-weight:700;cursor:pointer;font-family:inherit">Cài</button><button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem">✕</button>`;
  document.body.appendChild(banner);
  window._installPrompt = prompt;
}

function installApp() {
  if (window._installPrompt) { window._installPrompt.prompt(); document.getElementById('installBanner')?.remove(); }
}

// ─── CALENDAR ─────────────────────────────────────────
let calendarDate = new Date();
let calendarEvents = [];

async function loadCalendar() {
  const month = calendarDate.getMonth() + 1;
  const year = calendarDate.getFullYear();
  try {
    calendarEvents = await apiFetch(`/calendar?month=${month}&year=${year}`);
    renderCalendar();
    renderUpcoming();
  } catch { renderCalendar(); }
}

function renderCalendar() {
  const grid = $('calendarGrid');
  if (!grid) return;
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  $('calMonthLabel').textContent = calendarDate.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  let html = '';
  // Day headers
  ['CN','T2','T3','T4','T5','T6','T7'].forEach(d => { html += `<div class="cal-header-cell">${d}</div>`; });
  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';
  // Days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayEvents = calendarEvents.filter(e => e.event_date && e.event_date.startsWith(dateStr));
    const isToday = today.getDate()===d && today.getMonth()===month && today.getFullYear()===year;
    const hasEvents = dayEvents.length > 0;

    // Build event tooltip content
    const tooltipContent = hasEvents ? dayEvents.map(e =>
      `<div class="cal-tooltip-item" style="border-left:3px solid ${e.color||'var(--accent)'}">
        <span class="cal-tooltip-time">${e.event_time ? e.event_time.substring(0,5) : ''}</span>
        <span class="cal-tooltip-title">${escHtml(e.title)}</span>
       </div>`
    ).join('') : '';

    html += `<div class="cal-cell ${isToday?'today':''} ${hasEvents?'has-events':''}"
      onclick="handleCalCellClick(event, '${dateStr}', ${hasEvents})"
      data-date="${dateStr}">
      <span class="cal-day-num">${d}</span>
      <div class="cal-events-dots">
        ${dayEvents.slice(0,3).map(e=>`<div class="cal-dot" style="background:${e.color||'var(--accent)'}"></div>`).join('')}
        ${dayEvents.length > 3 ? `<span class="cal-more">+${dayEvents.length-3}</span>` : ''}
      </div>
      ${hasEvents ? `<div class="cal-event-popup" id="popup-${dateStr}">${tooltipContent}</div>` : ''}
    </div>`;
  }
  grid.innerHTML = html;
}

async function handleCalCellClick(event, dateStr, hasEvents) {
  event.stopPropagation();

  // Đóng tất cả popup khác đang mở
  document.querySelectorAll('.cal-event-popup.show').forEach(p => {
    if (p.id !== 'popup-' + dateStr) p.classList.remove('show');
  });

  if (hasEvents) {
    // Toggle popup sự kiện
    const popup = document.getElementById('popup-' + dateStr);
    if (popup) {
      const isOpen = popup.classList.contains('show');
      popup.classList.toggle('show');
      if (!isOpen) {
        // Tự đóng sau 5 giây
        setTimeout(() => popup.classList.remove('show'), 5000);
      }
    }
  } else {
    // Không có sự kiện → mở form thêm sự kiện
    openAddEventModal(dateStr);
  }
}

// Click bên ngoài đóng tất cả popup
document.addEventListener('click', function() {
  document.querySelectorAll('.cal-event-popup.show').forEach(p => p.classList.remove('show'));
});

async function renderUpcoming() {
  const list = $('upcomingList');
  if (!list) return;
  try {
    const upcoming = await apiFetch('/calendar/upcoming');
    if (!upcoming.length) { list.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;padding:0.5rem">Không có sự kiện nào trong 7 ngày tới</div>'; return; }
    list.innerHTML = upcoming.map(e => `
      <div class="upcoming-item" style="border-left:3px solid ${e.color||'var(--accent)'}">
        <div class="ui-date">${new Date(e.event_date).toLocaleDateString('vi-VN',{weekday:'short',day:'numeric',month:'short'})}</div>
        <div class="ui-title">${escHtml(e.title)}</div>
        ${e.subject ? `<div class="ui-subject">${escHtml(e.subject)}</div>` : ''}
        <button onclick="deleteEvent(${e.id})" class="ui-delete">✕</button>
      </div>`).join('');
  } catch {}
}

function prevMonth() { calendarDate.setMonth(calendarDate.getMonth()-1); loadCalendar(); }
function nextMonth() { calendarDate.setMonth(calendarDate.getMonth()+1); loadCalendar(); }

function openAddEventModal(date) {
  $('eventDate').value = date || new Date().toISOString().split('T')[0];
  openModal('addEventModal');
}

async function addEvent() {
  const title = $('eventTitle').value.trim();
  const event_date = $('eventDate').value;
  if (!title || !event_date) return toast('Cần tiêu đề và ngày', 'error');
  try {
    await apiFetch('/calendar', { method:'POST', body:JSON.stringify({
      title, event_date, event_time: $('eventTime').value || null,
      subject: $('eventSubject').value.trim(), type: $('eventType').value,
      color: $('eventColor').value, description: $('eventDesc').value.trim()
    })});
    closeModal('addEventModal');
    $('eventTitle').value=''; $('eventDesc').value=''; $('eventSubject').value='';
    loadCalendar(); toast('Đã thêm sự kiện!');
  } catch (err) { toast(err.message,'error'); }
}

async function deleteEvent(id) {
  try { await apiFetch(`/calendar/${id}`,{method:'DELETE'}); loadCalendar(); toast('Đã xóa'); } catch {}
}

// ─── QUIZ ─────────────────────────────────────────────
// Quiz state (declared above)

async function loadQuizList() {
  const list = $('quizList');
  if (!list) return;
  list.innerHTML = '<div class="loading-state">Đang tải...</div>';
  try {
    const quizzes = await apiFetch('/quiz');
    if (!quizzes.length) { list.innerHTML = `<div class="empty-state"><div class="es-icon">🧠</div><div class="es-text">Chưa có quiz nào. Tạo quiz với AI!</div></div>`; return; }
    list.innerHTML = quizzes.map(q => `
      <div class="quiz-card card" onclick="startQuiz(${q.id})">
        <div class="qc-icon">🧠</div>
        <div class="qc-info">
          <div class="qc-title">${escHtml(q.title)}</div>
          <div class="qc-meta">${q.subject||'Chung'} · ${q.question_count||0} câu</div>
          ${q.last_score!=null?`<div class="qc-score">Lần trước: ${q.last_score}/${q.last_total}</div>`:''}
        </div>
        <button onclick="event.stopPropagation();deleteQuiz(${q.id})" class="mat-delete" style="opacity:1">✕</button>
      </div>`).join('');
  } catch { list.innerHTML = '<div class="loading-state">Lỗi tải quiz.</div>'; }
}

async function generateQuiz() {
  const topic = $('quizTopic').value.trim();
  const subject = $('quizSubject').value.trim();
  const count = parseInt($('quizCount').value) || 5;
  if (!topic) return toast('Nhập chủ đề quiz', 'error');
  const btn = $('generateQuizBtn');
  btn.disabled = true; btn.textContent = '⏳ Đang tạo...';
  try {
    await apiFetch('/quiz/generate', { method:'POST', body:JSON.stringify({ topic, subject, count }) });
    closeModal('createQuizModal');
    $('quizTopic').value='';
    loadQuizList();
    toast('Đã tạo quiz! 🧠');
  } catch (err) { toast(err.message,'error'); }
  btn.disabled = false; btn.textContent = '✨ Tạo Quiz với AI';
}

async function startQuiz(id) {
  try {
    currentQuiz = await apiFetch('/quiz/'+id);
    quizAnswers = new Array(currentQuiz.questions.length).fill(null);
    quizStartTime = Date.now();
    renderQuizPlay();
  } catch (err) { toast(err.message,'error'); }
}

function renderQuizPlay() {
  if (!currentQuiz) return;
  $('quizList').style.display = 'none';
  $('quizCreateBar').style.display = 'none';
  $('quizPlayArea').style.display = 'block';
  const q = currentQuiz;
  $('quizPlayArea').innerHTML = `
    <div class="quiz-header">
      <button class="btn btn-ghost" onclick="exitQuiz()">← Quay lại</button>
      <h2 class="quiz-title-play">${escHtml(q.title)}</h2>
      <div class="quiz-progress-text" id="quizProgress">0 / ${q.questions.length}</div>
    </div>
    <div class="quiz-questions" id="quizQuestions">
      ${q.questions.map((qq, i) => `
        <div class="quiz-q-card card" id="qq${i}">
          <div class="qq-num">Câu ${i+1}</div>
          <div class="qq-text">${escHtml(qq.question)}</div>
          <div class="qq-options">
            ${JSON.parse(qq.options||'[]').map((opt, j) => `
              <button class="qq-opt" onclick="selectAnswer(${i},${j},this)">${escHtml(opt)}</button>
            `).join('')}
          </div>
          <div class="qq-explanation" id="exp${i}" style="display:none">${escHtml(qq.explanation||'')}</div>
        </div>`).join('')}
    </div>
    <div class="quiz-submit-bar">
      <button class="btn btn-primary" onclick="submitQuiz()">Nộp bài ✓</button>
    </div>`;
}

function selectAnswer(qIdx, optIdx, btn) {
  quizAnswers[qIdx] = optIdx;
  const card = document.getElementById('qq'+qIdx);
  card.querySelectorAll('.qq-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const answered = quizAnswers.filter(a => a !== null).length;
  $('quizProgress').textContent = `${answered} / ${currentQuiz.questions.length}`;
}

async function submitQuiz() {
  const unanswered = quizAnswers.filter(a => a === null).length;
  if (unanswered > 0 && !confirm(`Còn ${unanswered} câu chưa trả lời. Nộp bài?`)) return;

  let score = 0;
  currentQuiz.questions.forEach((q, i) => {
    const card = document.getElementById('qq'+i);
    const opts = card.querySelectorAll('.qq-opt');
    const correct = q.correct_index;
    if (quizAnswers[i] === correct) { score++; opts[correct]?.classList.add('correct'); }
    else {
      if (quizAnswers[i] !== null) opts[quizAnswers[i]]?.classList.add('wrong');
      opts[correct]?.classList.add('correct');
    }
    opts.forEach(b => b.disabled = true);
    const expEl = document.getElementById('exp'+i);
    if (expEl && q.explanation) { expEl.style.display = 'block'; }
  });

  const timeSec = Math.floor((Date.now() - quizStartTime) / 1000);
  const pct = Math.round((score / currentQuiz.questions.length) * 100);
  const emoji = pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '📚';

  const bar = document.querySelector('.quiz-submit-bar');
  bar.innerHTML = `<div class="quiz-result-banner">
    ${emoji} Kết quả: <strong>${score}/${currentQuiz.questions.length}</strong> (${pct}%) · ${Math.floor(timeSec/60)}p ${timeSec%60}s
    <button class="btn btn-ghost" onclick="exitQuiz()" style="margin-left:1rem">Xem lại</button>
  </div>`;

  try { await apiFetch(`/quiz/${currentQuiz.id}/result`, { method:'POST', body:JSON.stringify({ score, total:currentQuiz.questions.length, time_seconds:timeSec }) }); } catch {}
}

function exitQuiz() {
  currentQuiz = null; quizAnswers = [];
  $('quizPlayArea').style.display = 'none';
  $('quizList').style.display = 'block';
  $('quizCreateBar').style.display = 'flex';
  loadQuizList();
}

async function deleteQuiz(id) {
  try { await apiFetch(`/quiz/${id}`,{method:'DELETE'}); loadQuizList(); toast('Đã xóa quiz'); } catch {}
}

// ─── AI GENERATE FLASHCARDS ───────────────────────────
async function generateFlashcardsFromText() {
  const text = $('aiFlashText').value.trim();
  const subject = $('aiFlashSubject').value.trim() || 'Chung';
  const count = parseInt($('aiFlashCount').value) || 8;
  if (!text || text.length < 50) return toast('Nhập ít nhất 50 ký tự văn bản', 'error');

  const btn = $('genFlashBtn');
  btn.disabled = true; btn.textContent = '⏳ Đang tạo...';
  try {
    const data = await apiFetch('/ai/generate-flashcards', { method:'POST', body:JSON.stringify({ text, subject, count }) });
    if (!data.flashcards?.length) return toast('Không tạo được flashcard', 'error');
    // Bulk save
    await apiFetch('/flashcards/bulk', { method:'POST', body:JSON.stringify({ flashcards: data.flashcards, subject }) });
    closeModal('aiFlashModal');
    $('aiFlashText').value='';
    loadFlashcards();
    toast(`Đã tạo ${data.flashcards.length} flashcard! 🃏 +5 EXP`);
    apiFetch('/profile/exp',{method:'POST',body:JSON.stringify({amount:5})});
  } catch (err) { toast(err.message,'error'); }
  btn.disabled = false; btn.textContent = '✨ Tạo Flashcard';
}

// ─── AI SUMMARIZE ─────────────────────────────────────
async function summarizeMaterial(id, title, content) {
  if (!content || content.length < 100) return toast('Tài liệu quá ngắn để tóm tắt', 'error');
  const btn = document.getElementById('sumBtn'+id);
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  try {
    const data = await apiFetch('/ai/summarize', { method:'POST', body:JSON.stringify({ text:content, title }) });
    showSummaryModal(title, data);
  } catch (err) { toast(err.message,'error'); }
  if (btn) { btn.disabled = false; btn.textContent = '🤖'; }
}

function showSummaryModal(title, data) {
  const modal = $('summaryModal');
  $('summaryModalTitle').textContent = `📄 Tóm tắt: ${title}`;
  $('summaryContent').innerHTML = `
    <div class="summary-section">
      <h4>📋 Tổng quan</h4>
      <p>${escHtml(data.summary||'')}</p>
    </div>
    <div class="summary-section">
      <h4>🎯 Điểm chính</h4>
      <ul>${(data.key_points||[]).map(p=>`<li>${escHtml(p)}</li>`).join('')}</ul>
    </div>
    <div class="summary-section">
      <h4>🏷️ Từ khóa</h4>
      <div class="keyword-chips">${(data.keywords||[]).map(k=>`<span class="keyword-chip">${escHtml(k)}</span>`).join('')}</div>
    </div>
    <div class="summary-difficulty">Độ khó: <strong>${escHtml(data.difficulty||'')}</strong></div>`;
  modal.classList.add('open');
}

// ─── FLASHCARD SHARE ──────────────────────────────────
async function shareFlashcard(id) {
  try {
    const fc = await apiFetch(`/flashcards/${id}/share`, { method:'POST' });
    if (fc.is_public && fc.share_code) {
      const url = `${window.location.origin}/?shared=${fc.share_code}`;
      navigator.clipboard?.writeText(url);
      toast(`✅ Đã chia sẻ! Link đã copy: ...?shared=${fc.share_code}`);
    } else {
      toast('Đã tắt chia sẻ');
    }
    loadFlashcards();
  } catch (err) { toast(err.message,'error'); }
}

// Check for shared deck on load
async function checkSharedDeck() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('shared');
  if (!code) return;
  try {
    const cards = await apiFetch(`/flashcards/shared/${code}`);
    if (cards.length) {
      const creator = cards[0].creator_name;
      if (confirm(`📚 ${creator} chia sẻ ${cards.length} flashcard. Thêm vào bộ thẻ của bạn?`)) {
        await apiFetch('/flashcards/bulk', { method:'POST', body:JSON.stringify({ flashcards: cards, subject: cards[0].subject }) });
        toast(`Đã thêm ${cards.length} flashcard!`);
        navigate('flashcards');
      }
    }
  } catch {}
  window.history.replaceState({}, '', '/');
}

// ─── RICH TEXT EDITOR ─────────────────────────────────
function initRichEditor() {
  const editor = $('richEditor');
  if (!editor) return;
  editor.addEventListener('keydown', function(e) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key==='b'){e.preventDefault();document.execCommand('bold');}
      if (e.key==='i'){e.preventDefault();document.execCommand('italic');}
      if (e.key==='u'){e.preventDefault();document.execCommand('underline');}
    }
  });
}

function formatText(cmd, value) {
  document.execCommand(cmd, false, value || null);
  $('richEditor')?.focus();
}

function getRichContent() {
  return $('richEditor')?.innerHTML || '';
}

async function addMaterialRich() {
  const title = $('matTitle').value.trim();
  const subject_id = $('matSubject').value;
  const content_html = getRichContent();
  const content = $('richEditor')?.innerText || '';
  if (!title && !content) return toast('Thêm tiêu đề hoặc nội dung','error');
  try {
    await apiFetch('/materials',{ method:'POST', body:JSON.stringify({ title:title||'Ghi chú mới', subject_id, content, content_html, type:'note' }) });
    closeModal('addMaterialModal');
    if ($('richEditor')) $('richEditor').innerHTML='';
    $('matTitle').value='';
    loadMaterials();
    toast('Đã lưu ghi chú!');
  } catch(err){ toast(err.message,'error'); }
}

// ─── NAVIGATE UPDATE ──────────────────────────────────
const _origNavigate = navigate;
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $(`page-${page}`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  setTimeout(() => {
    if (page === 'tasks') loadTasks();
    if (page === 'materials') { loadSubjects(); loadMaterials(); }
    if (page === 'flashcards') loadFlashcards();
    if (page === 'stats') loadStats();
    if (page === 'profile') loadProfile();
    if (page === 'ai') loadChatHistory();
    if (page === 'calendar') loadCalendar();
    if (page === 'quiz') loadQuizList();
  }, 0);
}

// Re-register nav click with new navigate
document.querySelectorAll('.nav-item').forEach(item => {
  item.onclick = () => requestAnimationFrame(() => navigate(item.dataset.page));
});

// ─── INIT v2 ──────────────────────────────────────────
const _origInit = init;
async function init() {
  loadSavedTheme();
  initParticles();
  setupFileDropZone();
  initPWA();
  initRichEditor();
  const authed = await checkAuth();
  if (!authed) return;
  await loadSidebarProfile();
  loadStats();
  checkSharedDeck();
}

document.addEventListener('DOMContentLoaded', init);

// ─── Rich editor table insert ─────────────────────
function insertTable() {
  const table = `<table><thead><tr><th>Cột 1</th><th>Cột 2</th><th>Cột 3</th></tr></thead><tbody><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></tbody></table><p><br></p>`;
  document.execCommand('insertHTML', false, table);
  $('richEditor')?.focus();
}

// ═══════════════════════════════════════════════════════
// DEEP OCR FEATURE
// ═══════════════════════════════════════════════════════

let ocrCurrentFile = null;    // File ảnh hiện tại
let ocrSelectedSubject = 'Chung'; // Môn học được chọn
let ocrSelectedLevel = 'THPT';    // Cấp độ được chọn

/**
 * Khởi tạo OCR — đăng ký drag & drop và paste từ clipboard
 */
function initOCR() {
  const dropZone = $('ocrDropZone');
  if (!dropZone) return;

  // Drag & drop events
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleOcrFile(file);
    else toast('Chỉ chấp nhận file ảnh', 'error');
  });

  // Paste từ clipboard (Ctrl+V)
  document.addEventListener('paste', e => {
    // Chỉ xử lý khi đang ở trang OCR
    if (!$('page-ocr')?.classList.contains('active')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          handleOcrFile(file);
          toast('📋 Đã dán ảnh từ clipboard!');
          break;
        }
      }
    }
  });
}

/**
 * Xử lý file ảnh được chọn
 */
function handleOcrFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    toast('Vui lòng chọn file ảnh', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    toast('File quá lớn! Tối đa 10MB', 'error');
    return;
  }

  ocrCurrentFile = file;

  // Hiện preview
  const reader = new FileReader();
  reader.onload = e => {
    const img = $('ocrPreviewImg');
    if (img) img.src = e.target.result;
    $('ocrPreviewWrap').style.display = 'block';
    $('ocrDropZone').style.display = 'none';
    $('ocrActions').style.display = 'flex';
    // Reset result
    $('ocrResultCard').style.display = 'none';
    $('ocrAskOptions').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

/**
 * Xóa ảnh và reset về trạng thái ban đầu
 */
function clearOcr() {
  ocrCurrentFile = null;
  $('ocrPreviewWrap').style.display = 'none';
  $('ocrDropZone').style.display = 'flex';
  $('ocrActions').style.display = 'none';
  const solveSection = $('ocrSolveSection');
  if (solveSection) solveSection.style.display = 'none';
  const solvePanel = $('ocrSolvePanel');
  if (solvePanel) solvePanel.style.display = 'none';
  $('ocrResultCard').style.display = 'none';
  $('ocrFileInput').value = '';
}

/**
 * Chạy OCR — chỉ đọc văn bản
 */
async function runOCR() {
  if (!ocrCurrentFile) return toast('Chọn ảnh trước', 'error');

  showOcrLoading('🔍 Đang nhận diện văn bản...');

  const formData = new FormData();
  formData.append('image', ocrCurrentFile);

  try {
    const res = await fetch(`${API}/ocr`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() },
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      hideOcrLoading();
      toast('❌ ' + (data.error || 'Lỗi OCR'), 'error');
      return;
    }

    // Hiển thị kết quả
    showOcrTextResult(data);
    toast(`✅ Đọc được ${data.char_count} ký tự (${data.line_count} dòng)`);

  } catch (err) {
    hideOcrLoading();
    toast('❌ Lỗi kết nối server', 'error');
    console.error('OCR error:', err);
  }
}

/**
 * Toggle panel chọn môn để giải bài
 */
function toggleSolvePanel() {
  const panel = $('ocrSolvePanel');
  if (!panel) return;
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? 'flex' : 'none';
}

/** Chọn môn học */
function selectOcrSubject(btn) {
  document.querySelectorAll('.osp-subject-list .osp-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ocrSelectedSubject = btn.dataset.val;
}

/** Chọn cấp độ */
function selectOcrLevel(btn) {
  document.querySelectorAll('.osp-level-list .osp-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ocrSelectedLevel = btn.dataset.val;
}

/**
 * Hiện form hỏi AI (legacy - kept for compatibility)
 */
function runOCRAndAsk() {
  toggleSolvePanel();
}

/**
 * OCR + hỏi AI trong 1 lần
 */
async function submitOCRAsk() {
  if (!ocrCurrentFile) return toast('Chọn ảnh trước', 'error');

  const question = 'Hãy giải bài tập trong ảnh này từng bước chi tiết';
  const subject = ocrSelectedSubject || 'Chung';
  const level = ocrSelectedLevel || 'THPT';

  showOcrLoading('🤖 AI đang phân tích ảnh...');

  const formData = new FormData();
  formData.append('image', ocrCurrentFile);
  formData.append('question', question);
  formData.append('subject', subject);
  formData.append('level', level);

  try {
    const res = await fetch(`${API}/ocr/ask-ai`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() },
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      hideOcrLoading();
      toast('❌ ' + (data.error || 'Lỗi AI'), 'error');
      return;
    }

    // Hiển thị câu trả lời AI
    showOcrAiResult(data.answer, subject, level);
    toast('✅ AI đã phân tích xong!');

  } catch (err) {
    hideOcrLoading();
    toast('❌ Lỗi kết nối server', 'error');
  }
}

// ── Helper hiển thị ────────────────────────────────────

function showOcrLoading(msg) {
  $('ocrResultCard').style.display = 'flex';
  $('ocrLoading').style.display = 'flex';
  $('ocrLoadingText').textContent = msg || 'Đang xử lý...';
  $('ocrTextResult').style.display = 'none';
  $('ocrAiResult').style.display = 'none';
}

function hideOcrLoading() {
  $('ocrLoading').style.display = 'none';
}

function showOcrTextResult(data) {
  hideOcrLoading();
  $('ocrResultCard').style.display = 'flex';
  $('ocrResultTitle').textContent = '📄 Văn bản đã trích xuất';

  // Meta info
  const methodLabel = data.method === 'groq-vision' ? '🤖 Groq Vision AI' : '📖 Tesseract OCR';
  $('ocrMeta').innerHTML = `
    <span>${methodLabel}</span>
    <span>📝 ${data.char_count} ký tự</span>
    <span>📋 ${data.line_count} dòng</span>
  `;
  $('ocrMeta').style.display = 'flex';

  // Text output — render định dạng \word\ thành <u><b>word</b></u>
  const rawText = data.text;
  $('ocrOutput').innerHTML = formatOcrText(rawText);
  $('ocrTextResult').style.display = 'block';
  $('ocrAiResult').style.display = 'none';

  // Lưu text gốc để copy/lưu
  $('ocrOutput').dataset.text = rawText;

  // Hiện nút "Giải bài tập" sau khi đọc xong
  const solveSection = $('ocrSolveSection');
  if (solveSection) solveSection.style.display = 'block';
}

function showOcrAiResult(answer, subject, level) {
  hideOcrLoading();
  $('ocrResultCard').style.display = 'flex';
  $('ocrResultTitle').textContent = `🤖 AI ${subject} — ${level}`;
  $('ocrMeta').style.display = 'none';
  $('ocrTextResult').style.display = 'none';
  $('ocrAiResult').style.display = 'block';
  $('ocrAiAnswer').innerHTML = formatAIResponse(answer);
  $('ocrAiAnswer').dataset.text = answer;
  // Ẩn solve panel sau khi đã giải
  const panel = $('ocrSolvePanel');
  if (panel) panel.style.display = 'none';
}

/**
 * Render định dạng OCR:
 * \word\ → <u><b>word</b></u> (gạch chân + đậm)
 * ALL CAPS → giữ nguyên viết hoa
 */
function formatOcrText(text) {
  if (!text) return '';
  return escHtml(text)
    // \word\ → gạch chân + in đậm
    .replace(/\\([^\\]+)\\/g, '<u><b>$1</b></u>');
}

/** Copy văn bản OCR ra clipboard */
function copyOcrText() {
  const text = $('ocrOutput')?.dataset.text || $('ocrAiAnswer')?.dataset.text || '';
  if (!text) return toast('Không có nội dung để copy', 'error');
  navigator.clipboard?.writeText(text)
    .then(() => toast('📋 Đã copy!'))
    .catch(() => toast('Không thể copy', 'error'));
}

/** Gửi văn bản OCR sang AI Tutor để hỏi thêm */
function sendOcrToChat() {
  const text = $('ocrOutput')?.dataset.text;
  if (!text) return toast('Cần đọc văn bản trước', 'error');
  navigate('ai');
  setTimeout(() => {
    const input = $('chatInput');
    if (input) {
      input.value = 'Đây là nội dung từ ảnh của tôi:\n\n' + text.substring(0, 500) + (text.length > 500 ? '...' : '') + '\n\nHãy giúp tôi hiểu nội dung này.';
      input.focus();
    }
  }, 300);
}

/** Lưu kết quả OCR thành ghi chú */
async function saveOcrAsNote() {
  const text = $('ocrOutput')?.dataset.text || $('ocrAiAnswer')?.dataset.text;
  if (!text) return toast('Không có nội dung để lưu', 'error');
  try {
    await apiFetch('/materials', {
      method: 'POST',
      body: JSON.stringify({
        title: 'OCR - ' + new Date().toLocaleDateString('vi-VN'),
        content: text,
        type: 'note'
      })
    });
    toast('💾 Đã lưu vào Tài liệu!');
  } catch (err) {
    toast('Lỗi lưu ghi chú', 'error');
  }
}

// ── Cập nhật navigate để load OCR ─────────────────────
const _prevNavigate = navigate;
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $(`page-${page}`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  setTimeout(() => {
    if (page === 'tasks') loadTasks();
    if (page === 'materials') { loadSubjects(); loadMaterials(); }
    if (page === 'flashcards') loadFlashcards();
    if (page === 'stats') loadStats();
    if (page === 'profile') loadProfile();
    if (page === 'ai') loadChatHistory();
    if (page === 'calendar') loadCalendar();
    if (page === 'quiz') loadQuizList();
    // OCR không cần load gì — đã sẵn sàng ngay
  }, 0);
}

// Re-register nav clicks
document.querySelectorAll('.nav-item').forEach(item => {
  item.onclick = () => requestAnimationFrame(() => navigate(item.dataset.page));
});

// Thêm initOCR vào init
const _prevInit2 = init;
async function init() {
  loadSavedTheme();
  initParticles();
  setupFileDropZone();
  initPWA();
  initRichEditor();
  initOCR(); // ← Thêm OCR init
  const authed = await checkAuth();
  if (!authed) return;
  await loadSidebarProfile();
  loadStats();
  checkSharedDeck();
}

document.addEventListener('DOMContentLoaded', init);

// ═══════════════════════════════════════════════════════
// COLLAPSIBLE SIDEBAR
// ═══════════════════════════════════════════════════════

let sidebarOpen = true;

/**
 * Tạo overlay cho mobile
 */
function getOrCreateOverlay() {
  let overlay = document.getElementById('sidebarOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebarOverlay';
    overlay.onclick = closeSidebar;
    document.body.appendChild(overlay);
  }
  return overlay;
}

/**
 * Toggle sidebar mở/đóng
 */
function toggleSidebar() {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    if (sidebarOpen) closeSidebar();
    else openSidebar();
  } else {
    if (sidebarOpen) collapseSidebar();
    else expandSidebar();
  }
}

/** Mở sidebar trên mobile */
function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const fab = document.getElementById('sidebarOpenFab');
  const overlay = getOrCreateOverlay();

  sidebar.classList.add('mobile-open');
  overlay.classList.add('show');
  fab.style.display = 'none';
  sidebarOpen = true;
}

/** Đóng sidebar trên mobile */
function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const fab = document.getElementById('sidebarOpenFab');
  const overlay = getOrCreateOverlay();

  sidebar.classList.remove('mobile-open');
  overlay.classList.remove('show');
  fab.style.display = 'flex';
  sidebarOpen = false;
}

/** Thu sidebar trên desktop */
function collapseSidebar() {
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('mainContent');
  const btn = document.getElementById('sidebarToggleBtn');
  const fab = document.getElementById('sidebarOpenFab');

  sidebar.classList.add('collapsed');
  main?.classList.add('expanded');
  if (btn) btn.textContent = '›';
  fab.style.display = 'flex';
  sidebarOpen = false;
  localStorage.setItem('sf_sidebar', 'closed');
}

/** Mở rộng sidebar trên desktop */
function expandSidebar() {
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('mainContent');
  const btn = document.getElementById('sidebarToggleBtn');
  const fab = document.getElementById('sidebarOpenFab');

  sidebar.classList.remove('collapsed');
  main?.classList.remove('expanded');
  if (btn) btn.textContent = '‹';
  fab.style.display = 'none';
  sidebarOpen = true;
  localStorage.setItem('sf_sidebar', 'open');
}

/**
 * Khởi tạo sidebar — khôi phục trạng thái đã lưu
 */
function initSidebar() {
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    // Mobile: mặc định đóng
    closeSidebar();
  } else {
    // Desktop: khôi phục trạng thái lưu
    const saved = localStorage.getItem('sf_sidebar');
    if (saved === 'closed') collapseSidebar();
    else expandSidebar();
  }

  // Đóng sidebar khi click nav item trên mobile
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) closeSidebar();
    });
  });

  // Responsive khi xoay màn hình
  window.addEventListener('resize', () => {
    const nowMobile = window.innerWidth <= 768;
    if (!nowMobile) {
      // Chuyển từ mobile → desktop
      const overlay = document.getElementById('sidebarOverlay');
      if (overlay) overlay.classList.remove('show');
      document.getElementById('sidebar')?.classList.remove('mobile-open');
      const saved = localStorage.getItem('sf_sidebar');
      if (saved === 'closed') collapseSidebar();
      else expandSidebar();
    } else {
      // Chuyển từ desktop → mobile
      document.getElementById('sidebar')?.classList.remove('collapsed');
      document.getElementById('mainContent')?.classList.remove('expanded');
      closeSidebar();
    }
  });
}

// Thêm initSidebar vào init
const _origInitFinal = init;
async function init() {
  loadSavedTheme();
  initParticles();
  setupFileDropZone();
  initPWA();
  initRichEditor();
  initOCR();
  initSidebar(); // ← sidebar
  const authed = await checkAuth();
  if (!authed) return;
  await loadSidebarProfile();
  loadStats();
  checkSharedDeck();
}

document.addEventListener('DOMContentLoaded', init);

// ═══════════════════════════════════════════════════════
// STUDY ROOMS
// ═══════════════════════════════════════════════════════
let currentRoomId = null;
let roomPollInterval = null;

async function loadRooms() {
  const list = $('roomsList');
  if (!list) return;
  list.innerHTML = '<div class="loading-state">Đang tải...</div>';
  try {
    const rooms = await apiFetch('/rooms');
    if (!rooms.length) {
      list.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">👥</div><div class="es-text">Chưa có phòng học nào.<br/>Tạo phòng mới hoặc nhập mã để tham gia!</div></div>`;
      return;
    }
    list.innerHTML = rooms.map(r => `
      <div class="room-card card" onclick="enterRoom(${r.id})">
        <div class="rc-header">
          <div>
            <div class="rc-name">${escHtml(r.name)}</div>
            <div class="rc-subject">${escHtml(r.subject||'Chung')}</div>
          </div>
          <span style="font-size:1.5rem">👥</span>
        </div>
        <div class="rc-members">👤 ${r.member_count||0} thành viên</div>
        <div class="rc-code">Mã: <strong>${r.invite_code}</strong></div>
        <div class="rc-actions">
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();enterRoom(${r.id})">Vào phòng</button>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();navigator.clipboard?.writeText('${r.invite_code}');toast('Đã copy mã: ${r.invite_code}')">📋 Mã</button>
        </div>
      </div>`).join('');
  } catch { list.innerHTML = '<div class="loading-state">Lỗi tải phòng học</div>'; }
}

async function createRoom() {
  const name = $('roomName').value.trim();
  const subject = $('roomSubject').value.trim();
  if (!name) return toast('Nhập tên phòng', 'error');
  try {
    const room = await apiFetch('/rooms', { method: 'POST', body: JSON.stringify({ name, subject }) });
    closeModal('createRoomModal');
    $('roomName').value = ''; $('roomSubject').value = '';
    toast(`Phòng "${name}" đã tạo! Mã: ${room.invite_code}`);
    enterRoom(room.id);
  } catch (err) { toast(err.message, 'error'); }
}

async function joinRoom() {
  const code = $('joinRoomCode').value.trim().toUpperCase();
  if (!code) return toast('Nhập mã phòng', 'error');
  try {
    const room = await apiFetch('/rooms/join', { method: 'POST', body: JSON.stringify({ code }) });
    closeModal('joinRoomModal');
    $('joinRoomCode').value = '';
    toast(`Đã vào phòng: ${room.name}`);
    enterRoom(room.id);
  } catch (err) { toast(err.message, 'error'); }
}

async function enterRoom(id) {
  currentRoomId = id;
  $('roomsList').style.display = 'none';
  $('roomDetail').style.display = 'block';
  document.querySelector('.page-header').style.display = 'none';
  await refreshRoom();
  // Poll mỗi 5 giây
  if (roomPollInterval) clearInterval(roomPollInterval);
  roomPollInterval = setInterval(refreshRoom, 5000);
}

async function refreshRoom() {
  if (!currentRoomId) return;
  try {
    const room = await apiFetch('/rooms/' + currentRoomId);
    $('roomDetailName').textContent = room.name;
    $('copyRoomCodeBtn').title = 'Mã: ' + room.invite_code;

    // Render members
    const membersList = $('roomMembersList');
    membersList.innerHTML = room.members.map(m => {
      const avatarHtml = m.custom_avatar
        ? `<img src="${m.custom_avatar.startsWith('http') ? m.custom_avatar : API.replace('/api','') + m.custom_avatar}" />`
        : m.avatar || '👤';
      return `<div class="room-member-item">
        <div class="rmi-avatar">${avatarHtml}</div>
        <div class="rmi-info">
          <div class="rmi-name">${escHtml(m.name)}</div>
          <div class="rmi-status studying">${m.study_subject ? '📚 ' + escHtml(m.study_subject) : '🟢 Đang học'}</div>
        </div>
        <span style="font-size:0.65rem;color:var(--text-muted)">Lv.${m.level||1}</span>
      </div>`;
    }).join('');

    // Render messages
    const chatEl = $('roomChatMessages');
    const wasAtBottom = chatEl.scrollHeight - chatEl.scrollTop <= chatEl.clientHeight + 50;
    chatEl.innerHTML = room.messages.map(m => {
      const isMe = currentUser && m.user_id === currentUser.id;
      return `<div class="rcm-item ${isMe ? 'mine' : ''}">
        <div class="rcm-bubble">
          ${!isMe ? `<div class="rcm-name">${escHtml(m.sender_name)}</div>` : ''}
          ${escHtml(m.content)}
        </div>
      </div>`;
    }).join('');
    if (wasAtBottom) chatEl.scrollTop = chatEl.scrollHeight;
  } catch {}
}

async function sendRoomMessage() {
  const input = $('roomMsgInput');
  const content = input.value.trim();
  if (!content || !currentRoomId) return;
  input.value = '';
  try {
    await apiFetch(`/rooms/${currentRoomId}/message`, { method: 'POST', body: JSON.stringify({ content }) });
    refreshRoom();
  } catch (err) { toast(err.message, 'error'); }
}

async function updateRoomStatus() {
  if (!currentRoomId) return;
  const subject = $('myStudySubject').value;
  try { await apiFetch(`/rooms/${currentRoomId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'studying', study_subject: subject }) }); }
  catch {}
}

function copyRoomCode() {
  if (!currentRoomId) return;
  apiFetch('/rooms/' + currentRoomId).then(r => {
    navigator.clipboard?.writeText(r.invite_code);
    toast('Đã copy mã: ' + r.invite_code);
  }).catch(() => {});
}

async function leaveRoom() {
  if (!currentRoomId) return;
  try {
    await apiFetch(`/rooms/${currentRoomId}/leave`, { method: 'DELETE' });
    exitRoom();
    loadRooms();
    toast('Đã rời phòng học');
  } catch (err) { toast(err.message, 'error'); }
}

function exitRoom() {
  currentRoomId = null;
  if (roomPollInterval) { clearInterval(roomPollInterval); roomPollInterval = null; }
  $('roomsList').style.display = 'grid';
  $('roomDetail').style.display = 'none';
  const header = document.querySelector('#page-rooms .page-header');
  if (header) header.style.display = 'flex';
}

// ═══════════════════════════════════════════════════════
// ROADMAP
// ═══════════════════════════════════════════════════════
const taskTypeIcons = { study: '📖', practice: '✏️', review: '🔄', test: '📝' };

async function loadRoadmapList() {
  const list = $('roadmapList');
  if (!list) return;
  list.innerHTML = '<div class="loading-state">Đang tải...</div>';
  try {
    const roadmaps = await apiFetch('/roadmap');
    if (!roadmaps.length) {
      list.innerHTML = `<div class="empty-state"><div class="es-icon">🗺️</div><div class="es-text">Chưa có lộ trình học nào.<br/>Tạo lộ trình cá nhân hoá với AI!</div></div>`;
      return;
    }
    list.innerHTML = roadmaps.map(r => {
      const data = r.data || {};
      const progress = r.progress || {};
      const completedWeeks = Object.values(progress).filter(Boolean).length;
      const totalWeeks = r.total_weeks || 8;
      const pct = Math.round((completedWeeks / totalWeeks) * 100);
      return `<div class="roadmap-card card" onclick="viewRoadmap(${r.id})">
        <div class="rmcard-header">
          <div>
            <div class="rmcard-title">${escHtml(r.title)}</div>
            <div class="rmcard-meta">📚 ${escHtml(r.subject||'Chung')} · 🎯 ${escHtml(r.level||'')} · ${totalWeeks} tuần</div>
          </div>
          <button onclick="event.stopPropagation();deleteRoadmap(${r.id})" class="mat-delete" style="opacity:1;position:relative;top:auto;right:auto">✕</button>
        </div>
        <div class="rmcard-progress">
          <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--text-muted)">
            <span>Tiến độ</span><span>${completedWeeks}/${totalWeeks} tuần · ${pct}%</span>
          </div>
          <div class="rmcard-prog-bar"><div class="rmcard-prog-fill" style="width:${pct}%"></div></div>
        </div>
      </div>`;
    }).join('');
  } catch { list.innerHTML = '<div class="loading-state">Lỗi tải lộ trình</div>'; }
}

async function generateRoadmap() {
  const goal = $('rmGoal').value.trim();
  if (!goal) return toast('Nhập mục tiêu học tập', 'error');
  const btn = $('createRoadmapBtn');
  btn.disabled = true; btn.textContent = '⏳ AI đang tạo lộ trình...';
  try {
    await apiFetch('/roadmap/generate', { method: 'POST', body: JSON.stringify({
      goal, subject: $('rmSubject').value, level: $('rmLevel').value,
      weeks: $('rmWeeks').value, current_level: $('rmCurrentLevel').value
    })});
    closeModal('createRoadmapModal');
    $('rmGoal').value = '';
    loadRoadmapList();
    toast('🗺️ Lộ trình đã được tạo!');
  } catch (err) { toast(err.message, 'error'); }
  btn.disabled = false; btn.textContent = '✨ Tạo với AI';
}

async function viewRoadmap(id) {
  const detail = $('roadmapDetail');
  const list = $('roadmapList');
  try {
    const r = await apiFetch('/roadmap/' + id);
    const data = r.data || {};
    const progress = r.progress || {};
    list.style.display = 'none';
    detail.style.display = 'block';
    detail.innerHTML = `
      <div class="roadmap-detail-header">
        <button class="btn btn-ghost" onclick="$('roadmapList').style.display='block';$('roadmapDetail').style.display='none'">← Quay lại</button>
        <div>
          <h2 style="font-family:var(--font-display);font-size:1.3rem">${escHtml(r.title)}</h2>
          <p style="font-size:0.8rem;color:var(--text-muted)">${escHtml(r.description||'')}</p>
        </div>
      </div>
      ${data.tips ? `<div class="card" style="padding:1rem;margin-bottom:1rem;background:rgba(124,111,255,0.05);border-color:rgba(124,111,255,0.2)">
        <div style="font-size:0.72rem;font-weight:700;color:var(--accent);margin-bottom:0.5rem">💡 MẸO HỌC TẬP</div>
        ${data.tips.map(t => `<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:3px">• ${escHtml(t)}</div>`).join('')}
      </div>` : ''}
      <div class="rm-weeks-grid">
        ${(data.weeks||[]).map(w => {
          const isDone = progress[`week_${w.week}`];
          return `<div class="rm-week-card ${isDone?'completed':''}">
            <div class="rmw-header">
              <div><div class="rmw-num">Tuần ${w.week}</div><div class="rmw-theme">${escHtml(w.theme||'')}</div></div>
              ${isDone ? '<span style="color:#4af0d4;font-size:1.2rem">✓</span>' : ''}
            </div>
            <div class="rmw-goals">${(w.goals||[]).map(g=>`<div class="rmw-goal">${escHtml(g)}</div>`).join('')}</div>
            <div class="rmw-tasks">${(w.tasks||[]).slice(0,4).map(t=>`<div class="rmw-task"><span class="task-type-icon">${taskTypeIcons[t.type]||'📌'}</span><span>${escHtml(t.title)}</span></div>`).join('')}</div>
            <button class="rmw-complete-btn" onclick="toggleWeekComplete(${r.id},${w.week},${!isDone})">
              ${isDone ? '✓ Hoàn thành' : '○ Đánh dấu hoàn thành'}
            </button>
          </div>`;
        }).join('')}
      </div>`;
  } catch (err) { toast(err.message, 'error'); }
}

async function toggleWeekComplete(roadmapId, week, completed) {
  try {
    await apiFetch(`/roadmap/${roadmapId}/progress`, { method: 'PATCH', body: JSON.stringify({ week, completed }) });
    viewRoadmap(roadmapId);
    if (completed) { toast(`✅ Tuần ${week} hoàn thành! +10 EXP`); apiFetch('/profile/exp', { method: 'POST', body: JSON.stringify({ amount: 10 }) }); }
  } catch {}
}

async function deleteRoadmap(id) {
  try { await apiFetch('/roadmap/' + id, { method: 'DELETE' }); loadRoadmapList(); toast('Đã xóa lộ trình'); }
  catch (err) { toast(err.message, 'error'); }
}

// ═══════════════════════════════════════════════════════
// MINI GAMES
// ═══════════════════════════════════════════════════════
let gameCards = [];
let gameScore = 0;
let gameTimer = null;
let gameTimeLeft = 30;
let gameType = '';
let matchSelected = null;
let matchPairs = [];

async function startGame(type) {
  gameType = type;
  if (!flashcards.length) {
    try { flashcards = await apiFetch('/flashcards'); }
    catch { return toast('Cần có flashcard để chơi!', 'error'); }
  }
  if (flashcards.length < 4) return toast('Cần ít nhất 4 flashcard để chơi!', 'error');

  // Shuffle và lấy tối đa 10 thẻ
  gameCards = [...flashcards].sort(() => Math.random() - 0.5).slice(0, 10);
  gameScore = 0;
  $('gameSelector').style.display = 'none';
  $('gameArea').style.display = 'block';

  if (type === 'flashspeed') renderFlashSpeedGame();
  else if (type === 'match') renderMatchGame();
  else if (type === 'typing') renderTypingGame();
  else if (type === 'truefalse') renderTrueFalseGame();
}

function exitGame() {
  clearInterval(gameTimer);
  $('gameSelector').style.display = 'block';
  $('gameArea').style.display = 'none';
  gameCards = []; gameScore = 0; matchSelected = null;
}

// ── Flash Speed ──────────────────────────────────────
let fsIndex = 0;
function renderFlashSpeedGame() {
  fsIndex = 0;
  $('gameArea').innerHTML = `
    <div class="game-play-header">
      <button class="btn btn-ghost btn-sm" onclick="exitGame()">← Thoát</button>
      <div style="font-size:0.85rem;color:var(--text-muted)">⚡ Flash Speed</div>
      <div class="game-score" id="gsScore">0 điểm</div>
    </div>
    <div class="flash-card-game">
      <div class="fcg-question" id="fsQuestion">${escHtml(gameCards[0].question)}</div>
      <div id="fsCardNum" style="text-align:center;color:var(--text-muted);font-size:0.75rem;margin-bottom:0.8rem">1 / ${gameCards.length}</div>
      <div class="fcg-answer-input">
        <input type="text" id="fsAnswer" class="input-field" placeholder="Nhập đáp án..." onkeydown="if(event.key==='Enter')checkFSAnswer()" autofocus />
        <button class="btn btn-primary" onclick="checkFSAnswer()">✓</button>
        <button class="btn btn-ghost" onclick="skipFS()">Skip →</button>
      </div>
      <div id="fsFeedback" style="text-align:center;margin-top:0.8rem;height:24px;font-size:0.85rem"></div>
    </div>`;
}

function checkFSAnswer() {
  const input = $('fsAnswer');
  const userAns = input.value.trim().toLowerCase();
  const correct = gameCards[fsIndex].answer.toLowerCase();
  const feedback = $('fsFeedback');
  if (userAns && (correct.includes(userAns) || userAns.includes(correct.substring(0, 10)))) {
    gameScore += 10;
    $('gsScore').textContent = gameScore + ' điểm';
    feedback.innerHTML = '<span style="color:#4af0d4">✅ Đúng! +10</span>';
  } else {
    feedback.innerHTML = `<span style="color:#ff6464">❌ Đáp án: ${escHtml(gameCards[fsIndex].answer)}</span>`;
  }
  input.value = '';
  setTimeout(() => { feedback.innerHTML = ''; nextFS(); }, 1200);
}

function skipFS() { nextFS(); }

function nextFS() {
  fsIndex++;
  if (fsIndex >= gameCards.length) { showGameResult('Flash Speed'); return; }
  $('fsQuestion').textContent = gameCards[fsIndex].question;
  $('fsCardNum').textContent = `${fsIndex+1} / ${gameCards.length}`;
  $('fsAnswer').focus();
}

// ── Match Game ───────────────────────────────────────
function renderMatchGame() {
  const pairs = gameCards.slice(0, 6);
  const questions = pairs.map((c, i) => ({ id: i, text: c.question, type: 'q', pairId: i }));
  const answers = pairs.map((c, i) => ({ id: i + 10, text: c.answer, type: 'a', pairId: i }));
  matchPairs = [...questions, ...answers].sort(() => Math.random() - 0.5);
  matchSelected = null;

  $('gameArea').innerHTML = `
    <div class="game-play-header">
      <button class="btn btn-ghost btn-sm" onclick="exitGame()">← Thoát</button>
      <div style="font-size:0.85rem;color:var(--text-muted)">🎯 Ghép đôi</div>
      <div class="game-score" id="gsScore">0 điểm</div>
    </div>
    <p style="text-align:center;color:var(--text-muted);font-size:0.8rem;margin-bottom:1rem">Chọn câu hỏi và đáp án tương ứng</p>
    <div class="match-grid" id="matchGrid">
      ${matchPairs.map(item => `
        <div class="match-item" id="match-${item.id}" data-id="${item.id}" data-pairid="${item.pairId}" data-type="${item.type}" onclick="selectMatchItem(this)">
          ${escHtml(item.text.substring(0, 60))}${item.text.length > 60 ? '...' : ''}
        </div>`).join('')}
    </div>`;
}

function selectMatchItem(el) {
  if (el.classList.contains('matched')) return;
  if (!matchSelected) {
    el.classList.add('selected');
    matchSelected = el;
  } else {
    const a = matchSelected, b = el;
    if (a.dataset.id === b.dataset.id) { a.classList.remove('selected'); matchSelected = null; return; }
    if (a.dataset.pairid === b.dataset.pairid && a.dataset.type !== b.dataset.type) {
      a.classList.remove('selected'); a.classList.add('matched');
      b.classList.add('matched');
      gameScore += 15; $('gsScore').textContent = gameScore + ' điểm';
      matchSelected = null;
      if (document.querySelectorAll('.match-item:not(.matched)').length === 0) setTimeout(() => showGameResult('Ghép đôi'), 500);
    } else {
      a.classList.add('wrong'); b.classList.add('wrong');
      setTimeout(() => { a.classList.remove('selected','wrong'); b.classList.remove('wrong'); matchSelected = null; }, 800);
    }
  }
}

// ── True/False ───────────────────────────────────────
let tfIndex = 0;
function renderTrueFalseGame() {
  tfIndex = 0; gameTimeLeft = gameCards.length * 5;
  renderTFCard();
  gameTimer = setInterval(() => {
    gameTimeLeft--;
    const el = $('tfTimer');
    if (el) { el.textContent = gameTimeLeft + 's'; if (gameTimeLeft <= 5) el.classList.add('urgent'); }
    if (gameTimeLeft <= 0) { clearInterval(gameTimer); showGameResult('Đúng hay Sai'); }
  }, 1000);
}

function renderTFCard() {
  if (tfIndex >= gameCards.length) { clearInterval(gameTimer); showGameResult('Đúng hay Sai'); return; }
  // 50% hiện đáp án đúng, 50% đáp án sai (từ thẻ khác)
  const card = gameCards[tfIndex];
  const isTrue = Math.random() > 0.5;
  const displayAnswer = isTrue ? card.answer : gameCards[(tfIndex + 1) % gameCards.length].answer;

  $('gameArea').innerHTML = `
    <div class="game-play-header">
      <button class="btn btn-ghost btn-sm" onclick="exitGame()">← Thoát</button>
      <div class="game-score" id="gsScore">${gameScore} điểm</div>
      <div class="game-timer" id="tfTimer">${gameTimeLeft}s</div>
    </div>
    <div class="flash-card-game" style="text-align:center">
      <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.5rem">${tfIndex+1}/${gameCards.length}</div>
      <div class="fcg-question">${escHtml(card.question)}</div>
      <div style="padding:1rem;background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--radius-sm);margin-bottom:1rem;font-size:0.9rem;color:var(--text)">
        ${escHtml(displayAnswer)}
      </div>
      <div style="display:flex;gap:1rem;justify-content:center">
        <button class="btn btn-primary" style="flex:1;max-width:160px;background:linear-gradient(135deg,#4af0d4,#00b894)" onclick="answerTF(${isTrue}, true)">✅ Đúng</button>
        <button class="btn btn-primary" style="flex:1;max-width:160px;background:linear-gradient(135deg,#ff6464,#e84393)" onclick="answerTF(${isTrue}, false)">❌ Sai</button>
      </div>
    </div>`;
}

function answerTF(isActuallyTrue, userSaidTrue) {
  if (isActuallyTrue === userSaidTrue) { gameScore += 10; toast('✅ Đúng! +10', 'success'); }
  else { toast('❌ Sai!', 'error'); }
  tfIndex++;
  setTimeout(renderTFCard, 600);
}

// ── Typing Game ──────────────────────────────────────
let typIndex = 0;
function renderTypingGame() {
  typIndex = 0; gameTimeLeft = 60;
  renderTypCard();
  gameTimer = setInterval(() => {
    gameTimeLeft--;
    const el = $('typTimer');
    if (el) { el.textContent = gameTimeLeft + 's'; if (gameTimeLeft <= 10) el.classList.add('urgent'); }
    if (gameTimeLeft <= 0) { clearInterval(gameTimer); showGameResult('Gõ nhanh'); }
  }, 1000);
}

function renderTypCard() {
  if (typIndex >= gameCards.length) { clearInterval(gameTimer); showGameResult('Gõ nhanh'); return; }
  const card = gameCards[typIndex];
  const area = $('gameArea');
  area.innerHTML = `
    <div class="game-play-header">
      <button class="btn btn-ghost btn-sm" onclick="exitGame();clearInterval(gameTimer)">← Thoát</button>
      <div class="game-score" id="gsScore">${gameScore} điểm</div>
      <div class="game-timer" id="typTimer">${gameTimeLeft}s</div>
    </div>
    <div class="flash-card-game">
      <div style="font-size:0.7rem;color:var(--text-muted);text-align:center;margin-bottom:0.5rem">${typIndex+1}/${gameCards.length}</div>
      <div class="fcg-question">${escHtml(card.question)}</div>
      <div class="fcg-answer-input">
        <input type="text" id="typAnswer" class="input-field" placeholder="Gõ đáp án..." onkeydown="if(event.key==='Enter')checkTypAnswer()" autofocus />
        <button class="btn btn-primary" onclick="checkTypAnswer()">↵</button>
      </div>
      <div id="typFeedback" style="text-align:center;margin-top:0.5rem;height:20px;font-size:0.82rem"></div>
    </div>`;
}

function checkTypAnswer() {
  const input = $('typAnswer');
  const userAns = input.value.trim().toLowerCase();
  const correct = gameCards[typIndex].answer.toLowerCase();
  const feedback = $('typFeedback');
  if (userAns && (correct.includes(userAns) || userAns.includes(correct.substring(0, 8)))) {
    gameScore += 10; feedback.innerHTML = '<span style="color:#4af0d4">✅ +10</span>';
  } else {
    feedback.innerHTML = `<span style="color:#ff6464">❌ ${escHtml(gameCards[typIndex].answer.substring(0, 30))}</span>`;
  }
  typIndex++;
  setTimeout(renderTypCard, 800);
}

// ── Game Result ──────────────────────────────────────
function showGameResult(gameName) {
  clearInterval(gameTimer);
  const total = gameCards.length * (gameName === 'Ghép đôi' ? 15 : 10);
  const pct = Math.min(Math.round((gameScore / total) * 100), 100);
  const emoji = pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '💪';
  $('gameArea').innerHTML = `
    <div class="game-result">
      <div style="font-size:3rem">${emoji}</div>
      <h2 style="font-family:var(--font-display);font-size:1.4rem;margin:0.5rem 0">${gameName} — Kết thúc!</h2>
      <div class="game-result-score">${gameScore} điểm</div>
      <div class="game-result-msg">${pct}% chính xác · ${gameCards.length} câu</div>
      <div style="display:flex;gap:0.8rem;justify-content:center">
        <button class="btn btn-primary" onclick="startGame('${gameType}')">🔄 Chơi lại</button>
        <button class="btn btn-ghost" onclick="exitGame()">← Về menu</button>
      </div>
    </div>`;
  // EXP
  const exp = Math.floor(gameScore / 10);
  if (exp > 0) { apiFetch('/profile/exp', { method: 'POST', body: JSON.stringify({ amount: exp }) }); toast(`+${exp} EXP! 🎮`); }
}

// ═══════════════════════════════════════════════════════
// SCAN & SAVE
// ═══════════════════════════════════════════════════════
let scanStream = null;
let scanFile = null;

async function startCamera() {
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
    const video = $('scanVideo');
    video.srcObject = scanStream;
    video.style.display = 'block';
    $('scanPlaceholder').style.display = 'none';
    $('startCamBtn').style.display = 'none';
    $('captureBtn').style.display = 'flex';
  } catch (err) {
    toast('Không thể mở camera: ' + err.message, 'error');
  }
}

function capturePhoto() {
  const video = $('scanVideo');
  const canvas = $('scanCanvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(blob => {
    scanFile = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
    showScanPreview(URL.createObjectURL(blob));
    stopCamera();
  }, 'image/jpeg', 0.9);
}

function stopCamera() {
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  $('scanVideo').style.display = 'none';
  $('captureBtn').style.display = 'none';
  $('startCamBtn').style.display = 'flex';
}

function handleScanFile(file) {
  if (!file) return;
  scanFile = file;
  showScanPreview(URL.createObjectURL(file));
}

function showScanPreview(url) {
  $('scanPreview').src = url;
  $('scanPreview').style.display = 'block';
  $('scanPlaceholder').style.display = 'none';
  $('scanRunBtn').style.display = 'block';
}

async function runScanOCR() {
  if (!scanFile) return toast('Chụp ảnh hoặc tải ảnh lên trước', 'error');
  $('scanResultCard').style.display = 'flex';
  $('scanLoadingIndicator').style.display = 'flex';
  $('scanExtractedText').value = '';

  const formData = new FormData();
  formData.append('image', scanFile);
  try {
    const res = await fetch(`${API}/ocr`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: formData });
    const data = await res.json();
    $('scanLoadingIndicator').style.display = 'none';
    if (!res.ok) return toast('❌ ' + (data.error || 'Lỗi OCR'), 'error');
    $('scanExtractedText').value = data.text;
    toast(`✅ Đã đọc ${data.char_count} ký tự!`);
  } catch (err) {
    $('scanLoadingIndicator').style.display = 'none';
    toast('❌ Lỗi kết nối', 'error');
  }
}

async function scanSaveAsNote() {
  const text = $('scanExtractedText')?.value.trim();
  if (!text) return toast('Chưa có nội dung', 'error');
  try {
    await apiFetch('/materials', { method: 'POST', body: JSON.stringify({ title: 'Scan ' + new Date().toLocaleDateString('vi-VN'), content: text, type: 'note' }) });
    toast('💾 Đã lưu vào Tài liệu!');
  } catch { toast('Lỗi lưu', 'error'); }
}

async function scanCreateFlashcards() {
  const text = $('scanExtractedText')?.value.trim();
  const subject = $('scanFlashSubject')?.value.trim() || 'Chung';
  if (!text) return toast('Chưa có nội dung', 'error');
  try {
    const data = await apiFetch('/ai/generate-flashcards', { method: 'POST', body: JSON.stringify({ text, subject, count: 8 }) });
    if (!data.flashcards?.length) return toast('Không tạo được flashcard', 'error');
    await apiFetch('/flashcards/bulk', { method: 'POST', body: JSON.stringify({ flashcards: data.flashcards, subject }) });
    closeModal('scanFlashcardModal');
    toast(`🃏 Đã tạo ${data.flashcards.length} flashcard!`);
  } catch (err) { toast(err.message, 'error'); }
}

function scanSendToAI() {
  const text = $('scanExtractedText')?.value.trim();
  if (!text) return toast('Chưa có nội dung', 'error');
  navigate('ai');
  setTimeout(() => {
    const input = $('chatInput');
    if (input) { input.value = 'Tôi vừa scan được nội dung này:\n\n' + text.substring(0, 500); input.focus(); }
  }, 300);
}

function copyScanText() {
  const text = $('scanExtractedText')?.value;
  if (!text) return;
  navigator.clipboard?.writeText(text).then(() => toast('📋 Đã copy!'));
}

// ── Update navigate for new pages ────────────────────
const _navigateFinal = navigate;
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $(`page-${page}`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

  // Stop room polling when leaving
  if (page !== 'rooms' && roomPollInterval) { clearInterval(roomPollInterval); roomPollInterval = null; }
  // Stop camera when leaving scan
  if (page !== 'scan' && scanStream) stopCamera();

  setTimeout(() => {
    if (page === 'tasks') loadTasks();
    if (page === 'materials') { loadSubjects(); loadMaterials(); }
    if (page === 'flashcards') loadFlashcards();
    if (page === 'stats') loadStats();
    if (page === 'profile') loadProfile();
    if (page === 'ai') loadChatHistory();
    if (page === 'calendar') loadCalendar();
    if (page === 'quiz') loadQuizList();
    if (page === 'rooms') { exitRoom(); loadRooms(); }
    if (page === 'roadmap') { $('roadmapDetail').style.display='none'; $('roadmapList').style.display='block'; loadRoadmapList(); }
    if (page === 'games') { flashcards.length || apiFetch('/flashcards').then(d => flashcards = d).catch(()=>{}); }
  }, 0);
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.onclick = () => { requestAnimationFrame(() => navigate(item.dataset.page)); if (window.innerWidth <= 768) closeSidebar(); };
});

// ═══════════════════════════════════════════════════════
// ROOM PASSWORD + UI UPDATES
// ═══════════════════════════════════════════════════════

/** Toggle hiện/ẩn input mật khẩu khi tạo phòng */
function toggleRoomPassword() {
  const cb = document.getElementById('roomHasPassword');
  const input = document.getElementById('roomPassword');
  if (input) input.style.display = cb?.checked ? 'block' : 'none';
  if (cb?.checked && input) input.focus();
}

/** Override createRoom để gửi password */
async function createRoom() {
  const name = $('roomName').value.trim();
  const subject = $('roomSubject').value.trim();
  if (!name) return toast('Nhập tên phòng', 'error');

  const hasPass = $('roomHasPassword')?.checked;
  const password = hasPass ? $('roomPassword')?.value.trim() : null;
  if (hasPass && (!password || password.length > 6)) {
    return toast('Mật khẩu phải từ 1-6 chữ số', 'error');
  }

  try {
    const room = await apiFetch('/rooms', {
      method: 'POST',
      body: JSON.stringify({ name, subject, password })
    });
    closeModal('createRoomModal');
    $('roomName').value = ''; $('roomSubject').value = '';
    if ($('roomPassword')) $('roomPassword').value = '';
    if ($('roomHasPassword')) $('roomHasPassword').checked = false;
    if ($('roomPassword')) $('roomPassword').style.display = 'none';
    const passMsg = password ? ` 🔒 Mật khẩu: ${password}` : '';
    toast(`Phòng "${name}" đã tạo! Mã: ${room.invite_code}${passMsg}`);
    enterRoom(room.id);
  } catch (err) { toast(err.message, 'error'); }
}

/** Override joinRoom để xử lý password */
async function joinRoom() {
  const code = $('joinRoomCode').value.trim().toUpperCase();
  if (!code || code.length !== 6) return toast('Nhập đúng mã 6 ký tự', 'error');

  const password = $('joinRoomPassword')?.value.trim() || null;

  try {
    const room = await apiFetch('/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ code, password })
    });
    closeModal('joinRoomModal');
    $('joinRoomCode').value = '';
    if ($('joinRoomPassword')) $('joinRoomPassword').value = '';
    $('joinPasswordWrap').style.display = 'none';
    toast(`Đã vào phòng: ${room.name}`);
    enterRoom(room.id);
  } catch (err) {
    if (err.message.includes('mật khẩu') || err.message.includes('needs_password') || err.message.includes('Mật khẩu')) {
      // Hiện ô nhập mật khẩu
      $('joinPasswordWrap').style.display = 'block';
      $('joinRoomPassword')?.focus();
      toast('🔒 Phòng này có mật khẩu, vui lòng nhập', 'error');
    } else {
      toast(err.message, 'error');
    }
  }
}

/** Override loadRooms để hiện icon khóa */
async function loadRooms() {
  const list = $('roomsList');
  if (!list) return;
  list.innerHTML = '<div class="loading-state">Đang tải...</div>';
  try {
    const rooms = await apiFetch('/rooms');
    if (!rooms.length) {
      list.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="es-icon">👥</div>
        <div class="es-text">Chưa có phòng học nào.<br/>Tạo phòng mới hoặc nhập mã để tham gia!</div>
      </div>`;
      return;
    }
    list.innerHTML = rooms.map(r => `
      <div class="room-card card" onclick="enterRoom(${r.id})">
        <div class="rc-header">
          <div>
            <div class="rc-name">${escHtml(r.name)} ${r.has_password ? '🔒' : ''}</div>
            <div class="rc-subject">${escHtml(r.subject||'Chung')}</div>
          </div>
          <span style="font-size:1.5rem">👥</span>
        </div>
        <div class="rc-members">👤 ${r.member_count||0} thành viên</div>
        <div class="rc-code">Mã: <strong>${r.invite_code}</strong>${r.has_password ? ' · 🔒 Có mật khẩu' : ''}</div>
        <div class="rc-actions">
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();enterRoom(${r.id})">Vào phòng</button>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();navigator.clipboard?.writeText('${r.invite_code}');toast('Đã copy mã: ${r.invite_code}')">📋 Mã</button>
        </div>
      </div>`).join('');
  } catch { list.innerHTML = '<div class="loading-state">Lỗi tải phòng học</div>'; }
}

// ═══════════════════════════════════════════════════════
// ROOM MIC + ADMIN FEATURES
// ═══════════════════════════════════════════════════════

let micStream = null;
let micActive = false;
let audioContext = null;
let micAnalyser = null;
let micAnimFrame = null;
let isRoomAdmin = false;

/** Kiểm tra quyền admin khi vào phòng */
async function checkRoomAdmin() {
  try {
    const data = await apiFetch('/rooms/admin/check');
    isRoomAdmin = data.isAdmin;
    const adminBtn = $('adminDeleteRoomBtn');
    if (adminBtn) adminBtn.style.display = isRoomAdmin ? 'flex' : 'none';
  } catch { isRoomAdmin = false; }
}

/** Override enterRoom để check admin */
const _origEnterRoom = enterRoom;
async function enterRoom(id) {
  currentRoomId = id;
  $('roomsList').style.display = 'none';
  $('roomDetail').style.display = 'block';
  const header = document.querySelector('#page-rooms .page-header');
  if (header) header.style.display = 'none';
  await checkRoomAdmin();
  await refreshRoom();
  if (roomPollInterval) clearInterval(roomPollInterval);
  roomPollInterval = setInterval(refreshRoom, 5000);
}

/** Admin xóa bất kỳ phòng nào */
async function adminDeleteRoom() {
  if (!currentRoomId || !isRoomAdmin) return;
  if (!confirm('⚠️ Xóa phòng học này? Tất cả tin nhắn sẽ bị mất.')) return;
  try {
    await apiFetch('/rooms/' + currentRoomId, { method: 'DELETE' });
    exitRoom();
    loadRooms();
    toast('🗑️ Đã xóa phòng (Admin)');
  } catch (err) { toast(err.message, 'error'); }
}

// ─── MIC FEATURE ─────────────────────────────────────

/** Bật/tắt microphone */
async function toggleMic() {
  if (micActive) {
    stopMic();
  } else {
    await startMic();
  }
}

async function startMic() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    micActive = true;

    // Setup audio analyser để hiện sóng âm
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(micStream);
    micAnalyser = audioContext.createAnalyser();
    micAnalyser.fftSize = 32;
    source.connect(micAnalyser);
    animateMicBars();

    // Update UI
    const btn = $('micBtn');
    const icon = $('micIcon');
    const label = $('micLabel');
    const status = $('micStatus');
    const viz = $('micVisualizer');
    if (btn) btn.classList.add('active');
    if (icon) icon.textContent = '🔴';
    if (label) label.textContent = 'Tắt mic';
    if (status) { status.textContent = 'Đang phát'; status.classList.add('on'); }
    if (viz) viz.classList.add('active');

    // Cập nhật status lên server
    await updateRoomStatus('speaking');
    toast('🎤 Mic đã bật — mọi người trong phòng có thể nghe');

  } catch (err) {
    if (err.name === 'NotAllowedError') {
      toast('❌ Trình duyệt chưa cho phép dùng mic. Kiểm tra cài đặt.', 'error');
    } else {
      toast('❌ Không thể bật mic: ' + err.message, 'error');
    }
  }
}

function stopMic() {
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  if (audioContext) { audioContext.close(); audioContext = null; }
  if (micAnimFrame) { cancelAnimationFrame(micAnimFrame); micAnimFrame = null; }
  micActive = false;

  // Update UI
  const btn = $('micBtn');
  const icon = $('micIcon');
  const label = $('micLabel');
  const status = $('micStatus');
  const viz = $('micVisualizer');
  if (btn) btn.classList.remove('active');
  if (icon) icon.textContent = '🎤';
  if (label) label.textContent = 'Bật mic';
  if (status) { status.textContent = 'Tắt'; status.classList.remove('on'); }
  if (viz) { viz.classList.remove('active'); resetMicBars(); }

  updateRoomStatus('studying');
}

/** Animate thanh sóng âm theo âm lượng thực tế */
function animateMicBars() {
  if (!micAnalyser) return;
  const dataArray = new Uint8Array(micAnalyser.frequencyBinCount);
  const bars = document.querySelectorAll('.mic-bar');

  function draw() {
    micAnimFrame = requestAnimationFrame(draw);
    micAnalyser.getByteFrequencyData(dataArray);
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const normalized = Math.min(avg / 128, 1);

    bars.forEach((bar, i) => {
      const heights = [0.4, 0.7, 1, 0.7, 0.4];
      const h = Math.max(3, normalized * 18 * heights[i] * (0.8 + Math.random() * 0.4));
      bar.style.height = h + 'px';
    });
  }
  draw();
}

function resetMicBars() {
  document.querySelectorAll('.mic-bar').forEach(b => b.style.height = '3px');
}

/** Override updateRoomStatus để hỗ trợ speaking status */
async function updateRoomStatus(forcedStatus) {
  if (!currentRoomId) return;
  const subject = $('myStudySubject')?.value || '';
  const status = forcedStatus || (micActive ? 'speaking' : 'studying');
  try {
    await apiFetch(`/rooms/${currentRoomId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, study_subject: subject })
    });
  } catch {}
}

/** Override refreshRoom để hiện indicator đang nói */
async function refreshRoom() {
  if (!currentRoomId) return;
  try {
    const room = await apiFetch('/rooms/' + currentRoomId);
    $('roomDetailName').textContent = room.name;

    const membersList = $('roomMembersList');
    membersList.innerHTML = room.members.map(m => {
      const isSpeaking = m.status === 'speaking';
      const avatarHtml = m.custom_avatar
        ? `<img src="${m.custom_avatar.startsWith('http') ? m.custom_avatar : API.replace('/api','') + m.custom_avatar}" />`
        : m.avatar || '👤';
      const isMe = currentUser && m.id === currentUser.id;
      return `<div class="room-member-item">
        <div class="rmi-avatar">${avatarHtml}</div>
        <div class="rmi-info">
          <div class="rmi-name">
            ${escHtml(m.name)}
            ${isRoomAdmin && isMe ? '<span class="admin-badge">Admin</span>' : ''}
          </div>
          <div class="rmi-status ${isSpeaking ? 'studying' : ''}">
            ${isSpeaking ? '🎤 Đang nói' : m.study_subject ? '📚 ' + escHtml(m.study_subject) : '🟢 Đang học'}
          </div>
        </div>
        ${isSpeaking ? '<div class="rmi-speaking"></div>' : ''}
        <span style="font-size:0.65rem;color:var(--text-muted)">Lv.${m.level||1}</span>
      </div>`;
    }).join('');

    // Render messages
    const chatEl = $('roomChatMessages');
    const wasAtBottom = chatEl.scrollHeight - chatEl.scrollTop <= chatEl.clientHeight + 50;
    chatEl.innerHTML = room.messages.map(m => {
      const isMe = currentUser && m.user_id === currentUser.id;
      return `<div class="rcm-item ${isMe ? 'mine' : ''}">
        <div class="rcm-bubble">
          ${!isMe ? `<div class="rcm-name">${escHtml(m.sender_name)}</div>` : ''}
          ${escHtml(m.content)}
        </div>
      </div>`;
    }).join('');
    if (wasAtBottom) chatEl.scrollTop = chatEl.scrollHeight;

  } catch {}
}

/** Override exitRoom để tắt mic */
const _origExitRoom = exitRoom;
function exitRoom() {
  if (micActive) stopMic();
  currentRoomId = null;
  isRoomAdmin = false;
  if (roomPollInterval) { clearInterval(roomPollInterval); roomPollInterval = null; }
  $('roomsList').style.display = 'grid';
  $('roomDetail').style.display = 'none';
  const header = document.querySelector('#page-rooms .page-header');
  if (header) header.style.display = 'flex';
}

// ─── OCR Tab switcher ─────────────────────────────────
function switchOcrTab(tab) {
  // Update tab buttons
  document.querySelectorAll('.ocr-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.getElementById('ocrTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (activeTab) activeTab.classList.add('active');

  // Show/hide content
  const ocrContent = document.getElementById('ocrTabContentOcr');
  const scanContent = document.getElementById('ocrTabContentScan');
  if (ocrContent) ocrContent.style.display = tab === 'ocr' ? 'block' : 'none';
  if (scanContent) scanContent.style.display = tab === 'scan' ? 'block' : 'none';

  // Stop camera if switching away from scan
  if (tab !== 'scan' && scanStream) stopCamera();
}