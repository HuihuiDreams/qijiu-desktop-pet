const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createInterruptionCoordinator,
  ALLOWED_HOLDERS,
} = require('../src/main/services/InterruptionCoordinator');

test('InterruptionCoordinator - initial state', () => {
  const coordinator = createInterruptionCoordinator();
  assert.equal(coordinator.getCurrentHolder(), null);
});

test('InterruptionCoordinator - rejects invalid holders', () => {
  const coordinator = createInterruptionCoordinator();
  assert.equal(coordinator.tryAcquire('invalid-holder'), false);
  assert.equal(coordinator.getCurrentHolder(), null);

  assert.equal(coordinator.tryAcquire('screensaver'), true);
  assert.equal(coordinator.release('invalid-holder'), false);
  assert.equal(coordinator.getCurrentHolder(), 'screensaver');
});

test('InterruptionCoordinator - basic acquisition and release', () => {
  const coordinator = createInterruptionCoordinator();

  assert.equal(coordinator.tryAcquire('screensaver'), true);
  assert.equal(coordinator.getCurrentHolder(), 'screensaver');

  assert.equal(coordinator.release('screensaver'), true);
  assert.equal(coordinator.getCurrentHolder(), null);
});

test('InterruptionCoordinator - acquisition idempotency', () => {
  const coordinator = createInterruptionCoordinator();

  assert.equal(coordinator.tryAcquire('screensaver'), true);
  assert.equal(coordinator.tryAcquire('screensaver'), true);
  assert.equal(coordinator.getCurrentHolder(), 'screensaver');
});

test('InterruptionCoordinator - mutual exclusion between break-reminder and screensaver', () => {
  const coordinator = createInterruptionCoordinator();

  // break-reminder acquires lease
  assert.equal(coordinator.tryAcquire('break-reminder'), true);
  assert.equal(coordinator.getCurrentHolder(), 'break-reminder');

  // screensaver tries to acquire and fails
  assert.equal(coordinator.tryAcquire('screensaver'), false);
  assert.equal(coordinator.getCurrentHolder(), 'break-reminder');

  // screensaver cannot release break-reminder's lease
  assert.equal(coordinator.release('screensaver'), false);
  assert.equal(coordinator.getCurrentHolder(), 'break-reminder');

  // break-reminder releases lease
  assert.equal(coordinator.release('break-reminder'), true);
  assert.equal(coordinator.getCurrentHolder(), null);

  // screensaver can now acquire lease
  assert.equal(coordinator.tryAcquire('screensaver'), true);
  assert.equal(coordinator.getCurrentHolder(), 'screensaver');

  // break-reminder cannot acquire lease while screensaver holds it
  assert.equal(coordinator.tryAcquire('break-reminder'), false);
});
