const assert = require('node:assert/strict');
const test = require('node:test');

const { getVirtualDisplayBounds } = require('../displayBounds');

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
