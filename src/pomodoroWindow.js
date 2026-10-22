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
let hasCompletedCeremonyPlayed = false;

function playMeditationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    // 先登记关闭，即使后续节点创建抛错也能释放 AudioContext
    setTimeout(() => {
      try {
        ctx.close();
      } catch (_) {}
    }, 3500);
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.22, now);
    masterGain.connect(ctx.destination);

    // Meditative singing bowl / chime partials (fundamental + harmonic overtones)
    const partials = [
      { freq: 528, gain: 0.6, decay: 3.2 },
      { freq: 530.5, gain: 0.35, decay: 2.8 }, // acoustic shimmer / subtle beating
      { freq: 1457, gain: 0.22, decay: 2.0 },  // ~2.76x overtone
      { freq: 2851, gain: 0.10, decay: 1.2 },  // ~5.4x shimmer
    ];

    partials.forEach(({ freq, gain, decay }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(gain, now + 0.006);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + decay);

      osc.connect(gainNode);
      gainNode.connect(masterGain);

      osc.start(now);
      osc.stop(now + decay);
    });
  } catch (err) {
    console.warn('[Pomodoro] Chime playback skipped:', err);
  }
}

function triggerCompletionCeremony() {
  const ceremonyEl = document.getElementById('pomodoro-stamp-ceremony');
  if (ceremonyEl) {
    ceremonyEl.classList.remove('pomodoro-stamp-ceremony--active');
    void ceremonyEl.offsetWidth; // Force CSS reflow to re-trigger animations
    ceremonyEl.classList.add('pomodoro-stamp-ceremony--active');
  }
  // Synchronize singing bowl chime strike with the stamp impact moment (~220ms)
  setTimeout(() => {
    playMeditationChime();
  }, 220);
}




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
  pinBtn.dataset.tooltip = pinTitle;
  pinBtn.setAttribute('aria-label', pinTitle);
  pinBtn.removeAttribute('title');
  pinBtn.classList.toggle('pomodoro-icon-button--muted', !isAlwaysOnTop);
  // Refresh visible tooltip if pin button is currently active
  if (activeTooltipTarget === pinBtn && tooltipEl) {
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

  if (currentState.status === 'running' || currentState.status === 'idle') {
    hasCompletedCeremonyPlayed = false;
  } else if (currentState.status === 'completed' && !hasCompletedCeremonyPlayed) {
    hasCompletedCeremonyPlayed = true;
    triggerCompletionCeremony();
  }
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


// Custom Tooltip Logic (CSS Anchor Positioning + Popover Top Layer)
const tooltipEl = document.getElementById('pomodoro-tooltip');
let activeTooltipTarget = null;
let hideTooltipTimeout = null;

function isPopoverOpen(el) {
  if (!el) return false;
  try {
    return el.matches ? el.matches(':popover-open') : false;
  } catch (_) {
    return false;
  }
}

function showTooltip(target) {
  if (!tooltipEl || !target) return;
  if (hideTooltipTimeout) {
    clearTimeout(hideTooltipTimeout);
    hideTooltipTimeout = null;
  }

  const tooltipText = target.dataset.tooltip || target.getAttribute('data-tooltip') || target.getAttribute('aria-label');
  if (!tooltipText) return;

  if (activeTooltipTarget && activeTooltipTarget !== target) {
    activeTooltipTarget.style.anchorName = '';
  }
  activeTooltipTarget = target;
  target.style.anchorName = '--pomodoro-tooltip-anchor';
  tooltipEl.textContent = tooltipText;

  if (typeof tooltipEl.showPopover === 'function') {
    try {
      if (!isPopoverOpen(tooltipEl)) {
        tooltipEl.showPopover();
      }
    } catch (_) {}
  }
}

function hideTooltip(target) {
  if (!tooltipEl) return;
  if (hideTooltipTimeout) {
    clearTimeout(hideTooltipTimeout);
    hideTooltipTimeout = null;
  }

  if (target) {
    if (activeTooltipTarget === target) {
      target.style.anchorName = '';
      activeTooltipTarget = null;
    }
  } else if (activeTooltipTarget) {
    activeTooltipTarget.style.anchorName = '';
    activeTooltipTarget = null;
  }

  if (typeof tooltipEl.hidePopover === 'function') {
    try {
      if (isPopoverOpen(tooltipEl)) {
        tooltipEl.hidePopover();
      }
    } catch (_) {}
  }
}

function scheduleHideTooltip(target, delay = 100) {
  if (hideTooltipTimeout) {
    clearTimeout(hideTooltipTimeout);
  }
  hideTooltipTimeout = setTimeout(() => {
    hideTooltip(target);
  }, delay);
}

// Attach hover and keyboard listeners to elements with tooltips
function initTooltipEvents() {
  const targets = document.querySelectorAll('.pomodoro-icon-button, .pomodoro-step-button');
  targets.forEach((target) => {
    target.addEventListener('mouseenter', () => {
      showTooltip(target);
    });
    target.addEventListener('mouseleave', () => {
      scheduleHideTooltip(target, 100);
    });
    target.addEventListener('focusin', () => {
      showTooltip(target);
    });
    target.addEventListener('focusout', () => {
      hideTooltip(target);
    });
  });

  if (tooltipEl) {
    tooltipEl.addEventListener('mouseenter', () => {
      if (hideTooltipTimeout) {
        clearTimeout(hideTooltipTimeout);
        hideTooltipTimeout = null;
      }
    });
    tooltipEl.addEventListener('mouseleave', () => {
      scheduleHideTooltip(activeTooltipTarget, 100);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideTooltip();
    }
  });
}

initTooltipEvents();
WindowI18n.init(refreshState);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showTooltip,
    hideTooltip,
    initTooltipEvents,
    renderPinState,
    isPopoverOpen,
  };
}

