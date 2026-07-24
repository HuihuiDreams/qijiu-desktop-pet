const assert = require('node:assert/strict');
const test = require('node:test');

const { shouldClearStartupCache } = require('../src/main/services/StartupCachePolicy');

test('Startup cache policy clears in development and when explicitly requested', () => {
  assert.equal(shouldClearStartupCache({
    isDevelopment: true,
    lastCacheVersion: '1.0.0',
    currentVersion: '1.0.0',
  }), true);
  assert.equal(shouldClearStartupCache({
    forceClear: true,
    lastCacheVersion: '1.0.0',
    currentVersion: '1.0.0',
  }), true);
});

test('Startup cache policy clears on first launch and version upgrades', () => {
  assert.equal(shouldClearStartupCache({
    lastCacheVersion: null,
    currentVersion: '1.0.0',
  }), true);
  assert.equal(shouldClearStartupCache({
    lastCacheVersion: '1.0.0',
    currentVersion: '1.1.0',
  }), true);
});

test('Startup cache policy preserves cache for packaged hot starts', () => {
  assert.equal(shouldClearStartupCache({
    lastCacheVersion: '1.0.0',
    currentVersion: '1.0.0',
  }), false);
});
