const assert = require('node:assert/strict');
const test = require('node:test');

const { PomodoroSystem } = require('../src/systems/PomodoroSystem');

test('PomodoroSystem starts a running session from absolute wall time', () => {
  const system = new PomodoroSystem();
  const snapshot = system.start(25, 1000);

  assert.equal(snapshot.status, 'running');
  assert.equal(snapshot.durationMinutes, 25);
  assert.equal(snapshot.durationMs, 25 * 60 * 1000);
  assert.equal(snapshot.startedAt, 1000);
  assert.equal(snapshot.endAt, 1000 + 25 * 60 * 1000);
  assert.equal(snapshot.remainingMs, 25 * 60 * 1000);
  assert.equal(snapshot.progress, 0);
});

test('PomodoroSystem derives remaining time from endAt instead of tick accumulation', () => {
  const system = new PomodoroSystem();
  system.start(10, 5000);

  const snapshot = system.getSnapshot(5000 + 4 * 60 * 1000);

  assert.equal(snapshot.status, 'running');
  assert.equal(snapshot.remainingMs, 6 * 60 * 1000);
  assert.equal(snapshot.progress, 0.4);
});

test('PomodoroSystem completes when wall time reaches endAt', () => {
  const system = new PomodoroSystem();
  system.start(1, 1000);

  const snapshot = system.getSnapshot(1000 + 60 * 1000 + 1);

  assert.equal(snapshot.status, 'completed');
  assert.equal(snapshot.remainingMs, 0);
  assert.equal(snapshot.progress, 1);
  assert.equal(snapshot.completedAt, 1000 + 60 * 1000 + 1);
});

test('PomodoroSystem stop returns to idle and clears session timing', () => {
  const system = new PomodoroSystem();
  system.start(15, 1000);

  const snapshot = system.stop();

  assert.equal(snapshot.status, 'idle');
  assert.equal(snapshot.remainingMs, 0);
  assert.equal(snapshot.durationMs, 0);
  assert.equal(snapshot.endAt, null);
});

test('PomodoroSystem normalizes unsafe durations to the default', () => {
  const system = new PomodoroSystem();
  const snapshot = system.start('not-a-number', 1000);

  assert.equal(snapshot.durationMinutes, 25);
  assert.equal(snapshot.durationMs, 25 * 60 * 1000);
});
