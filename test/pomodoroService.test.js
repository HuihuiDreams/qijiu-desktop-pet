const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const servicePath = path.join(__dirname, '..', 'src', 'main', 'services', 'PomodoroService.js');
const { POMODORO_LAST_MINUTES_KEY } = require('../src/main/constants');

// PomodoroService 是模块级单例（会话与 ticker 都挂在模块作用域），每个用例重新加载一份。
function loadService() {
  delete require.cache[require.resolve(servicePath)];
  return require(servicePath);
}

function createHarness(t, { windowDestroyed = false } = {}) {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1_000_000 });
  const service = loadService();
  const calls = [];
  const sent = [];
  const storeData = new Map();
  service.init({
    StoreManager: {
      initStore: async () => {},
      getStore: () => ({
        get: (key) => storeData.get(key),
        set: (key, value) => storeData.set(key, value),
      }),
    },
    SkinService: {
      getCurrentSkinId: () => 'default',
      resolvePomodoroAsset: (skinId, filename) => `pet-asset://skin/${skinId}/${filename}`,
    },
    PetVisibilityService: {
      enterPomodoroPetFocus: () => calls.push('enterFocus'),
      restorePomodoroPetFocus: () => calls.push('restoreFocus'),
    },
    pomodoroWindowModule: { isPomodoroAlwaysOnTop: () => false },
    trayManager: { refreshTrayMenu: () => calls.push('refreshTray') },
    windowManager: {
      pomodoroWindow: {
        isDestroyed: () => windowDestroyed,
        webContents: {
          send: (channel, snapshot) => sent.push([channel, snapshot.status]),
        },
      },
    },
  });
  t.after(() => service.stopPomodoroTicker());
  return { service, calls, sent, storeData };
}

test('a completed session stops its ticker, restores pet focus and refreshes the tray once', async (t) => {
  const { service, calls, sent, storeData } = createHarness(t);

  const snapshot = await service.startPomodoroSession(1);

  assert.equal(snapshot.status, 'running');
  assert.equal(storeData.get(POMODORO_LAST_MINUTES_KEY), 1);
  assert.deepEqual(calls, ['enterFocus', 'refreshTray']);
  assert.deepEqual(sent, [['pomodoro-state', 'running']]);

  t.mock.timers.tick(59_000);
  assert.equal(sent.length, 60, 'one push on start plus one per second while running');
  assert.ok(sent.every(([, status]) => status === 'running'));
  assert.deepEqual(calls, ['enterFocus', 'refreshTray']);

  t.mock.timers.tick(1_000);
  assert.deepEqual(sent.at(-1), ['pomodoro-state', 'completed']);
  assert.deepEqual(calls, ['enterFocus', 'refreshTray', 'restoreFocus', 'refreshTray']);

  const sentAtCompletion = sent.length;
  t.mock.timers.tick(10_000);
  assert.equal(sent.length, sentAtCompletion, 'the ticker must stop after completion');
  assert.deepEqual(calls, ['enterFocus', 'refreshTray', 'restoreFocus', 'refreshTray']);
});

test('starting again replaces the previous ticker instead of running two', async (t) => {
  const { service, sent } = createHarness(t);

  await service.startPomodoroSession(25);
  await service.startPomodoroSession(25);
  sent.length = 0;

  t.mock.timers.tick(3_000);

  assert.equal(sent.length, 3, 'exactly one push per second');
});

test('stopping a session stops the ticker and restores pet focus', async (t) => {
  const { service, calls, sent } = createHarness(t);

  await service.startPomodoroSession(25);
  calls.length = 0;
  const snapshot = service.stopPomodoroSession();

  assert.equal(snapshot.status, 'idle');
  assert.deepEqual(calls, ['restoreFocus', 'refreshTray']);
  assert.deepEqual(sent.at(-1), ['pomodoro-state', 'idle']);

  const sentAfterStop = sent.length;
  t.mock.timers.tick(5_000);
  assert.equal(sent.length, sentAfterStop);
});

test('out-of-range minutes are normalized before they are stored', async (t) => {
  const { service, storeData } = createHarness(t);

  const snapshot = await service.startPomodoroSession(10_000);

  assert.equal(storeData.get(POMODORO_LAST_MINUTES_KEY), snapshot.durationMinutes);
  assert.ok(snapshot.durationMinutes < 10_000);
});

test('state pushes are skipped while the pomodoro window is destroyed', async (t) => {
  const { service, sent } = createHarness(t, { windowDestroyed: true });

  await service.startPomodoroSession(1);
  t.mock.timers.tick(60_000);

  assert.deepEqual(sent, []);
});

test('a multi-minute session refreshes the tray menu once at each minute boundary and not on intermediate seconds', async (t) => {
  const { service, calls, sent } = createHarness(t);

  await service.startPomodoroSession(3);
  assert.deepEqual(calls, ['enterFocus', 'refreshTray']);

  // Remaining 2m59s..2m1s: intermediate seconds stay at 3m and must not refresh
  t.mock.timers.tick(59_000);
  assert.equal(calls.filter((call) => call === 'refreshTray').length, 1);

  // Remaining drops to 2m0s (ceil drops 3 -> 2)
  t.mock.timers.tick(1_000);
  assert.equal(calls.filter((call) => call === 'refreshTray').length, 2);

  // Remaining 1m59s..1m1s: intermediate seconds stay at 2m and must not refresh
  t.mock.timers.tick(59_000);
  assert.equal(calls.filter((call) => call === 'refreshTray').length, 2);

  // Remaining drops to 1m0s (ceil drops 2 -> 1)
  t.mock.timers.tick(1_000);
  assert.equal(calls.filter((call) => call === 'refreshTray').length, 3);

  // Remaining 59s..1s: intermediate seconds stay at 1m and must not refresh
  t.mock.timers.tick(59_000);
  assert.equal(calls.filter((call) => call === 'refreshTray').length, 3);

  // Completion refreshes once more alongside restoreFocus
  t.mock.timers.tick(1_000);
  assert.deepEqual(sent.at(-1), ['pomodoro-state', 'completed']);
  assert.deepEqual(calls, [
    'enterFocus',
    'refreshTray',
    'refreshTray',
    'refreshTray',
    'restoreFocus',
    'refreshTray',
  ]);
});
