const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildActiveWindowPayload,
  createActiveWindowSampler,
} = require('../activeWindowAwareness');

function activeInfo(bounds, id = '1') {
  return {
    active: true,
    sampledAt: 1770000000000,
    source: 'active-window',
    window: {
      id,
      title: 'Code',
      ownerName: 'Code',
      bounds,
      isMinimized: false,
      isMaximized: false,
      isFullScreen: false,
    },
  };
}

const displays = [
  {
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  },
];

test('active window payload includes a renderer-relative platform', () => {
  const payload = buildActiveWindowPayload(
    activeInfo({ x: 100, y: 100, width: 800, height: 600 }),
    { x: 0, y: 0, width: 1920, height: 1080 },
    displays,
  );

  assert.equal(payload.active, true);
  assert.deepEqual(payload.platform, {
    x: 100,
    y: 76,
    width: 800,
    height: 48,
    source: 'active-window-top',
  });
});

test('unavailable active window payload carries null platform', () => {
  const payload = buildActiveWindowPayload(
    { active: false, sampledAt: 1770000000000, source: 'unavailable', reason: 'unsupported-platform', window: null },
    { x: 0, y: 0, width: 1920, height: 1080 },
    displays,
  );

  assert.equal(payload.active, false);
  assert.equal(payload.platform, null);
  assert.equal(payload.reason, 'unsupported-platform');
});

test('active window sampler only emits when relevant fields change', async () => {
  const records = [
    activeInfo({ x: 100, y: 100, width: 800, height: 600 }, '1'),
    activeInfo({ x: 100, y: 100, width: 800, height: 600 }, '1'),
    activeInfo({ x: 120, y: 100, width: 800, height: 600 }, '1'),
  ];
  const emitted = [];
  const sampler = createActiveWindowSampler({
    provider: {
      async getActiveWindowInfo() {
        return records.shift();
      },
    },
    getWindowBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    getDisplays: () => displays,
    onChange: (payload) => emitted.push(payload),
  });

  await sampler.sampleOnce();
  await sampler.sampleOnce();
  await sampler.sampleOnce();

  assert.equal(emitted.length, 2);
  assert.equal(emitted[0].platform.x, 100);
  assert.equal(emitted[1].platform.x, 120);
});
