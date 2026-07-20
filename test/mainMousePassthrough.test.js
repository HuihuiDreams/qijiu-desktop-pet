const assert = require('node:assert/strict');
const test = require('node:test');
const { readMainProcessSource } = require('./helpers/sourceCorpus');

const mainSource = readMainProcessSource();

test('mouse passthrough only auto-resets when a positive lease is provided', () => {
  assert.ok(mainSource.includes('if (!ignore && Number.isFinite(leaseMs) && leaseMs > 0)'));
  assert.ok(mainSource.includes('const timeoutMs = leaseMs;'));
});

test('main pet window starts in click-through forwarding mode', () => {
  assert.ok(mainSource.includes('setPetWindowMousePassthrough(true, { forward: true });'));
});
