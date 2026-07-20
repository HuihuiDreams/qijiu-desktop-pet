const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildActiveWindowPayload,
  createActiveWindowSampler,
} = require('../activeWindowAwareness');

function activeInfo(bounds, id = '1', sampledAt = 1770000000000) {
  return {
    active: true,
    sampledAt,
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

test('active window sampler can refresh unchanged payloads before renderer TTL expires', async () => {
  const records = [
    activeInfo({ x: 100, y: 100, width: 800, height: 600 }, '1', 1000),
    activeInfo({ x: 100, y: 100, width: 800, height: 600 }, '1', 5000),
    activeInfo({ x: 100, y: 100, width: 800, height: 600 }, '1', 11000),
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
    refreshUnchangedIntervalMs: 10000,
  });

  await sampler.sampleOnce();
  await sampler.sampleOnce();
  await sampler.sampleOnce();

  assert.equal(emitted.length, 2);
  assert.equal(emitted[0].sampledAt, 1000);
  assert.equal(emitted[1].sampledAt, 11000);
  assert.equal(emitted[1].platform.x, 100);
});

test('active window payload key handles inactive payload', () => {
  const { activeWindowPayloadKey } = require('../activeWindowAwareness');
  const key = activeWindowPayloadKey({ active: false, source: 'test-source', reason: 'test-reason' });
  assert.equal(key, 'inactive:test-source:test-reason');
});

test('active window sampler catches provider errors and emits fallback', async () => {
  const emitted = [];
  const sampler = createActiveWindowSampler({
    provider: {
      async getActiveWindowInfo() {
        throw new Error('Provider failed');
      },
    },
    getWindowBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    getDisplays: () => displays,
    onChange: (payload) => emitted.push(payload),
  });

  await sampler.sampleOnce();
  
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].active, false);
  assert.equal(emitted[0].reason, 'provider-failed');
});

test('active window sampler can start, stop and return last payload', async () => {
  let intervalCb = null;
  let cleared = false;
  
  const sampler = createActiveWindowSampler({
    provider: {
      async getActiveWindowInfo() {
        return activeInfo({ x: 0, y: 0, width: 800, height: 600 });
      },
    },
    getWindowBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    getDisplays: () => displays,
    setIntervalImpl: (cb) => {
      intervalCb = cb;
      return 123;
    },
    clearIntervalImpl: (id) => {
      if (id === 123) cleared = true;
    }
  });

  // initial last payload is fallback
  const initial = sampler.getLastPayload();
  assert.equal(initial.active, false);
  assert.equal(initial.reason, 'not-sampled');

  sampler.start();
  sampler.start(); // second start does nothing
  assert.ok(intervalCb !== null);
  
  // manually trigger interval
  intervalCb();
  
  // stop clears interval
  sampler.stop();
  sampler.stop(); // second stop does nothing
  assert.equal(cleared, true);
});
