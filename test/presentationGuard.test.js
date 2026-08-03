const assert = require('node:assert/strict');
const test = require('node:test');

const { createPresentationGuard, coversBounds } = require("../src/main/services/PresentationGuard");

// ═══════════════════════════════════════════════════════════════════
//  macOS: always canInterrupt
// ═══════════════════════════════════════════════════════════════════

test('macOS: always returns canInterrupt = true', () => {
  const guard = createPresentationGuard({ platform: 'darwin' });
  const result = guard.canInterrupt();
  assert.equal(result.canInterrupt, true);
  assert.equal(result.reason, null);
});

test('macOS: canInterrupt even without any provider', () => {
  const guard = createPresentationGuard({
    platform: 'darwin',
    getActiveWindowInfo: null,
    getDisplays: null,
  });
  const result = guard.canInterrupt();
  assert.equal(result.canInterrupt, true);
});

// ═══════════════════════════════════════════════════════════════════
//  Linux / unsupported: always canInterrupt
// ═══════════════════════════════════════════════════════════════════

test('Linux: always returns canInterrupt = true', () => {
  const guard = createPresentationGuard({ platform: 'linux' });
  assert.equal(guard.canInterrupt().canInterrupt, true);
});

// ═══════════════════════════════════════════════════════════════════
//  Windows: fullscreen detection
// ═══════════════════════════════════════════════════════════════════

test('Windows: canInterrupt when window is not fullscreen', () => {
  const guard = createPresentationGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({
      active: true,
      window: {
        bounds: { x: 100, y: 100, width: 800, height: 600 },
        isFullScreen: false,
        isMaximized: false,
      },
    }),
    getDisplays: () => [{
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    }],
  });

  const result = guard.canInterrupt();
  assert.equal(result.canInterrupt, true);
  assert.equal(result.reason, null);
});

test('Windows: defers when isFullScreen is true', () => {
  const guard = createPresentationGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({
      active: true,
      window: {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        isFullScreen: true,
        isMaximized: false,
      },
    }),
  });

  const result = guard.canInterrupt();
  assert.equal(result.canInterrupt, false);
  assert.equal(result.reason, 'fullscreen');
});

test('Windows: defers when window covers entire workArea (presentation)', () => {
  const guard = createPresentationGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({
      active: true,
      window: {
        bounds: { x: 0, y: 0, width: 1920, height: 1040 },
        isFullScreen: false,
        isMaximized: false,
      },
    }),
    getDisplays: () => [{
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    }],
  });

  const result = guard.canInterrupt();
  assert.equal(result.canInterrupt, false);
  assert.equal(result.reason, 'presentation');
});

test('Windows: defers when provider unavailable', () => {
  const guard = createPresentationGuard({
    platform: 'win32',
    getActiveWindowInfo: null,
  });

  const result = guard.canInterrupt();
  assert.equal(result.canInterrupt, false);
  assert.equal(result.reason, 'provider-error');
});

test('Windows: defers when window info is inactive', () => {
  const guard = createPresentationGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({ active: false, window: null }),
  });

  const result = guard.canInterrupt();
  assert.equal(result.canInterrupt, false);
  assert.equal(result.reason, 'unknown-state');
});

test('Windows: allows interrupt when active window awareness is disabled', () => {
  const guard = createPresentationGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({
      active: false,
      source: 'unavailable',
      reason: 'disabled',
      window: null,
    }),
  });

  const result = guard.canInterrupt();
  assert.equal(result.canInterrupt, true);
  assert.equal(result.reason, null);
});

test('Windows: defers when provider throws', () => {
  const guard = createPresentationGuard({
    platform: 'win32',
    getActiveWindowInfo: () => { throw new Error('fail'); },
  });

  const result = guard.canInterrupt();
  assert.equal(result.canInterrupt, false);
  assert.equal(result.reason, 'provider-error');
});

// ═══════════════════════════════════════════════════════════════════
//  coversBounds utility
// ═══════════════════════════════════════════════════════════════════

test('coversBounds: exact match returns true', () => {
  assert.equal(
    coversBounds(
      { x: 0, y: 0, width: 1920, height: 1040 },
      { x: 0, y: 0, width: 1920, height: 1040 },
    ),
    true,
  );
});

test('coversBounds: slightly larger window returns true', () => {
  assert.equal(
    coversBounds(
      { x: -5, y: -5, width: 1930, height: 1050 },
      { x: 0, y: 0, width: 1920, height: 1040 },
    ),
    true,
  );
});

test('coversBounds: small window returns false', () => {
  assert.equal(
    coversBounds(
      { x: 100, y: 100, width: 800, height: 600 },
      { x: 0, y: 0, width: 1920, height: 1040 },
    ),
    false,
  );
});

test('coversBounds: null bounds returns false', () => {
  assert.equal(coversBounds(null, { x: 0, y: 0, width: 100, height: 100 }), false);
  assert.equal(coversBounds({ x: 0, y: 0, width: 100, height: 100 }, null), false);
});

test('coversBounds: invalid dimensions returns false', () => {
  assert.equal(
    coversBounds(
      { x: 0, y: 0, width: 0, height: 0 },
      { x: 0, y: 0, width: 1920, height: 1040 },
    ),
    false,
  );
});

// ═══════════════════════════════════════════════════════════════════
//  Privacy: no window title/process/URL stored
// ═══════════════════════════════════════════════════════════════════

test('PresentationGuard does not store any window content', () => {
  // The guard source should not reference title/ownerName/url storage
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/main/services/PresentationGuard.js'), 'utf8');
  assert.ok(!src.includes('title'), 'should not reference window title');
  assert.ok(!src.includes('ownerName'), 'should not reference owner name');
  assert.ok(!src.includes('url'), 'should not reference URL');
  assert.ok(!src.includes('processName'), 'should not reference process name');
});
