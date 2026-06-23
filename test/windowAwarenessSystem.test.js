const assert = require('node:assert/strict');
const test = require('node:test');

const { WindowAwarenessSystem } = require('../src/systems/WindowAwarenessSystem');

function activeInfo(sampledAt = 1000) {
  return {
    active: true,
    sampledAt,
    source: 'active-window',
    window: {
      id: '1',
      title: 'Code',
      ownerName: 'Code',
      bounds: { x: 100, y: 100, width: 800, height: 600 },
      isMinimized: false,
      isMaximized: false,
      isFullScreen: false,
    },
    platform: { x: 100, y: 76, width: 800, height: 48, source: 'active-window-top' },
  };
}

test('WindowAwarenessSystem returns the latest active platform before TTL expires', () => {
  const system = new WindowAwarenessSystem(null, { ttlMs: 2500, now: () => 1000 });
  system.setActiveWindowInfo(activeInfo(1000));

  assert.deepEqual(system.getCurrentPlatform(2000), {
    x: 100,
    y: 76,
    width: 800,
    height: 48,
    source: 'active-window-top',
  });
});

test('WindowAwarenessSystem returns null for stale or unavailable data', () => {
  const system = new WindowAwarenessSystem(null, { ttlMs: 2500 });
  system.setActiveWindowInfo(activeInfo(1000));

  assert.equal(system.getCurrentPlatform(4000), null);

  system.setActiveWindowInfo({
    active: false,
    sampledAt: 4000,
    source: 'unavailable',
    reason: 'unsupported-platform',
    window: null,
    platform: null,
  });

  assert.equal(system.getCurrentPlatform(4001), null);
});

test('WindowAwarenessSystem treats disabled fallback as surface awareness off', () => {
  const system = new WindowAwarenessSystem(null, { ttlMs: 2500, now: () => 1000 });

  system.setActiveWindowInfo({
    active: false,
    sampledAt: 1000,
    source: 'unavailable',
    reason: 'disabled',
    window: null,
    platform: null,
  });

  assert.equal(system.isSurfaceAwarenessEnabled(), false);
});

test('WindowAwarenessSystem keeps taskbar surfaces available before first active-window sample', () => {
  const system = new WindowAwarenessSystem(null, { ttlMs: 2500, now: () => 1000 });

  assert.equal(system.isSurfaceAwarenessEnabled(), true);
});

test('WindowAwarenessSystem normalizes invalid platform payloads to null', () => {
  const system = new WindowAwarenessSystem(null, { ttlMs: 2500, now: () => 1234 });

  system.setActiveWindowInfo({
    active: true,
    sampledAt: 'not-a-number',
    platform: { x: 0, y: 0, width: 0, height: 48 },
  });

  assert.equal(system.getDebugInfo().info.sampledAt, 1234);
  assert.equal(system.getCurrentPlatform(1235), null);
});

test('WindowAwarenessSystem start is a no-op when disabled or missing electron API', () => {
  const disabled = new WindowAwarenessSystem({
    onActiveWindowInfo() {
      throw new Error('should not subscribe while disabled');
    },
  }, { enabled: false });
  const missingApi = new WindowAwarenessSystem(null);

  assert.doesNotThrow(() => disabled.start());
  assert.doesNotThrow(() => missingApi.start());
});

test('WindowAwarenessSystem records unavailable info when initial request fails', async () => {
  const system = new WindowAwarenessSystem({
    async getActiveWindowInfo() {
      throw new Error('boom');
    },
  }, { ttlMs: 2500, now: () => 5000 });

  system.start();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(system.getDebugInfo().info.active, false);
  assert.equal(system.getDebugInfo().info.reason, 'request-failed');
  assert.equal(system.getDebugInfo().info.sampledAt, 5000);
});

test('WindowAwarenessSystem setEnabled clears state and restarts subscriptions', () => {
  let subscribeCount = 0;
  let unsubscribeCount = 0;
  const system = new WindowAwarenessSystem({
    onActiveWindowInfo() {
      subscribeCount += 1;
      return () => {
        unsubscribeCount += 1;
      };
    },
  }, { ttlMs: 2500, now: () => 1000 });

  system.setActiveWindowInfo(activeInfo(1000));
  system.setEnabled(false);

  assert.equal(system.getDebugInfo().info, null);
  assert.equal(unsubscribeCount, 0);

  system.setEnabled(true);
  assert.equal(subscribeCount, 1);
  system.stop();
  assert.equal(unsubscribeCount, 1);
});

test('WindowAwarenessSystem subscribes to push updates and requests an initial value', async () => {
  let listener = null;
  let removed = false;
  const system = new WindowAwarenessSystem({
    onActiveWindowInfo(callback) {
      listener = callback;
      return () => {
        removed = true;
      };
    },
    async getActiveWindowInfo() {
      return activeInfo(1000);
    },
  }, { ttlMs: 2500, now: () => 1000 });

  system.start();
  await Promise.resolve();
  assert.equal(system.getCurrentPlatform(1001).x, 100);

  listener(activeInfo(2000));
  assert.equal(system.getCurrentPlatform(2001).y, 76);

  system.stop();
  assert.equal(removed, true);
});
