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

test('active window sampler disposes provider on stop', () => {
  let disposed = false;
  const sampler = createActiveWindowSampler({
    provider: {
      async getActiveWindowInfo() { return { active: false }; },
      dispose() { disposed = true; },
    },
    getWindowBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    getDisplays: () => displays,
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {},
  });

  sampler.start();
  sampler.stop();
  assert.equal(disposed, true);
});

test('buildActiveWindowPayload normalizes physical bounds via screenToDipRect once across mixed DPI displays', () => {
  const mixedDisplays = [
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
  ];
  const virtualBounds = { x: 0, y: 0, width: 3640, height: 1920 };
  const calls = [];

  // 150% primary window: physical {150, 150, 1200, 900} -> DIP {100, 100, 800, 600}
  const primaryPayload = buildActiveWindowPayload(
    activeInfo({ x: 150, y: 150, width: 1200, height: 900 }),
    virtualBounds,
    mixedDisplays,
    {
      screenToDipRect(rect) {
        calls.push(rect);
        return {
          x: Math.round(rect.x / 1.5),
          y: Math.round(rect.y / 1.5),
          width: Math.round(rect.width / 1.5),
          height: Math.round(rect.height / 1.5),
        };
      },
    },
  );
  assert.deepEqual(primaryPayload.window.bounds, { x: 100, y: 100, width: 800, height: 600 });
  assert.deepEqual(primaryPayload.platform, {
    x: 100,
    y: 76,
    width: 800,
    height: 48,
    source: 'active-window-top',
  });
  assert.equal(calls.length, 1);

  // 100% secondary display behind 150% primary: physical x=3940 -> DIP x=2660
  const secondaryPayload = buildActiveWindowPayload(
    activeInfo({ x: 3940, y: 100, width: 600, height: 500 }),
    virtualBounds,
    mixedDisplays,
    {
      screenToDipRect(rect) {
        assert.deepEqual(rect, { x: 3940, y: 100, width: 600, height: 500 });
        return { x: 2660, y: 100, width: 600, height: 500 };
      },
    },
  );
  assert.deepEqual(secondaryPayload.window.bounds, { x: 2660, y: 100, width: 600, height: 500 });
  assert.deepEqual(secondaryPayload.platform, {
    x: 2660,
    y: 76,
    width: 600,
    height: 48,
    source: 'active-window-top',
  });
});

test('createActiveWindowSampler applies screenToDipRect once per sample and degrades safely if conversion throws', async () => {
  let shouldThrow = false;
  let conversionCount = 0;
  const sampler = createActiveWindowSampler({
    provider: {
      async getActiveWindowInfo() {
        return activeInfo({ x: 150, y: 150, width: 1200, height: 900 });
      },
    },
    getWindowBounds: () => ({ x: 0, y: 0, width: 2560, height: 1440 }),
    getDisplays: () => [{
      bounds: { x: 0, y: 0, width: 2560, height: 1440 },
      workArea: { x: 0, y: 0, width: 2560, height: 1392 },
      scaleFactor: 1.5,
    }],
    screenToDipRect: () => {
      conversionCount += 1;
      if (shouldThrow) throw new Error('screen unavailable');
      return { x: 100, y: 100, width: 800, height: 600 };
    },
  });

  const converted = await sampler.sampleOnce();
  assert.equal(conversionCount, 1);
  assert.deepEqual(converted.window.bounds, { x: 100, y: 100, width: 800, height: 600 });
  assert.equal(converted.platform.x, 100);

  shouldThrow = true;
  const fallback = await sampler.sampleOnce();
  assert.deepEqual(fallback.window.bounds, { x: 150, y: 150, width: 1200, height: 900 });
});
