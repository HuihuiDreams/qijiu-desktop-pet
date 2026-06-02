const assert = require('node:assert/strict');
const test = require('node:test');

const {
  findAdjacentDisplay,
  getTaskbarPlatformsRelativeToBounds,
  getVirtualDisplayBounds,
  getWalkAreasRelativeToBounds,
  intersectRects,
} = require('../displayBounds');

test('virtual display bounds include a secondary display to the right', () => {
  assert.deepEqual(
    getVirtualDisplayBounds([
      { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
      { bounds: { x: 1920, y: 0, width: 1280, height: 1024 } },
    ]),
    { x: 0, y: 0, width: 3200, height: 1080 },
  );
});

test('virtual display bounds include a secondary display with negative coordinates', () => {
  assert.deepEqual(
    getVirtualDisplayBounds([
      { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
      { bounds: { x: -1600, y: -120, width: 1600, height: 900 } },
    ]),
    { x: -1600, y: -120, width: 3520, height: 1200 },
  );
});

test('virtual display bounds ignore malformed display records', () => {
  assert.deepEqual(
    getVirtualDisplayBounds([
      null,
      { bounds: { x: 100, y: 50, width: 800, height: 600 } },
      { bounds: { x: 0, y: 0, width: 0, height: 600 } },
    ]),
    { x: 100, y: 50, width: 800, height: 600 },
  );
});

test('intersectRects returns the overlapping rectangle', () => {
  assert.deepEqual(
    intersectRects(
      { x: 100, y: 50, width: 300, height: 200 },
      { x: 0, y: 0, width: 250, height: 120 },
    ),
    { x: 100, y: 50, width: 150, height: 70 },
  );
});

test('walk areas are relative to the pet window and clipped to display bounds', () => {
  assert.deepEqual(
    getWalkAreasRelativeToBounds(
      [
        {
          bounds: { x: 0, y: 0, width: 2560, height: 1440 },
          workArea: { x: 0, y: 0, width: 2560, height: 1392 },
        },
        {
          bounds: { x: 2560, y: 0, width: 1080, height: 1920 },
          workArea: { x: 2560, y: 0, width: 1300, height: 1920 },
        },
      ],
      { x: 0, y: 0, width: 3640, height: 1920 },
    ),
    [
      { x: 0, y: 0, width: 2560, height: 1392, scaleRatio: 1 },
      { x: 2560, y: 0, width: 1080, height: 1920, scaleRatio: 1 },
    ],
  );
});

test('walk areas handle negative virtual desktop coordinates', () => {
  assert.deepEqual(
    getWalkAreasRelativeToBounds(
      [
        {
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        },
        {
          bounds: { x: -1600, y: -120, width: 1600, height: 900 },
          workArea: { x: -1600, y: -120, width: 1600, height: 900 },
        },
      ],
      { x: -1600, y: -120, width: 3520, height: 1160 },
    ),
    [
      { x: 1600, y: 120, width: 1920, height: 1040, scaleRatio: 1 },
      { x: 0, y: 0, width: 1600, height: 900, scaleRatio: 1 },
    ],
  );
});

test('walk areas scale secondary display sizes into renderer coordinates', () => {
  assert.deepEqual(
    getWalkAreasRelativeToBounds(
      [
        {
          bounds: { x: 0, y: 0, width: 2560, height: 1440 },
          workArea: { x: 0, y: 0, width: 2560, height: 1392 },
          scaleFactor: 1.5,
        },
        {
          bounds: { x: 2560, y: 0, width: 1080, height: 1920 },
          workArea: { x: 2560, y: 0, width: 1080, height: 1872 },
          scaleFactor: 1,
        },
      ],
      { x: 0, y: 0, width: 3640, height: 1920 },
      1.5,
    ),
    [
      { x: 0, y: 0, width: 2560, height: 1392, scaleRatio: 1 },
      { x: 2560, y: 0, width: 720, height: 1248, scaleRatio: 2 / 3 },
    ],
  );
});

test('walk areas mark the primary display when primaryDisplayId is provided', () => {
  assert.deepEqual(
    getWalkAreasRelativeToBounds(
      [
        {
          id: 1,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        },
        {
          id: 2,
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        },
      ],
      { x: 0, y: 0, width: 4480, height: 1440 },
      1,
      { primaryDisplayId: 1 },
    ),
    [
      { x: 0, y: 0, width: 1920, height: 1040, scaleRatio: 1, isPrimary: true },
      { x: 1920, y: 0, width: 2560, height: 1400, scaleRatio: 1 },
    ],
  );
});

test('taskbar platforms are derived from bottom horizontal taskbars', () => {
  assert.deepEqual(
    getTaskbarPlatformsRelativeToBounds(
      [
        {
          id: 1,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        },
      ],
      { x: 0, y: 0, width: 1920, height: 1080 },
    ),
    [
      {
        x: 0,
        y: 1016,
        width: 1920,
        height: 48,
        scaleRatio: 1,
        source: 'taskbar-edge',
        displayId: 1,
      },
    ],
  );
});

test('taskbar platforms handle negative coordinates and display scaling', () => {
  assert.deepEqual(
    getTaskbarPlatformsRelativeToBounds(
      [
        {
          id: 2,
          bounds: { x: -1600, y: -120, width: 1600, height: 900 },
          workArea: { x: -1600, y: -120, width: 1600, height: 860 },
          scaleFactor: 1,
        },
      ],
      { x: -1600, y: -120, width: 3520, height: 1200 },
      2,
    ),
    [
      {
        x: 0,
        y: 406,
        width: 800,
        height: 48,
        scaleRatio: 0.5,
        source: 'taskbar-edge',
        displayId: 2,
      },
    ],
  );
});

test('taskbar platforms ignore vertical or hidden taskbars', () => {
  assert.deepEqual(
    getTaskbarPlatformsRelativeToBounds(
      [
        {
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 48, y: 0, width: 1872, height: 1080 },
        },
        {
          bounds: { x: 1920, y: 0, width: 1280, height: 720 },
          workArea: { x: 1920, y: 0, width: 1280, height: 718 },
        },
      ],
      { x: 0, y: 0, width: 3200, height: 1080 },
    ),
    [],
  );
});

test('findAdjacentDisplay finds displays on each overlapping side', () => {
  const current = { id: 'main', bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
  const left = { id: 'left', bounds: { x: -1280, y: 120, width: 1280, height: 720 } };
  const right = { id: 'right', bounds: { x: 1920, y: 0, width: 1440, height: 900 } };
  const top = { id: 'top', bounds: { x: 200, y: -900, width: 1200, height: 900 } };
  const bottom = { id: 'bottom', bounds: { x: 100, y: 1080, width: 1600, height: 900 } };
  const displays = [current, left, right, top, bottom];

  assert.equal(findAdjacentDisplay(current, 'left', displays), left);
  assert.equal(findAdjacentDisplay(current, 'right', displays), right);
  assert.equal(findAdjacentDisplay(current, 'top', displays), top);
  assert.equal(findAdjacentDisplay(current, 'bottom', displays), bottom);
});

test('findAdjacentDisplay ignores displays without perpendicular overlap', () => {
  const current = { id: 'main', bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
  const diagonalRight = { id: 'diagonal-right', bounds: { x: 1920, y: 1200, width: 1440, height: 900 } };

  assert.equal(findAdjacentDisplay(current, 'right', [current, diagonalRight]), null);
});

test('findAdjacentDisplay chooses the nearest matching display', () => {
  const current = { id: 'main', bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
  const farRight = { id: 'far-right', bounds: { x: 3000, y: 0, width: 1440, height: 900 } };
  const nearRight = { id: 'near-right', bounds: { x: 1920, y: 100, width: 1280, height: 720 } };

  assert.equal(findAdjacentDisplay(current, 'right', [current, farRight, nearRight]), nearRight);
});
