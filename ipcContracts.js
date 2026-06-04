const VALID_WINDOW_MIGRATION_DIRECTIONS = new Set(['left', 'right', 'top', 'bottom']);
const MAX_MOUSE_PASSTHROUGH_LEASE_MS = 30000;

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

module.exports = {
  createIpcFailure,
  createIpcSuccess,
  isAllowedSkinId,
  normalizeMousePassthroughRequest,
  normalizeStatusWindowSize,
  normalizeWindowMigrationDirection,
};
