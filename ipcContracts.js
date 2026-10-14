const VALID_WINDOW_MIGRATION_DIRECTIONS = new Set(['left', 'right', 'top', 'bottom']);
const MAX_MOUSE_PASSTHROUGH_LEASE_MS = 30000;
const DEFAULT_POMODORO_MINUTES = 25;
const MAX_POMODORO_MINUTES = 240;

function createIpcSuccess(data) {
  return {
    success: true,
    data,
  };
}

function createIpcFailure(code, message) {
  return {
    success: false,
    error: {
      code,
      message,
    },
  };
}

function normalizeMousePassthroughRequest(ignore, options = {}) {
  if (typeof ignore !== 'boolean') return null;

  const normalizedOptions = {};
  if (options && typeof options === 'object') {
    if (options.forward === true) {
      normalizedOptions.forward = true;
    }

    const leaseMs = Number(options.leaseMs);
    if (Number.isFinite(leaseMs) && leaseMs > 0) {
      normalizedOptions.leaseMs = Math.min(leaseMs, MAX_MOUSE_PASSTHROUGH_LEASE_MS);
    }
  }

  return {
    ignore,
    options: normalizedOptions,
  };
}

function normalizeWindowMigrationDirection(direction) {
  return VALID_WINDOW_MIGRATION_DIRECTIONS.has(direction) ? direction : null;
}

function normalizeStatusWindowSize(size) {
  return {
    width: Math.min(Math.max(Math.ceil(Number(size?.width) || 400), 360), 520),
    height: Math.min(Math.max(Math.ceil(Number(size?.height) || 460), 360), 720),
  };
}

function isAllowedSkinId(skinId, availableSkins) {
  return typeof skinId === 'string'
    && Array.isArray(availableSkins)
    && availableSkins.includes(skinId);
}

function normalizePomodoroMinutes(value, fallback = DEFAULT_POMODORO_MINUTES) {
  const fallbackMinutes = Number.isFinite(Number(fallback)) && Number(fallback) > 0
    ? Math.floor(Number(fallback))
    : DEFAULT_POMODORO_MINUTES;
  const minutes = Math.floor(Number(value));

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return Math.min(fallbackMinutes, MAX_POMODORO_MINUTES);
  }

  return Math.min(minutes, MAX_POMODORO_MINUTES);
}

const PET_SCALE_MIN_PERCENT = 50;
const PET_SCALE_MAX_PERCENT = 150;
const PET_SCALE_STEP_PERCENT = 5;
const PET_SCALE_DEFAULT_PERCENT = 100;

function normalizePetScalePercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return PET_SCALE_DEFAULT_PERCENT;
  }
  const stepped = Math.round(value / PET_SCALE_STEP_PERCENT) * PET_SCALE_STEP_PERCENT;
  return Math.min(Math.max(stepped, PET_SCALE_MIN_PERCENT), PET_SCALE_MAX_PERCENT);
}

module.exports = {
  PET_SCALE_DEFAULT_PERCENT,
  PET_SCALE_MAX_PERCENT,
  PET_SCALE_MIN_PERCENT,
  PET_SCALE_STEP_PERCENT,
  createIpcFailure,
  createIpcSuccess,
  isAllowedSkinId,
  normalizeMousePassthroughRequest,
  normalizePetScalePercent,
  normalizePomodoroMinutes,
  normalizeStatusWindowSize,
  normalizeWindowMigrationDirection,
};

