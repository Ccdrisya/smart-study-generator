/* ======================================================================
   Smart Study Generator — Frontend Application
   app.js  |  Vanilla JS + Bootstrap 5 + Marked.js
   ====================================================================== */

'use strict';

// ── Marked configuration ─────────────────────────────────────────────────────
marked.setOptions({ breaks: true, gfm: true });

// ── State ─────────────────────────────────────────────────────────────────────
const State = {
  activeTab:    'chat',
  profile:      { subject: '', level: 'intermediate', goal: '' },
  quiz:         { questions: [], answers: {}, submitted: false },
  pomodoro:     { interval: null, seconds: 25 * 60, isBreak: false, running: false },
};

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function showToast(msg, type = 'info') {
  const el   = $('#appToast');
  const body = $('#toastBody');
  body.textContent = msg;
  el.className = `toast align-items-center text-bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'secondary'}`;
  const toast = bootstrap.Toast.getOrCreateInstance(el, { delay: 3500 });
  toast.show();
}

function showLoading(text = 'Thinking with Watsonx.ai…') {
  $('#loadingText').textContent = text;
  $('#loadingOverlay').style.display = 'flex';
}

function hideLoading() {
  $('#loadingOverlay').style.display = 'none';
}

function renderMarkdown(text) {
  return marked.parse(text || '');
}

// ── Tab navigation ────────────────────────────────────────────────────────────
function switchTab(tabId) {
  $$('.tab-section').forEach(s => s.classList.remove('active'));
  $$('.nav-pill').forEach(l => l.classList.remove('active'));

  const section = $(`#tab-${tabId}`);
  if (section) section.classList.add('active');

  const link = $(`[data-tab="${tabId}"]`);
  if (link) link.classList.add('active');

  State.activeTab = tabId;
  if (tabId === 'progress') loadProgress();
}

$$('.nav-pill').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    switchTab(link.dataset.tab);
  });
});

// ── Dark mode ─────────────────────────────────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
})();

function updateThemeIcon(theme) {
  const btn = $('#themeToggle');
  btn.innerHTML = theme === 'dark'
    ? '<i class="bi bi-sun-fill"></i>'
    : '<i class="bi bi-moon-stars-fill"></i>';
}

$('#themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
});

// ── Subject sync ──────────────────────────────────────────────────────────────
$('#globalSubject').addEventListener('change', function () {
  const val = this.value;
  State.profile.subject = val;
  $('#profileSubject').value = val;
  // Pre-fill form fields
  if (val) {
    $('#spSubject').value  = val;
    $('#qzSubject').value  = val;
    $('#tbSubject').value  = val;
  }
});

$('#profileSubject').addEventListener('change', function () {
  State.profile.subject = this.value;
  $('#globalSubject').value = this.value;
});

// ── Agent info ────────────────────────────────────────────────────────────────
async function loadAgentInfo() {
  try {
    const res  = await fetch('/api/agent-info');
    const data = await res.json();
    $('#agentName').textContent        = data.name       || 'StudyBot';
    $('#agentTone').textContent        = data.tone       || '—';
    $('#agentSpeciality').textContent  = data.speciality || '—';
    $('#agentDepth').textContent       = data.depth      || '—';
    // Update all inline agent name references
    $$('.agent-name-inline').forEach(el => el.textContent = data.name || 'StudyBot');
    // Update chat header
    const chatHeader = $('#tab-chat .card-header span');
    if (chatHeader) chatHeader.innerHTML =
      `<i class="bi bi-chat-dots-fill me-2 accent"></i>Chat with <span class="agent-name-inline">${data.name}</span>`;
  } catch (_) { /* silently ignore */ }
}

// ── CHAT ──────────────────────────────────────────────────────────────────────
function appendMessage(role, content, isTyping = false) {
  const container = $('#chatMessages');

  const wrap   = document.createElement('div');
  wrap.className = `msg ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.innerHTML  = role === 'user'
    ? '<i class="bi bi-person-fill"></i>'
    : '<i class="bi bi-robot"></i>';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (isTyping) {
    bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    wrap.id = 'typingIndicator';
  } else {
    bubble.innerHTML = role === 'bot' ? renderMarkdown(content) : escapeHtml(content);
  }

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return wrap;
}

function removeTypingIndicator() {
  const el = $('#typingIndicator');
  if (el) el.remove();
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function sendChat() {
  const input   = $('#chatInput');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  appendMessage('user', message);
  appendMessage('bot', '', true);   // typing indicator

  try {
    const res  = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, subject: State.profile.subject }),
    });
    const data = await res.json();
    removeTypingIndicator();

    if (data.error) {
      appendMessage('bot', `⚠️ ${data.error}`);
      showToast(data.error, 'error');
    } else {
      appendMessage('bot', data.reply);
    }
  } catch (err) {
    removeTypingIndicator();
    appendMessage('bot', '⚠️ Network error. Check your connection.');
    showToast('Network error', 'error');
  }
}

$('#sendBtn').addEventListener('click', sendChat);
$('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });

// Quick prompts
$$('.btn-qp').forEach(btn => {
  btn.addEventListener('click', () => {
    $('#chatInput').value = btn.dataset.msg;
    sendChat();
  });
});

// Clear chat
$('#clearChatBtn').addEventListener('click', async () => {
  await fetch('/api/chat/clear', { method: 'POST' });
  $('#chatMessages').innerHTML = '';
  addWelcomeMessage();
  showToast('Chat cleared', 'success');
});

function addWelcomeMessage() {
  const agentName = $('#agentName').textContent || 'StudyBot';
  appendMessage('bot',
    `👋 Hi! I'm **${agentName}**, your AI study companion powered by IBM Watsonx.ai Granite.\n\n` +
    `I can help you with:\n` +
    `- 📚 **Study plans** tailored to your schedule\n` +
    `- 🧠 **Topic breakdowns** with examples and key concepts\n` +
    `- ✅ **Personalised quizzes** to test your knowledge\n` +
    `- ☕ **Study-break suggestions** to keep you sharp\n\n` +
    `Select a subject in the top menu or just start chatting!`
  );
}

// ── STUDY PLAN ────────────────────────────────────────────────────────────────
$('#spHours').addEventListener('input', function () { $('#spHoursVal').textContent = this.value; });

$('#genPlanBtn').addEventListener('click', async () => {
  const subject = $('#spSubject').value.trim();
  if (!subject) { showToast('Please enter a subject', 'error'); return; }

  const payload = {
    subject,
    goal:  $('#spGoal').value.trim() || 'Improve overall understanding',
    hours: parseInt($('#spHours').value),
    level: $('#spLevel').value,
  };

  showLoading('Crafting your personalised study plan…');
  try {
    const res  = await fetch('/api/study-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.error) { showToast(data.error, 'error'); return; }

    const pane  = $('#planResult');
    pane.innerHTML = `<div class="rendered-md">${renderMarkdown(data.plan)}</div>`;
    $('#copyPlanBtn').style.display = 'inline-flex';
    showToast('Study plan generated!', 'success');
  } catch (err) {
    showToast('Failed to generate plan', 'error');
  } finally {
    hideLoading();
  }
});

$('#copyPlanBtn').addEventListener('click', () => {
  const text = $('#planResult').innerText;
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!', 'success'));
});

// ── QUIZ ──────────────────────────────────────────────────────────────────────
$('#qzQuestions').addEventListener('input', function () { $('#qzQVal').textContent = this.value; });

$('#genQuizBtn').addEventListener('click', async () => {
  const topic   = $('#qzTopic').value.trim();
  const subject = $('#qzSubject').value.trim();
  if (!topic || !subject) { showToast('Please enter subject and topic', 'error'); return; }

  const payload = {
    subject,
    topic,
    questions:  parseInt($('#qzQuestions').value),
    difficulty: $('#qzDifficulty').value,
  };

  showLoading('Generating your quiz…');
  try {
    const res  = await fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.error) { showToast(data.error, 'error'); return; }
    if (!data.quiz || !Array.isArray(data.quiz)) {
      showToast('Unexpected response format. Try again.', 'error'); return;
    }

    State.quiz = { questions: data.quiz, answers: {}, submitted: false };
    renderQuiz(data.quiz);
    showToast(`${data.quiz.length} questions ready!`, 'success');
  } catch (err) {
    showToast('Failed to generate quiz', 'error');
  } finally {
    hideLoading();
  }
});

function renderQuiz(questions) {
  const container = $('#quizResult');
  container.innerHTML = '';

  questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'quiz-question';
    card.dataset.idx = idx;

    const qText = document.createElement('div');
    qText.className = 'q-text';
    qText.textContent = `Q${idx + 1}. ${q.question}`;
    card.appendChild(qText);

    (q.options || []).forEach((opt, oIdx) => {
      const label   = document.createElement('label');
      label.className = 'quiz-option';

      const radio  = document.createElement('input');
      radio.type   = 'radio';
      radio.name   = `q${idx}`;
      radio.value  = String.fromCharCode(65 + oIdx);   // A, B, C, D
      radio.addEventListener('change', () => { State.quiz.answers[idx] = radio.value; });

      label.appendChild(radio);
      label.appendChild(document.createTextNode(' ' + opt));
      card.appendChild(label);
    });

    const explanation = document.createElement('div');
    explanation.className = 'quiz-explanation';
    explanation.dataset.idx = idx;
    explanation.textContent = `💡 ${q.explanation || ''}`;
    card.appendChild(explanation);

    container.appendChild(card);
  });

  $('#quizFooter').style.display = 'flex';
  $('#quizScore').textContent = '';
  $('#submitQuizBtn').style.display = 'inline-flex';
}

$('#submitQuizBtn').addEventListener('click', async () => {
  if (State.quiz.submitted) return;
  const { questions, answers } = State.quiz;
  if (!questions.length) return;

  let correct = 0;

  questions.forEach((q, idx) => {
    const card       = $(`.quiz-question[data-idx="${idx}"]`);
    const userAnswer = answers[idx];
    const rightAns   = (q.answer || '').toUpperCase().trim().charAt(0);
    const explanation = card.querySelector('.quiz-explanation');

    $$('.quiz-option', card).forEach(opt => {
      const radio = opt.querySelector('input[type=radio]');
      if (!radio) return;

      const optLetter = radio.value;
      if (optLetter === rightAns)    opt.classList.add('correct');
      if (optLetter === userAnswer && optLetter !== rightAns) opt.classList.add('wrong');

      // Disable inputs
      radio.disabled = true;
    });

    if (explanation) explanation.style.display = 'block';
    if (userAnswer === rightAns) correct++;
  });

  const pct = Math.round((correct / questions.length) * 100);

  // Prepend score banner
  const banner = document.createElement('div');
  banner.className = 'score-banner';
  banner.innerHTML = `
    <div class="score-num">${pct}%</div>
    <div class="score-sub">${correct} / ${questions.length} correct</div>
    <div class="mt-2 text-muted" style="font-size:0.85rem">${scoreMessage(pct)}</div>
  `;
  $('#quizResult').insertBefore(banner, $('#quizResult').firstChild);
  $('#quizResult').scrollTop = 0;
  $('#quizScore').textContent = `Score: ${correct}/${questions.length} (${pct}%)`;
  $('#submitQuizBtn').style.display = 'none';
  State.quiz.submitted = true;

  // Record score on server
  await fetch('/api/quiz/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score: correct, total: questions.length }),
  }).catch(() => {});

  showToast(`Quiz complete! ${correct}/${questions.length} correct.`, correct >= questions.length * 0.7 ? 'success' : 'info');
});

function scoreMessage(pct) {
  if (pct >= 90) return '🎉 Excellent! You have mastered this topic.';
  if (pct >= 70) return '👍 Great work! Review the ones you missed.';
  if (pct >= 50) return '📖 Decent effort — keep practising!';
  return '💪 Keep studying — you\'ll get there!';
}

// ── TOPIC BREAKDOWN ───────────────────────────────────────────────────────────
$('#genBreakdownBtn').addEventListener('click', async () => {
  const subject = $('#tbSubject').value.trim();
  const topic   = $('#tbTopic').value.trim();
  if (!subject || !topic) { showToast('Please enter both subject and topic', 'error'); return; }

  showLoading('Breaking down your topic…');
  try {
    const res  = await fetch('/api/topic-breakdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, topic }),
    });
    const data = await res.json();

    if (data.error) { showToast(data.error, 'error'); return; }

    const pane = $('#breakdownResult');
    pane.innerHTML = `<div class="rendered-md">${renderMarkdown(data.breakdown)}</div>`;
    $('#copyBreakdownBtn').style.display = 'inline-flex';
    showToast('Topic breakdown ready!', 'success');
  } catch (err) {
    showToast('Failed to generate breakdown', 'error');
  } finally {
    hideLoading();
  }
});

$('#copyBreakdownBtn').addEventListener('click', () => {
  const text = $('#breakdownResult').innerText;
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!', 'success'));
});

// ── PROFILE ───────────────────────────────────────────────────────────────────
$('#saveProfileBtn').addEventListener('click', () => {
  State.profile.subject = $('#profileSubject').value;
  State.profile.level   = $('#profileLevel').value;
  State.profile.goal    = $('#profileGoal').value.trim();

  if (State.profile.subject) {
    $('#globalSubject').value = State.profile.subject;
    $('#spSubject').value  = State.profile.subject;
    $('#qzSubject').value  = State.profile.subject;
    $('#tbSubject').value  = State.profile.subject;
    if (State.profile.level) {
      $('#spLevel').value = State.profile.level;
    }
  }
  showToast('Profile saved!', 'success');
});

// ── PROGRESS ──────────────────────────────────────────────────────────────────
async function loadProgress() {
  try {
    const res  = await fetch('/api/progress');
    const data = await res.json();

    $('#statSessions').textContent  = data.sessions || 0;
    $('#statTopics').textContent    = (data.topics_covered || []).length;
    $('#statQuizzes').textContent   = data.quizzes_taken || 0;
    $('#statAvgScore').textContent  = data.avg_quiz_score ? `${data.avg_quiz_score}%` : '—';
    $('#statPlans').textContent     = data.study_plans_created || 0;
    $('#statLastActive').textContent = data.last_active
      ? new Date(data.last_active).toLocaleString()
      : '—';

    const topicsEl = $('#topicsList');
    const topics   = data.topics_covered || [];
    topicsEl.innerHTML = topics.length
      ? topics.map(t => `<span class="topic-badge">${escapeHtml(t)}</span>`).join('')
      : '<p class="text-muted fst-italic">No topics yet. Start studying!</p>';
  } catch (_) { /* ignore */ }
}

$('#resetProgressBtn').addEventListener('click', async () => {
  if (!confirm('Reset all progress and chat history?')) return;
  await fetch('/api/progress/reset', { method: 'POST' });
  await loadProgress();
  $('#chatMessages').innerHTML = '';
  addWelcomeMessage();
  showToast('Progress reset', 'success');
});

// ── POMODORO ─────────────────────────────────────────────────────────────────
function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function updatePomodoroDisplay() {
  $('#pomoDisplay').textContent = formatTime(State.pomodoro.seconds);
  $('#pomoLabel').textContent   = State.pomodoro.isBreak ? '☕ Break Time' : '🎯 Focus Time';
}

$('#pomoStart').addEventListener('click', () => {
  const p = State.pomodoro;
  if (p.running) {
    clearInterval(p.interval);
    p.running = false;
    $('#pomoStart').textContent = 'Resume';
    return;
  }
  p.running = true;
  $('#pomoStart').textContent = 'Pause';

  p.interval = setInterval(() => {
    p.seconds--;
    if (p.seconds <= 0) {
      clearInterval(p.interval);
      p.running = false;
      $('#pomoStart').textContent = 'Start';

      if (!p.isBreak) {
        showToast('⏰ Pomodoro complete! Take a 5-minute break.', 'success');
        p.isBreak = true;
        p.seconds = 5 * 60;
      } else {
        showToast('☀️ Break over! Time to focus.', 'info');
        p.isBreak = false;
        p.seconds = 25 * 60;
      }
    }
    updatePomodoroDisplay();
  }, 1000);
});

$('#pomoReset').addEventListener('click', () => {
  const p = State.pomodoro;
  clearInterval(p.interval);
  p.running  = false;
  p.isBreak  = false;
  p.seconds  = 25 * 60;
  $('#pomoStart').textContent = 'Start';
  updatePomodoroDisplay();
});

// ── INIT ──────────────────────────────────────────────────────────────────────
(async function init() {
  await loadAgentInfo();
  addWelcomeMessage();
  updatePomodoroDisplay();
})();
