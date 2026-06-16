const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createIpcFailure,
  createIpcSuccess,
  isAllowedSkinId,
  normalizeMousePassthroughRequest,
  normalizePomodoroMinutes,
  normalizeStatusWindowSize,
  normalizeWindowMigrationDirection,
} = require('../ipcContracts');

test('createIpcSuccess wraps data in the unified IPC result shape', () => {
  assert.deepEqual(createIpcSuccess({ skinId: 'default' }), {
    success: true,
    data: { skinId: 'default' },
  });
});

test('createIpcFailure wraps errors in the unified IPC result shape', () => {
  assert.deepEqual(createIpcFailure('VALIDATION_ERROR', 'Invalid skin id'), {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid skin id',
    },
  });
});

test('normalizeMousePassthroughRequest rejects non-boolean ignore values', () => {
  assert.equal(normalizeMousePassthroughRequest('true', { forward: true }), null);
  assert.equal(normalizeMousePassthroughRequest(1, { forward: true }), null);
});

test('normalizeMousePassthroughRequest keeps only supported Electron options', () => {
  assert.deepEqual(
    normalizeMousePassthroughRequest(true, {
      forward: true,
      leaseMs: 500,
      unsupported: 'value',
    }),
    {
      ignore: true,
      options: {
        forward: true,
        leaseMs: 500,
      },
    },
  );
});

test('normalizeMousePassthroughRequest clamps long leases', () => {
  assert.deepEqual(
    normalizeMousePassthroughRequest(false, { leaseMs: 120000 }),
    {
      ignore: false,
      options: {
        leaseMs: 30000,
      },
    },
  );
});

test('normalizeWindowMigrationDirection accepts only known directions', () => {
  assert.equal(normalizeWindowMigrationDirection('left'), 'left');
  assert.equal(normalizeWindowMigrationDirection('bottom'), 'bottom');
  assert.equal(normalizeWindowMigrationDirection('../left'), null);
  assert.equal(normalizeWindowMigrationDirection(null), null);
});

test('normalizeStatusWindowSize clamps renderer-provided size', () => {
  assert.deepEqual(normalizeStatusWindowSize({ width: 100, height: 900 }), {
    width: 360,
    height: 720,
  });
  assert.deepEqual(normalizeStatusWindowSize({ width: 480.2, height: 500.1 }), {
    width: 481,
    height: 501,
  });
});

test('isAllowedSkinId accepts only scanned skin IDs', () => {
  assert.equal(isAllowedSkinId('default', ['default', 'birds']), true);
  assert.equal(isAllowedSkinId('missing', ['default', 'birds']), false);
  assert.equal(isAllowedSkinId('../default', ['default', 'birds']), false);
  assert.equal(isAllowedSkinId('default', null), false);
});

test('normalizePomodoroMinutes accepts finite whole-minute input', () => {
  assert.equal(normalizePomodoroMinutes('30'), 30);
  assert.equal(normalizePomodoroMinutes(45.8), 45);
});

test('normalizePomodoroMinutes falls back for unsafe input', () => {
  assert.equal(normalizePomodoroMinutes('abc'), 25);
  assert.equal(normalizePomodoroMinutes(0), 25);
  assert.equal(normalizePomodoroMinutes(-5), 25);
});

test('normalizePomodoroMinutes clamps very long sessions', () => {
  assert.equal(normalizePomodoroMinutes(999), 240);
});
