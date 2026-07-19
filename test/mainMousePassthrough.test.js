const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'AppLifecycle.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'TrayManager.js'), 'utf8');

test('mouse passthrough only auto-resets when a positive lease is provided', () => {
  assert.ok(mainSource.includes('if (!ignore && Number.isFinite(leaseMs) && leaseMs > 0)'));
  assert.ok(mainSource.includes('const timeoutMs = leaseMs;'));
});

test('main pet window starts in click-through forwarding mode', () => {
  assert.ok(mainSource.includes('setPetWindowMousePassthrough(true, { forward: true });'));
});
