const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getActiveWindowPlatformRelativeToBounds,
} = require('../displayBounds');

const desktopBounds = { x: -1600, y: -120, width: 5120, height: 2280 };
const displays = [
  {
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  },
  {
    bounds: { x: -1600, y: -120, width: 1600, height: 900 },
    workArea: { x: -1600, y: -120, width: 1600, height: 900 },
  },
];

function activeWindow(bounds, flags = {}) {
  return {
    active: true,
    sampledAt: 1770000000000,
    source: 'active-window',
    window: {
      id: '1',
      title: 'Code',
      ownerName: 'Code',
      bounds,
      isMinimized: Boolean(flags.isMinimized),
      isMaximized: Boolean(flags.isMaximized),
      isFullScreen: Boolean(flags.isFullScreen),
    },
  };
}

test('active window platform is converted into pet window coordinates', () => {
  assert.deepEqual(
    getActiveWindowPlatformRelativeToBounds(
      activeWindow({ x: 120, y: 80, width: 1400, height: 900 }),
      desktopBounds,
      displays,
    ),
    { x: 1720, y: 176, width: 1400, height: 48, source: 'active-window-top' },
  );
});

test('active window platform clips to the owning display work area', () => {
  assert.deepEqual(
    getActiveWindowPlatformRelativeToBounds(
      activeWindow({ x: -1500, y: -100, width: 1700, height: 700 }),
      desktopBounds,
      displays,
    ),
    { x: 100, y: 0, width: 1500, height: 44, source: 'active-window-top' },
  );
});

test('maximized or minimized windows do not produce active platforms', () => {
  assert.equal(
    getActiveWindowPlatformRelativeToBounds(
      activeWindow({ x: 0, y: 0, width: 1920, height: 1040 }, { isMaximized: true }),
      desktopBounds,
      displays,
    ),
    null,
  );
  assert.equal(
    getActiveWindowPlatformRelativeToBounds(
      activeWindow({ x: 0, y: 0, width: 1920, height: 1040 }, { isMinimized: true }),
      desktopBounds,
      displays,
    ),
    null,
  );
});

test('invalid or too small active window platforms are ignored', () => {
  assert.equal(getActiveWindowPlatformRelativeToBounds(null, desktopBounds, displays), null);
  assert.equal(
    getActiveWindowPlatformRelativeToBounds(
      activeWindow({ x: 10, y: 10, width: 60, height: 300 }),
      desktopBounds,
      displays,
    ),
    null,
  );
});
