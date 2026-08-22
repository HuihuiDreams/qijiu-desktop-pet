const DEFAULT_POMODORO_STATE = {
  status: 'idle',
  durationMinutes: 25,
  remainingMs: 0,
  progress: 0,
  isAlwaysOnTop: true,
  lastPomodoroMinutes: 25,
  assets: {
    yueqi: 'pet-asset://skin/default/left_cultivate.webp',
    shenjiu: 'pet-asset://skin/default/right_cultivate.webp',
    cultivate: 'pet-asset://skin/default/cultivate.webp',
    kiss: 'pet-asset://skin/default/kiss.webp',
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

let currentState = { ...DEFAULT_POMODORO_STATE };
let currentLocale;


function unwrapResult(result) {
  if (result?.success === true) return result.data;
  return result || null;
}

function isIpcFailure(result) {
  return result?.success === false;
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
  const cultivateSrc = assets.cultivate || DEFAULT_POMODORO_STATE.assets.cultivate;
  const kissSrc = assets.kiss || DEFAULT_POMODORO_STATE.assets.kiss;

  setPetImage('pomodoro-setup-yueqi', yueqiSrc);
  setPetImage('pomodoro-setup-shenjiu', shenjiuSrc);
  setPetImage('pomodoro-running-cultivate', cultivateSrc);
  setPetImage('pomodoro-complete-kiss', kissSrc);
}

function renderPinState(isAlwaysOnTop) {
  pinBtn.setAttribute('aria-pressed', String(isAlwaysOnTop));
  const pinTitle = isAlwaysOnTop ? t('pomodoroUnpin') : t('pomodoroPin');
  pinBtn.title = pinTitle;
  pinBtn.setAttribute('aria-label', pinTitle);
  // Keep custom tooltip attribute in sync during hover
  if (pinBtn.hasAttribute('data-tooltip-text')) {
    pinBtn.setAttribute('data-tooltip-text', pinTitle);
  }
  pinBtn.classList.toggle('pomodoro-icon-button--muted', !isAlwaysOnTop);
  // Refresh visible tooltip if pin button is currently hovered
  if (activeHoverEl === pinBtn && tooltipEl) {
    tooltipEl.textContent = pinTitle;
  }
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
  const nextIsAlwaysOnTop = !currentState.isAlwaysOnTop;
  renderState({ isAlwaysOnTop: nextIsAlwaysOnTop });
  pinBtn.disabled = true;

  try {
    const result = await window.electronAPI.setPomodoroAlwaysOnTop(nextIsAlwaysOnTop);
    if (isIpcFailure(result)) {
      renderState({ isAlwaysOnTop: !nextIsAlwaysOnTop });
      return;
    }
    renderState(unwrapResult(result));
  } catch (error) {
    console.error('Failed to toggle pomodoro pin state:', error);
    renderState({ isAlwaysOnTop: !nextIsAlwaysOnTop });
  } finally {
    pinBtn.disabled = false;
  }
});

window.electronAPI.onPomodoroState((state) => {
  renderState(state);
});


// Custom Tooltip Logic
const tooltipEl = document.getElementById('pomodoro-tooltip');
let activeHoverEl = null;

function showTooltip(target) {
  if (!tooltipEl) return;
  
  // Clear native title to prevent default tooltip, saving it in a custom attribute
  if (target.title) {
    target.setAttribute('data-tooltip-text', target.title);
    target.title = '';
  }
  
  const titleText = target.getAttribute('data-tooltip-text');
  if (!titleText) return;

  tooltipEl.textContent = titleText;
  
  // Calculate position
  const rect = target.getBoundingClientRect();
  const panelRect = document.getElementById('pomodoro-panel').getBoundingClientRect();
  
  // Center horizontally relative to the target
  const targetCenterX = rect.left + rect.width / 2 - panelRect.left;
  
  // Determine if we show it above or below the target
  // If target is in the upper half of the panel, show below. Otherwise show above.
  const isUpperHalf = (rect.top + rect.height / 2 - panelRect.top) < (panelRect.height / 2);
  
  // First, set the left coordinate
  tooltipEl.style.left = `${targetCenterX}px`;
  
  // To get offsetHeight accurately, we ensure tooltipEl is in the DOM and style is computed
  const tooltipHeight = tooltipEl.offsetHeight || 26;

  let targetY;
  if (isUpperHalf) {
    // Show below the element (slide down from -4px offset)
    targetY = rect.bottom - panelRect.top + 6;
    if (!tooltipEl.classList.contains('pomodoro-tooltip--visible')) {
      tooltipEl.style.transform = 'translate(-50%, -4px)';
    }
  } else {
    // Show above the element (slide up from 4px offset)
    targetY = rect.top - panelRect.top - tooltipHeight - 6;
    if (!tooltipEl.classList.contains('pomodoro-tooltip--visible')) {
      tooltipEl.style.transform = 'translate(-50%, 4px)';
    }
  }
  
  tooltipEl.style.top = `${targetY}px`;
  
  // Force a reflow to apply the initial transform/position
  tooltipEl.getBoundingClientRect();
  
  // Add visible class and set final transform
  tooltipEl.classList.add('pomodoro-tooltip--visible');
  tooltipEl.style.transform = 'translate(-50%, 0)';
}

function hideTooltip(target) {
  if (!tooltipEl) return;
  
  // Restore native title on mouse leave
  if (target && target.getAttribute('data-tooltip-text')) {
    target.title = target.getAttribute('data-tooltip-text');
  }
  
  tooltipEl.classList.remove('pomodoro-tooltip--visible');
}

// Attach hover listeners to elements with titles
function initTooltipEvents() {
  const targets = document.querySelectorAll('.pomodoro-icon-button, .pomodoro-step-button');
  targets.forEach(target => {
    target.addEventListener('mouseenter', () => {
      activeHoverEl = target;
      showTooltip(target);
    });
    target.addEventListener('mouseleave', () => {
      if (activeHoverEl === target) {
        activeHoverEl = null;
      }
      hideTooltip(target);
    });
    target.addEventListener('click', () => {
      // Temporarily restore title so renderPinState / translation updates write to title correctly
      if (target.getAttribute('data-tooltip-text')) {
        target.title = target.getAttribute('data-tooltip-text');
      }
      
      // Update tooltip content dynamically after state / title has been updated
      setTimeout(() => {
        if (activeHoverEl === target) {
          showTooltip(target);
        }
      }, 50);
    });
  });
}

window.electronAPI.getLocale().then(() => {
  initTooltipEvents();
  return refreshState();
});

WindowI18n.init(refreshState);
