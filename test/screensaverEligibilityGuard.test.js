const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createPresentationGuard,
  coversBounds,
} = require('../src/main/services/PresentationGuard');

function createScreensaverEligibilityGuard(deps) {
  return createPresentationGuard(deps, { mode: 'screensaver' });
}

const DEFAULT_MAX_CACHE_AGE_MS = 2000;

test('ScreensaverEligibilityGuard - macOS returns unsupported_platform', () => {
  const guard = createScreensaverEligibilityGuard({ platform: 'darwin' });
  const result = guard.canInterrupt();
  assert.deepEqual(result, { canInterrupt: false, reason: 'unsupported_platform' });
});

test('ScreensaverEligibilityGuard - non-windows platforms return unsupported_platform', () => {
  const guard = createScreensaverEligibilityGuard({ platform: 'linux' });
  const result = guard.canInterrupt();
  assert.deepEqual(result, { canInterrupt: false, reason: 'unsupported_platform' });
});

test('ScreensaverEligibilityGuard - win32 provider error when getActiveWindowInfo is missing or throws', () => {
  const guardNoProvider = createScreensaverEligibilityGuard({ platform: 'win32' });
  assert.deepEqual(guardNoProvider.canInterrupt(), { canInterrupt: false, reason: 'provider-error' });

  const guardThrowing = createScreensaverEligibilityGuard({
    platform: 'win32',
    getActiveWindowInfo: () => { throw new Error('Provider crash'); },
  });
  assert.deepEqual(guardThrowing.canInterrupt(), { canInterrupt: false, reason: 'provider-error' });
});

test('ScreensaverEligibilityGuard - win32 allows interrupt when window awareness is disabled', () => {
  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({ reason: 'disabled' }),
  });
  assert.deepEqual(guard.canInterrupt(), { canInterrupt: true, reason: null });
});

test('ScreensaverEligibilityGuard - win32 unknown state when info/active/window is missing', () => {
  const guardNull = createScreensaverEligibilityGuard({
    platform: 'win32',
    getActiveWindowInfo: () => null,
  });
  assert.deepEqual(guardNull.canInterrupt(), { canInterrupt: false, reason: 'unknown-state' });

  const guardInactive = createScreensaverEligibilityGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({ active: false, window: { isFullScreen: false } }),
  });
  assert.deepEqual(guardInactive.canInterrupt(), { canInterrupt: false, reason: 'unknown-state' });
});

test('ScreensaverEligibilityGuard - win32 stale cache rejection (>2000ms or future timestamp)', () => {
  let nowTime = 10000;
  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    now: () => nowTime,
    maxCacheAgeMs: DEFAULT_MAX_CACHE_AGE_MS,
    getActiveWindowInfo: () => ({
      active: true,
      window: { isFullScreen: false, bounds: { x: 100, y: 100, width: 800, height: 600 } },
      timestamp: nowTime - 2500, // 2500ms old (> 2000ms)
    }),
  });
  assert.deepEqual(guard.canInterrupt(), { canInterrupt: false, reason: 'stale_cache' });

  // Future timestamp check
  const guardFuture = createScreensaverEligibilityGuard({
    platform: 'win32',
    now: () => nowTime,
    getActiveWindowInfo: () => ({
      active: true,
      window: { isFullScreen: false, bounds: { x: 100, y: 100, width: 800, height: 600 } },
      timestamp: nowTime + 500,
    }),
  });
  assert.deepEqual(guardFuture.canInterrupt(), { canInterrupt: false, reason: 'stale_cache' });
});

test('ScreensaverEligibilityGuard - sampledAt support and NaN timestamp validation', () => {
  const nowTime = 10000;
  // Using sampledAt instead of timestamp
  const guardSampledAt = createScreensaverEligibilityGuard({
    platform: 'win32',
    now: () => nowTime,
    getActiveWindowInfo: () => ({
      active: true,
      window: { isFullScreen: false, bounds: { x: 200, y: 200, width: 1000, height: 700 } },
      sampledAt: nowTime - 500,
    }),
  });
  assert.deepEqual(guardSampledAt.canInterrupt(), { canInterrupt: true, reason: null });

  // NaN timestamp / non-numeric
  const guardNaN = createScreensaverEligibilityGuard({
    platform: 'win32',
    now: () => nowTime,
    getActiveWindowInfo: () => ({
      active: true,
      window: { isFullScreen: false, bounds: { x: 200, y: 200, width: 1000, height: 700 } },
      timestamp: NaN,
    }),
  });
  assert.deepEqual(guardNaN.canInterrupt(), { canInterrupt: false, reason: 'stale_cache' });

  const guardStringTs = createScreensaverEligibilityGuard({
    platform: 'win32',
    now: () => nowTime,
    getActiveWindowInfo: () => ({
      active: true,
      window: { isFullScreen: false, bounds: { x: 200, y: 200, width: 1000, height: 700 } },
      timestamp: 'invalid-timestamp',
    }),
  });
  assert.deepEqual(guardStringTs.canInterrupt(), { canInterrupt: false, reason: 'stale_cache' });
});

test('ScreensaverEligibilityGuard - win32 fullscreen window rejection', () => {
  const nowTime = 10000;
  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    now: () => nowTime,
    getActiveWindowInfo: () => ({
      active: true,
      window: { isFullScreen: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
      timestamp: nowTime - 500,
    }),
  });
  assert.deepEqual(guard.canInterrupt(), { canInterrupt: false, reason: 'fullscreen' });
});

test('ScreensaverEligibilityGuard - win32 presentation mode (non-maximized borderless coverage) rejection', () => {
  const nowTime = 10000;
  const display = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };

  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    now: () => nowTime,
    getDisplays: () => [display],
    getActiveWindowInfo: () => ({
      active: true,
      window: { isFullScreen: false, isMaximized: false, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
      timestamp: nowTime - 500,
    }),
  });
  assert.deepEqual(guard.canInterrupt(), { canInterrupt: false, reason: 'presentation' });
});

test('ScreensaverEligibilityGuard - win32 maximized office window covering workArea is allowed', () => {
  const nowTime = 10000;
  const display = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };

  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    now: () => nowTime,
    getDisplays: () => [display],
    getActiveWindowInfo: () => ({
      active: true,
      window: { isFullScreen: false, isMaximized: true, bounds: { x: 0, y: 0, width: 1920, height: 1040 } },
      timestamp: nowTime - 500,
    }),
  });
  assert.deepEqual(guard.canInterrupt(), { canInterrupt: true, reason: null });
});

test('ScreensaverEligibilityGuard - win32 rejects when display lookup fails', () => {
  const nowTime = 10000;
  const baseDeps = {
    platform: 'win32',
    now: () => nowTime,
    getActiveWindowInfo: () => ({
      active: true,
      window: { isFullScreen: false, bounds: { x: 200, y: 200, width: 1000, height: 700 } },
      timestamp: nowTime - 500,
    }),
  };
  const guard = createScreensaverEligibilityGuard({
    ...baseDeps,
    getDisplays: () => { throw new Error('display service unavailable'); },
  });

  assert.deepEqual(guard.canInterrupt(), { canInterrupt: false, reason: 'display-query-failed' });

  const invalidResultGuard = createScreensaverEligibilityGuard({
    ...baseDeps,
    getDisplays: () => null,
  });
  assert.deepEqual(invalidResultGuard.canInterrupt(), { canInterrupt: false, reason: 'display-query-failed' });
});

test('ScreensaverEligibilityGuard - win32 fresh non-fullscreen window allows interrupt', () => {
  const nowTime = 10000;
  const display = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } };

  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    now: () => nowTime,
    getDisplays: () => [display],
    getActiveWindowInfo: () => ({
      active: true,
      window: { isFullScreen: false, bounds: { x: 200, y: 200, width: 1000, height: 700 } },
      timestamp: nowTime - 1000,
    }),
  });
  assert.deepEqual(guard.canInterrupt(), { canInterrupt: true, reason: null });
});

test('coversBounds helper - correctly calculates area coverage', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };

  // Exact match
  assert.equal(coversBounds({ x: 0, y: 0, width: 1920, height: 1080 }, workArea), true);

  // Within tolerance (8px)
  assert.equal(coversBounds({ x: 2, y: 2, width: 1916, height: 1076 }, workArea), true);

  // Smaller window
  assert.equal(coversBounds({ x: 100, y: 100, width: 800, height: 600 }, workArea), false);

  // Null / invalid inputs
  assert.equal(coversBounds(null, workArea), false);
  assert.equal(coversBounds({ x: 'invalid', y: 0, width: 100, height: 100 }, workArea), false);
});
