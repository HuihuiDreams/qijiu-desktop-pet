const assert = require('node:assert/strict');
const test = require('node:test');

const { createPresentationGuard, coversBounds } = require("../src/main/services/PresentationGuard");

// ═══════════════════════════════════════════════════════════════════
//  macOS: relies on active window provider (like Windows)
// ═══════════════════════════════════════════════════════════════════

test('macOS: canInterrupt when window is not fullscreen (pmset isPrevented = false)', () => {
  const guard = createPresentationGuard({
    platform: 'darwin',
    getActiveWindowInfo: () => ({
      active: true,
      window: {
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        isFullScreen: false,
        isMaximized: false,
      },
    }),
  });
  const result = guard.canInterrupt();
  assert.equal(result.canInterrupt, true);
  assert.equal(result.reason, null);
});

test('macOS: defers when isFullScreen is true (pmset isPrevented = true)', () => {
  const guard = createPresentationGuard({
    platform: 'darwin',
    getActiveWindowInfo: () => ({
      active: true,
      window: {
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        isFullScreen: true,
        isMaximized: false,
      },
    }),
  });
  const result = guard.canInterrupt();
  assert.equal(result.canInterrupt, false);
  assert.equal(result.reason, 'fullscreen');
});

test('macOS: defers when provider unavailable', () => {
  const guard = createPresentationGuard({
    platform: 'darwin',
    getActiveWindowInfo: null,
  });

  const result = guard.canInterrupt();
  assert.equal(result.canInterrupt, true);
  assert.equal(result.reason, null);
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
//  coversBounds — scaleFactor (DPI conversion)
// ═══════════════════════════════════════════════════════════════════

test('coversBounds: 125% DPI — physical px window covering 1536×864 screen correctly maps to 1920×1080 display DIP', () => {
  // scaleFactor=1.25: physical window 1920×1080 → DIP 1536×864, display DIP also 1536×864
  assert.equal(
    coversBounds(
      { x: 0, y: 0, width: 1920, height: 1080 }, // physical pixels from GetWindowRect
      { x: 0, y: 0, width: 1536, height: 864 },   // display workArea in DIP
      1.25,
    ),
    true,
  );
});

test('coversBounds: 150% DPI — physical px window covering 2880×1800 maps to 1920×1200 DIP display', () => {
  assert.equal(
    coversBounds(
      { x: 0, y: 0, width: 2880, height: 1800 },
      { x: 0, y: 0, width: 1920, height: 1200 },
      1.5,
    ),
    true,
  );
});

test('coversBounds: 150% DPI — small physical-px window must not be misread as full-screen', () => {
  // A 1920×1080 physical window on a 150% DPI display = 1280×720 DIP, which does NOT cover a 1920×1200 DIP display
  assert.equal(
    coversBounds(
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 0, y: 0, width: 1920, height: 1200 },
      1.5,
    ),
    false,
  );
});

test('coversBounds: scaleFactor=1 (100% DPI) behaves identically to no-scaleFactor call', () => {
  const bounds = { x: 0, y: 0, width: 1920, height: 1040 };
  const target = { x: 0, y: 0, width: 1920, height: 1040 };
  assert.equal(coversBounds(bounds, target, 1), coversBounds(bounds, target));
});



test('PresentationGuard does not store any window content', () => {
  // The guard source should not reference title/ownerName/url storage
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/main/services/PresentationGuard.js'), 'utf8');
  assert.ok(!src.includes('title'), 'should not reference window title');
  assert.ok(!src.includes('ownerName'), 'should not reference owner name');
  assert.ok(!src.includes('url'), 'should not reference URL');
  assert.ok(!src.includes('processName'), 'should not reference process name');
});
