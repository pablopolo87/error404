const modules = [
  { id: 'access', name: 'Acceso', icon: '⌁', color: '#ff705f', text: 'Identificación y permisos' },
  { id: 'enrollment', name: 'Matrículas', icon: '▤', color: '#ffd166', text: 'Inscripciones del alumnado' },
  { id: 'schedule', name: 'Horarios', icon: '◫', color: '#70e0a3', text: 'Calendario de clases' },
  { id: 'classroom', name: 'Aula virtual', icon: '◉', color: '#68c7ff', text: 'Contenidos y comunicación' },
  { id: 'certificates', name: 'Certificados', icon: '◇', color: '#a88bff', text: 'Verificación de cursos' }
];

const state = {
  challenges: [], current: 0, runId: null, player: '', score: 0,
  correct: 0, hints: 0, restored: [], selected: null, startedAt: null, timer: null
};

const $ = (selector) => document.querySelector(selector);
const views = ['#introView', '#gameView', '#resultView'];

function showView(selector) {
  views.forEach((view) => $(view).classList.toggle('active', view === selector));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function moduleCard(module, restored = false) {
  return `<article class="module ${restored ? 'restored' : ''}" style="--module-color:${module.color}">
    <div class="module-icon" aria-hidden="true">${module.icon}</div>
    <div><h3>${module.name}</h3><p>${module.text}</p><span class="module-state">${restored ? 'RECUPERADO' : 'BLOQUEADO'}</span></div>
  </article>`;
}

function renderModules(target, restored = state.restored) {
  $(target).innerHTML = modules.map((module) => moduleCard(module, restored.includes(module.id))).join('');
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(element.timer);
  element.timer = setTimeout(() => element.classList.remove('show'), 3500);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.error || 'No se pudo completar la operación.');
  return data;
}

async function checkHealth() {
  const badge = $('#connection');
  try {
    const health = await api('/api/health');
    badge.className = 'connection connected';
    badge.innerHTML = '<span></span> MongoDB Atlas conectado';
    return health;
  } catch (error) {
    badge.className = 'connection disconnected';
    badge.innerHTML = '<span></span> Atlas desconectado';
    toast(error.message);
    return null;
  }
}

async function loadLeaderboard() {
  const board = $('#leaderboard');
  try {
    const list = await api('/api/leaderboard');
    if (!list.length) {
      board.innerHTML = '<p class="empty">Todavía no hay misiones terminadas. Consigue el primer puesto.</p>';
      return;
    }
    board.innerHTML = list.map((item, index) => `<div class="leaderboard-row">
      <span class="rank">${String(index + 1).padStart(2, '0')}</span>
      <strong>${escapeText(item.player)}</strong>
      <span>${item.score} pt</span>
      <span class="hints">${item.hintsUsed} pistas</span>
      <span class="date">${formatTime(item.durationSeconds)}</span>
    </div>`).join('');
  } catch (error) {
    board.innerHTML = `<p class="empty">${escapeText(error.message)}</p>`;
  }
}

function escapeText(value) {
  const node = document.createElement('span');
  node.textContent = String(value ?? '');
  return node.innerHTML;
}

async function startGame(event) {
  event.preventDefault();
  const player = $('#player').value.trim();
  $('#startError').textContent = '';
  if (player.length < 2 || player.length > 20) {
    $('#startError').textContent = 'El alias debe tener entre 2 y 20 caracteres.';
    return;
  }
  try {
    const [run, challenges] = await Promise.all([
      api('/api/runs/start', { method: 'POST', body: JSON.stringify({ player }) }),
      api('/api/challenges')
    ]);
    Object.assign(state, {
      challenges, current: 0, runId: run.runId, player, score: 0, correct: 0,
      hints: 0, restored: [], selected: null, startedAt: Date.now()
    });
    $('#operatorName').textContent = player;
    renderModules('#gameModules');
    showView('#gameView');
    startTimer();
    renderChallenge();
  } catch (error) {
    $('#startError').textContent = error.message;
    checkHealth();
  }
}

function startTimer() {
  clearInterval(state.timer);
  const update = () => $('#timer').textContent = formatTime(Math.floor((Date.now() - state.startedAt) / 1000));
  update();
  state.timer = setInterval(update, 1000);
}

function renderChallenge() {
  const challenge = state.challenges[state.current];
  state.selected = null;
  $('#challengeNumber').textContent = `MISIÓN ${String(challenge.order).padStart(2, '0')} · ${challenge.moduleName.toUpperCase()}`;
  $('#challengeTitle').textContent = challenge.title;
  $('#question').textContent = challenge.question;
  $('#score').textContent = state.score;
  $('#restoredCount').textContent = `${state.restored.length}/5`;
  $('#progressBar').style.width = `${(state.current / state.challenges.length) * 100}%`;
  $('#hintBox').classList.add('hidden');
  $('#feedback').className = 'feedback hidden';
  $('#answerButton').classList.remove('hidden');
  $('#answerButton').disabled = true;
  $('#hintButton').classList.remove('hidden');
  $('#nextButton').classList.add('hidden');
  $('#options').innerHTML = challenge.options.map((option, index) => `<button class="option" data-index="${index}" type="button"><b>${String.fromCharCode(65 + index)}.</b> ${escapeText(option)}</button>`).join('');
  document.querySelectorAll('.option').forEach((button) => button.addEventListener('click', () => selectOption(Number(button.dataset.index))));
}

function selectOption(index) {
  state.selected = index;
  document.querySelectorAll('.option').forEach((button) => button.classList.toggle('selected', Number(button.dataset.index) === index));
  $('#answerButton').disabled = false;
}

async function requestHint() {
  const challenge = state.challenges[state.current];
  try {
    const result = await api('/api/runs/hint', { method: 'POST', body: JSON.stringify({ runId: state.runId, challengeId: challenge._id }) });
    state.score = result.score;
    if (!result.alreadyUsed) state.hints += 1;
    $('#score').textContent = state.score;
    $('#hintBox').textContent = `PISTA · ${result.hint}`;
    $('#hintBox').classList.remove('hidden');
    $('#hintButton').disabled = true;
  } catch (error) { toast(error.message); }
}

async function submitAnswer() {
  if (state.selected === null) return;
  const challenge = state.challenges[state.current];
  $('#answerButton').disabled = true;
  try {
    const result = await api('/api/runs/answer', { method: 'POST', body: JSON.stringify({ runId: state.runId, challengeId: challenge._id, optionIndex: state.selected }) });
    state.score = result.score;
    state.correct = result.correctAnswers;
    state.restored = result.restoredModules;
    $('#score').textContent = state.score;
    $('#restoredCount').textContent = `${state.restored.length}/5`;
    renderModules('#gameModules');
    const feedback = $('#feedback');
    feedback.innerHTML = `<strong>${result.correct ? 'SERVICIO RECUPERADO' : 'SERVICIO BLOQUEADO'}</strong><br>${escapeText(result.explanation)}<br>${escapeText(result.restoredMessage)}`;
    feedback.className = `feedback ${result.correct ? 'good' : ''}`;
    document.querySelectorAll('.option').forEach((button) => {
      button.disabled = true;
      if (Number(button.dataset.index) === state.selected) button.classList.add(result.correct ? 'correct' : 'wrong');
    });
    $('#answerButton').classList.add('hidden');
    $('#hintButton').classList.add('hidden');
    $('#nextButton').classList.remove('hidden');
    $('#nextButton').textContent = state.current === state.challenges.length - 1 ? 'Cerrar informe →' : 'Siguiente misión →';
  } catch (error) { toast(error.message); }
}

async function nextChallenge() {
  if (state.current < state.challenges.length - 1) {
    state.current += 1;
    renderChallenge();
    return;
  }
  try {
    const run = await api('/api/runs/finish', { method: 'POST', body: JSON.stringify({ runId: state.runId }) });
    clearInterval(state.timer);
    $('#resultTitle').textContent = state.restored.length === 5 ? 'Academia recuperada' : 'Recuperación parcial';
    $('#resultText').textContent = `${state.player}, has restaurado ${state.restored.length} de 5 servicios. El resultado ha quedado guardado en MongoDB Atlas.`;
    $('#finalScore').textContent = run.score;
    $('#finalCorrect').textContent = `${run.correctAnswers}/5`;
    $('#finalHints').textContent = run.hintsUsed;
    $('#finalTime').textContent = formatTime(run.durationSeconds);
    renderModules('#resultModules');
    $('#progressBar').style.width = '100%';
    showView('#resultView');
    loadLeaderboard();
  } catch (error) { toast(error.message); }
}

function resetGame(showRanking = false) {
  clearInterval(state.timer);
  state.restored = [];
  renderModules('#introModules', []);
  $('#introCounter').textContent = '0 / 5 recuperados';
  showView('#introView');
  if (showRanking) setTimeout(() => $('.leaderboard-panel').scrollIntoView({ behavior: 'smooth' }), 100);
}

$('#startForm').addEventListener('submit', startGame);
$('#hintButton').addEventListener('click', requestHint);
$('#answerButton').addEventListener('click', submitAnswer);
$('#nextButton').addEventListener('click', nextChallenge);
$('#refreshBoard').addEventListener('click', loadLeaderboard);
$('#playAgain').addEventListener('click', () => resetGame(false));
$('#showRanking').addEventListener('click', () => resetGame(true));

renderModules('#introModules', []);
checkHealth();
loadLeaderboard();
