const DEFAULT_POMODORO_STATE = {
  status: 'idle',
  durationMinutes: 25,
  remainingMs: 0,
  progress: 0,
  isAlwaysOnTop: true,
  lastPomodoroMinutes: 25,
  assets: {
    yueqi: 'assets/default/left_cultivate.webp',
    shenjiu: 'assets/default/right_cultivate.webp',
  },
};

const stateEls = {
  setup: document.getElementById('pomodoro-setup'),
  running: document.getElementById('pomodoro-running'),
  completed: document.getElementById('pomodoro-completed'),
};

const pinBtn = document.getElementById('pomodoro-pin');
const closeBtn = document.getElementById('pomodoro-close');
const decreaseBtn = document.getElementById('pomodoro-decrease');
const increaseBtn = document.getElementById('pomodoro-increase');
const minutesInput = document.getElementById('pomodoro-minutes');
const startBtn = document.getElementById('pomodoro-start');
const stopBtn = document.getElementById('pomodoro-stop');
const finishBtn = document.getElementById('pomodoro-finish');
const timerEl = document.getElementById('pomodoro-timer');
const progressEl = document.querySelector('.pomodoro-progress');
const progressFillEl = document.getElementById('pomodoro-progress-fill');

const petImageIds = [
  'pomodoro-setup-yueqi',
  'pomodoro-running-yueqi',
  'pomodoro-complete-yueqi',
  'pomodoro-setup-shenjiu',
  'pomodoro-running-shenjiu',
  'pomodoro-complete-shenjiu',
];

let currentLocale = 'zh';
let currentState = { ...DEFAULT_POMODORO_STATE };

function t(key) {
  if (typeof I18N === 'undefined') return key;
  return (I18N[currentLocale]?.ui?.[key]) ?? (I18N.zh?.ui?.[key]) ?? key;
}

function unwrapResult(result) {
  if (result?.success === true) return result.data;
  return result || null;
}

function updateI18nElements() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
    el.setAttribute('aria-label', t(el.dataset.i18nTitle));
  });
  renderPinState(Boolean(currentState.isAlwaysOnTop));
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(Number(ms) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const two = value => String(value).padStart(2, '0');
  return hours > 0
    ? `${hours}:${two(minutes)}:${two(seconds)}`
    : `${two(minutes)}:${two(seconds)}`;
}

function showState(status) {
  const normalizedStatus = status === 'running' || status === 'completed' ? status : 'setup';
  Object.entries(stateEls).forEach(([key, el]) => {
    el.classList.toggle('pomodoro-state--hidden', key !== normalizedStatus);
  });
}

function setPetImage(id, src) {
  const img = document.getElementById(id);
  if (!img) return;
  img.src = src;
}

function renderPets(assets = DEFAULT_POMODORO_STATE.assets) {
  const yueqiSrc = assets.yueqi || DEFAULT_POMODORO_STATE.assets.yueqi;
  const shenjiuSrc = assets.shenjiu || DEFAULT_POMODORO_STATE.assets.shenjiu;

  petImageIds.forEach(id => {
    setPetImage(id, id.endsWith('yueqi') ? yueqiSrc : shenjiuSrc);
  });
}

function renderPinState(isAlwaysOnTop) {
  pinBtn.setAttribute('aria-pressed', String(isAlwaysOnTop));
  pinBtn.title = isAlwaysOnTop ? t('pomodoroUnpin') : t('pomodoroPin');
  pinBtn.setAttribute('aria-label', pinBtn.title);
  pinBtn.classList.toggle('pomodoro-icon-button--muted', !isAlwaysOnTop);
}

function renderState(nextState) {
  currentState = {
    ...DEFAULT_POMODORO_STATE,
    ...currentState,
    ...nextState,
    assets: {
      ...DEFAULT_POMODORO_STATE.assets,
      ...(nextState?.assets || currentState.assets || {}),
    },
  };

  const defaultMinutes = currentState.lastPomodoroMinutes || currentState.durationMinutes || 25;
  if (currentState.status === 'idle') {
    minutesInput.value = String(defaultMinutes);
  }

  timerEl.textContent = formatTime(
    currentState.status === 'running' || currentState.status === 'completed'
      ? currentState.remainingMs
      : defaultMinutes * 60 * 1000,
  );
  const progressPercent = Math.round(Math.max(0, Math.min(1, Number(currentState.progress) || 0)) * 100);
  progressEl.setAttribute('aria-valuenow', String(progressPercent));
  progressFillEl.style.width = `${progressPercent}%`;

  renderPets(currentState.assets);
  renderPinState(Boolean(currentState.isAlwaysOnTop));
  showState(currentState.status);
}

function getInputMinutes() {
  return Math.floor(Number(minutesInput.value));
}

function changeMinutes(delta) {
  const current = Number.isFinite(getInputMinutes()) ? getInputMinutes() : 25;
  const next = Math.min(240, Math.max(1, current + delta));
  minutesInput.value = String(next);
}

async function refreshState() {
  const result = await window.electronAPI.getPomodoroState();
  renderState(unwrapResult(result));
}

decreaseBtn.addEventListener('click', () => changeMinutes(-5));
increaseBtn.addEventListener('click', () => changeMinutes(5));

startBtn.addEventListener('click', async () => {
  const result = await window.electronAPI.startPomodoro(getInputMinutes());
  renderState(unwrapResult(result));
});

stopBtn.addEventListener('click', async () => {
  const result = await window.electronAPI.stopPomodoro();
  renderState(unwrapResult(result));
});

finishBtn.addEventListener('click', () => {
  window.electronAPI.closePomodoroWindow();
});

closeBtn.addEventListener('click', () => {
  window.electronAPI.closePomodoroWindow();
});

pinBtn.addEventListener('click', async () => {
  const result = await window.electronAPI.setPomodoroAlwaysOnTop(!currentState.isAlwaysOnTop);
  renderState(unwrapResult(result));
});

window.electronAPI.onPomodoroState((state) => {
  renderState(state);
});

window.electronAPI.onLocaleChange?.((locale) => {
  currentLocale = locale;
  document.documentElement.lang = locale;
  updateI18nElements();
});

window.electronAPI.getLocale().then(locale => {
  currentLocale = locale;
  document.documentElement.lang = locale;
  updateI18nElements();
  return refreshState();
});
