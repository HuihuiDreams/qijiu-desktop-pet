const assert = require('node:assert/strict');
const test = require('node:test');

const {
  isAllowedSkinId,
  normalizeMousePassthroughRequest,
  normalizeStatusWindowSize,
  normalizeWindowMigrationDirection,
} = require('../ipcContracts');

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
