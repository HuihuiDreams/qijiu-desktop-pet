const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createBreakReminderService,
  normalizeSettings,
  DEFAULT_SETTINGS,
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  MIN_SAMPLE_INTERVAL_MS,
  DEFAULT_SAMPLE_INTERVAL_MS,
} = require('../breakReminderService');

// ═══════════════════════════════════════════════════════════════════
//  Helpers: Fake clock & power monitor
// ═══════════════════════════════════════════════════════════════════

function createFakeClock(startMs = 0) {
  let current = startMs;
  const timers = [];
  const intervals = [];
  let nextId = 1;

  return {
    now: () => current,
    advance(ms) { current += ms; },
    set current(v) { current = v; },
    setTimeout(fn, delay) {
      const id = nextId++;
      timers.push({ id, fn, fireAt: current + delay });
      return id;
    },
    clearTimeout(id) {
      const idx = timers.findIndex(t => t.id === id);
      if (idx >= 0) timers.splice(idx, 1);
    },
    setInterval(fn, interval) {
      const id = nextId++;
      intervals.push({ id, fn, interval, nextFireAt: current + interval });
      return id;
    },
    clearInterval(id) {
      const idx = intervals.findIndex(i => i.id === id);
      if (idx >= 0) intervals.splice(idx, 1);
    },
    tickIntervals() {
      for (const iv of intervals) {
        while (iv.nextFireAt <= current) {
          iv.fn();
          iv.nextFireAt += iv.interval;
        }
      }
    },
    tickTimeouts() {
      const ready = timers.filter(t => t.fireAt <= current);
      for (const t of ready) {
        const idx = timers.indexOf(t);
        if (idx >= 0) timers.splice(idx, 1);
        t.fn();
      }
    },
    get pendingTimeouts() { return timers.length; },
    get pendingIntervals() { return intervals.length; },
  };
}

function createFakePowerMonitor(options = {}) {
  let idleTime = options.idleTime ?? 0;
  let idleState = options.idleState ?? 'active';

  return {
    getSystemIdleTime: () => idleTime,
    getSystemIdleState: () => idleState,
    setIdleTime(s) { idleTime = s; },
    setIdleState(s) { idleState = s; },
  };
}

/**
 * Create a test service. Uses MIN_INTERVAL_MINUTES (5 min = 300s) by default.
 * sampleIntervalMs defaults to 10s (MIN_SAMPLE_INTERVAL_MS).
 */
function createTestService(overrides = {}) {
  const clock = overrides.clock || createFakeClock();
  const pm = overrides.powerMonitor || createFakePowerMonitor();
  const reminders = [];
  const onReminderDue = (payload) => reminders.push(payload);
  const sampleMs = overrides.sampleIntervalMs ?? MIN_SAMPLE_INTERVAL_MS;

  const service = createBreakReminderService({
    powerMonitor: pm,
    onReminderDue,
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    sampleIntervalMs: sampleMs,
    settings: overrides.settings ?? {
      enabled: true,
      intervalMinutes: MIN_INTERVAL_MINUTES,
      idleResetMinutes: 5,
    },
    presentationGuard: overrides.presentationGuard,
  });

  /**
   * Helper: simulate N consecutive active samples.
   * Advances clock by N * sampleMs and fires interval callbacks.
   */
  function simulateActiveSamples(n) {
    pm.setIdleTime(5);
    pm.setIdleState('active');
    for (let i = 0; i < n; i++) {
      clock.advance(sampleMs);
      clock.tickIntervals();
    }
  }

  /**
   * Helper: run enough active samples to trigger exactly one reminder.
   * 5-min interval / 10s sample = 30 samples.
   */
  function runToFirstReminder() {
    const intervalMs = service.getSettings().intervalMinutes * 60 * 1000;
    const samplesNeeded = Math.ceil(intervalMs / sampleMs);
    simulateActiveSamples(samplesNeeded);
  }

  return { service, clock, pm, reminders, simulateActiveSamples, runToFirstReminder, sampleMs };
}

// ═══════════════════════════════════════════════════════════════════
//  normalizeSettings
// ═══════════════════════════════════════════════════════════════════

test('normalizeSettings: returns defaults for null/undefined', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings('garbage'), DEFAULT_SETTINGS);
});

test('normalizeSettings: preserves valid settings', () => {
  const input = { enabled: false, intervalMinutes: 45, idleResetMinutes: 5 };
  assert.deepEqual(normalizeSettings(input), input);
});

test('normalizeSettings: clamps intervalMinutes to valid range', () => {
  assert.equal(normalizeSettings({ intervalMinutes: 2 }).intervalMinutes, DEFAULT_SETTINGS.intervalMinutes);
  assert.equal(normalizeSettings({ intervalMinutes: 999 }).intervalMinutes, DEFAULT_SETTINGS.intervalMinutes);
  assert.equal(normalizeSettings({ intervalMinutes: NaN }).intervalMinutes, DEFAULT_SETTINGS.intervalMinutes);
  assert.equal(normalizeSettings({ intervalMinutes: MIN_INTERVAL_MINUTES }).intervalMinutes, MIN_INTERVAL_MINUTES);
  assert.equal(normalizeSettings({ intervalMinutes: MAX_INTERVAL_MINUTES }).intervalMinutes, MAX_INTERVAL_MINUTES);
});

test('normalizeSettings: fixes invalid idleResetMinutes', () => {
  assert.equal(normalizeSettings({ idleResetMinutes: 0 }).idleResetMinutes, DEFAULT_SETTINGS.idleResetMinutes);
  assert.equal(normalizeSettings({ idleResetMinutes: -1 }).idleResetMinutes, DEFAULT_SETTINGS.idleResetMinutes);
  assert.equal(normalizeSettings({ idleResetMinutes: 3 }).idleResetMinutes, 3);
});

test('normalizeSettings: fills missing fields with defaults', () => {
  const result = normalizeSettings({ enabled: false });
  assert.equal(result.enabled, false);
  assert.equal(result.intervalMinutes, DEFAULT_SETTINGS.intervalMinutes);
  assert.equal(result.idleResetMinutes, DEFAULT_SETTINGS.idleResetMinutes);
});

// ═══════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════

test('default sample interval is 30 seconds', () => {
  assert.equal(DEFAULT_SAMPLE_INTERVAL_MS, 30000);
});

test('minimum sample interval is 10 seconds', () => {
  assert.equal(MIN_SAMPLE_INTERVAL_MS, 10000);
});

test('default settings: enabled=true, interval=60, idleReset=5', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { enabled: true, intervalMinutes: 60, idleResetMinutes: 5 });
});

// ═══════════════════════════════════════════════════════════════════
//  Service: basic lifecycle
// ═══════════════════════════════════════════════════════════════════

test('service starts and stops without error', () => {
  const { service, clock } = createTestService();
  service.start();
  assert.equal(service.getState().running, true);
  assert.equal(clock.pendingIntervals, 1);
  service.stop();
  assert.equal(service.getState().running, false);
  assert.equal(clock.pendingIntervals, 0);
});

test('service.start() is idempotent', () => {
  const { service, clock } = createTestService();
  service.start();
  service.start();
  assert.equal(clock.pendingIntervals, 1);
  service.stop();
});

test('dispose() cleans up', () => {
  const { service, clock } = createTestService();
  service.start();
  service.dispose();
  assert.equal(clock.pendingIntervals, 0);
  assert.equal(service.getState().running, false);
});

// ═══════════════════════════════════════════════════════════════════
//  Service: active accumulation and reminder trigger
// ═══════════════════════════════════════════════════════════════════

test('triggers reminder after continuous active time reaches interval', () => {
  // 5-min interval / 10s sample = 30 samples
  const { service, reminders, runToFirstReminder } = createTestService();
  service.start();
  runToFirstReminder();

  assert.equal(reminders.length, 1, 'should trigger exactly one reminder');
  assert.equal(reminders[0].intervalMinutes, MIN_INTERVAL_MINUTES);
  service.stop();
});

test('repeats reminder if user continues active after dismiss (60/120/180 pattern)', () => {
  const { service, reminders, runToFirstReminder } = createTestService();
  service.start();

  // First interval → reminder #1
  runToFirstReminder();
  assert.equal(reminders.length, 1, 'first reminder');
  service.onDismissed();

  // Next interval → reminder #2
  runToFirstReminder();
  assert.equal(reminders.length, 2, 'second reminder');
  service.onDismissed();

  // Next interval → reminder #3
  runToFirstReminder();
  assert.equal(reminders.length, 3, 'third reminder');
  service.stop();
});

test('does not double-fire while reminder is shown (waiting for dismiss)', () => {
  const { service, reminders, runToFirstReminder, simulateActiveSamples } = createTestService();
  service.start();

  runToFirstReminder();
  assert.equal(reminders.length, 1);

  // Continue sampling without dismiss — no duplicate
  simulateActiveSamples(30);
  assert.equal(reminders.length, 1, 'should not fire again while awaiting dismiss');
  service.stop();
});

test('resets reminder state when delivery is rejected', () => {
  const clock = createFakeClock();
  const pm = createFakePowerMonitor();
  let deliveryAttempts = 0;
  const service = createBreakReminderService({
    powerMonitor: pm,
    onReminderDue: () => {
      deliveryAttempts += 1;
      return false;
    },
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    sampleIntervalMs: MIN_SAMPLE_INTERVAL_MS,
    settings: {
      enabled: true,
      intervalMinutes: MIN_INTERVAL_MINUTES,
      idleResetMinutes: 5,
    },
  });

  service.start();
  pm.setIdleTime(5);
  pm.setIdleState('active');

  for (let i = 0; i < 30; i++) {
    clock.advance(MIN_SAMPLE_INTERVAL_MS);
    clock.tickIntervals();
  }

  assert.equal(deliveryAttempts, 1, 'should attempt delivery once at the interval');
  assert.equal(service.getState().reminderShown, false, 'rejected delivery should not wait for renderer dismiss');
  assert.equal(service.getState().activeMs, 0, 'rejected delivery should restart the interval');
  service.stop();
});

// ═══════════════════════════════════════════════════════════════════
//  Service: idle reset
// ═══════════════════════════════════════════════════════════════════

test('idle state resets active counter', () => {
  const { service, clock, pm, reminders, simulateActiveSamples, sampleMs } = createTestService();
  service.start();

  // Accumulate 200s (20 samples)
  simulateActiveSamples(20);
  assert.equal(service.getState().activeMs, 200000);

  // User goes idle for 5 minutes
  pm.setIdleTime(300);
  pm.setIdleState('idle');
  clock.advance(sampleMs);
  clock.tickIntervals();

  assert.equal(service.getState().activeMs, 0, 'should reset after idle');
  assert.equal(reminders.length, 0, 'no reminder should fire');
  service.stop();
});

test('locked state resets active counter', () => {
  const { service, clock, pm, reminders, simulateActiveSamples, sampleMs } = createTestService();
  service.start();

  simulateActiveSamples(10);

  pm.setIdleState('locked');
  clock.advance(sampleMs);
  clock.tickIntervals();

  assert.equal(service.getState().activeMs, 0);
  assert.equal(reminders.length, 0);
  service.stop();
});

test('unknown state does not accumulate or trigger', () => {
  const { service, clock, pm, reminders, sampleMs } = createTestService();
  pm.setIdleTime(5);
  pm.setIdleState('unknown');
  service.start();

  for (let i = 0; i < 40; i++) {
    clock.advance(sampleMs);
    clock.tickIntervals();
  }

  assert.equal(service.getState().activeMs, 0, 'should not accumulate on unknown');
  assert.equal(reminders.length, 0, 'should not trigger on unknown');
  service.stop();
});

// ═══════════════════════════════════════════════════════════════════
//  Service: lock/unlock/suspend/resume events
// ═══════════════════════════════════════════════════════════════════

test('onLockOrSuspend resets active time', () => {
  const { service, simulateActiveSamples } = createTestService();
  service.start();

  simulateActiveSamples(5);
  assert.ok(service.getState().activeMs > 0);

  service.onLockOrSuspend();
  assert.equal(service.getState().activeMs, 0);
  service.stop();
});

test('onUnlockOrResume resets and fresh starts', () => {
  const { service, clock, pm, reminders, simulateActiveSamples, runToFirstReminder } = createTestService();
  service.start();

  // Accumulate 20 samples (200s)
  simulateActiveSamples(20);

  // Simulate suspend + resume
  service.onLockOrSuspend();
  clock.advance(600000); // 10 min sleep
  service.onUnlockOrResume();

  // Resume active — counter should be fresh
  assert.equal(service.getState().activeMs, 0);

  // Full interval from fresh → trigger
  runToFirstReminder();
  assert.equal(reminders.length, 1, 'should trigger after full interval from resume');
  service.stop();
});

// ═══════════════════════════════════════════════════════════════════
//  Service: disabled state
// ═══════════════════════════════════════════════════════════════════

test('does not accumulate or trigger when disabled', () => {
  const { service, clock, pm, reminders, sampleMs } = createTestService({
    settings: { enabled: false, intervalMinutes: MIN_INTERVAL_MINUTES, idleResetMinutes: 5 },
  });

  pm.setIdleTime(5);
  pm.setIdleState('active');
  service.start();

  for (let i = 0; i < 40; i++) {
    clock.advance(sampleMs);
    clock.tickIntervals();
  }

  assert.equal(reminders.length, 0);
  assert.equal(service.getState().activeMs, 0);
  service.stop();
});

test('updateSettings changes behavior dynamically', () => {
  const { service, reminders, simulateActiveSamples } = createTestService();
  service.start();

  // Accumulate 20 samples (200s out of 300s needed)
  simulateActiveSamples(20);
  assert.equal(reminders.length, 0);

  // Disable reminder
  service.updateSettings({ enabled: false, intervalMinutes: MIN_INTERVAL_MINUTES, idleResetMinutes: 5 });

  // More samples — should not trigger
  simulateActiveSamples(20);
  assert.equal(reminders.length, 0, 'should not trigger while disabled');

  service.stop();
});

// ═══════════════════════════════════════════════════════════════════
//  Service: PresentationGuard deferral
// ═══════════════════════════════════════════════════════════════════

test('defers reminder when PresentationGuard says cannot interrupt', () => {
  const guard = {
    canInterrupt: () => ({ canInterrupt: false, reason: 'fullscreen' }),
  };

  const { service, clock, reminders, runToFirstReminder } = createTestService({
    presentationGuard: guard,
  });

  service.start();
  runToFirstReminder();

  assert.equal(reminders.length, 0, 'should not fire yet (deferred)');
  assert.equal(service.getState().reminderPending, true, 'should be pending');

  // Now allow interrupt
  guard.canInterrupt = () => ({ canInterrupt: true });

  // Advance 60s for defer retry
  clock.advance(60000);
  clock.tickTimeouts();

  assert.equal(reminders.length, 1, 'should fire after guard clears');
  service.stop();
});

test('does not double-send while deferred (no duplicate renderer events)', () => {
  const guard = {
    canInterrupt: () => ({ canInterrupt: false, reason: 'fullscreen' }),
  };

  const { service, clock, reminders, runToFirstReminder, simulateActiveSamples } = createTestService({
    presentationGuard: guard,
  });

  service.start();
  runToFirstReminder();

  assert.equal(reminders.length, 0);
  assert.equal(service.getState().reminderPending, true);

  // Additional samples should not create more deferred timers
  simulateActiveSamples(10);
  assert.equal(reminders.length, 0);

  // Allow and fire
  guard.canInterrupt = () => ({ canInterrupt: true });
  clock.advance(60000);
  clock.tickTimeouts();

  assert.equal(reminders.length, 1, 'exactly one reminder after deferral clears');
  service.stop();
});

// ═══════════════════════════════════════════════════════════════════
//  Service: sample interval enforcement
// ═══════════════════════════════════════════════════════════════════

test('sample interval cannot go below 10 seconds', () => {
  const clock = createFakeClock();
  const pm = createFakePowerMonitor();
  const service = createBreakReminderService({
    powerMonitor: pm,
    onReminderDue: () => {},
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    sampleIntervalMs: 1000, // try 1 second — should be clamped to 10s
  });

  service.start();
  pm.setIdleTime(5);
  pm.setIdleState('active');

  // Advance 5s — should not have sampled yet
  clock.advance(5000);
  clock.tickIntervals();
  assert.equal(service.getState().activeMs, 0, 'should not have sampled at <10s interval');

  // After 10s total, one sample should run
  clock.advance(5000);
  clock.tickIntervals();
  assert.ok(service.getState().activeMs > 0, 'should sample at 10s');
  service.stop();
});

// ═══════════════════════════════════════════════════════════════════
//  Service: default interval is 60 minutes
// ═══════════════════════════════════════════════════════════════════

test('default interval is 60 minutes, default enabled', () => {
  const clock = createFakeClock();
  const pm = createFakePowerMonitor();
  const service = createBreakReminderService({
    powerMonitor: pm,
    onReminderDue: () => {},
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    // No settings override → defaults
  });
  const settings = service.getSettings();
  assert.equal(settings.enabled, true);
  assert.equal(settings.intervalMinutes, 60);
  service.dispose();
});

// ═══════════════════════════════════════════════════════════════════
//  Service: idle time >= idleResetSeconds resets even when state is 'active'
// ═══════════════════════════════════════════════════════════════════

test('high idle time resets even if idleState reports active', () => {
  const { service, clock, pm, sampleMs, simulateActiveSamples } = createTestService();
  service.start();

  simulateActiveSamples(5);
  assert.ok(service.getState().activeMs > 0);

  // Idle time jumps to 300s even though state still says 'active'
  pm.setIdleTime(300);
  clock.advance(sampleMs);
  clock.tickIntervals();

  assert.equal(service.getState().activeMs, 0, 'should reset when idleSeconds >= threshold');
  service.stop();
});
