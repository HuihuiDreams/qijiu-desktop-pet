const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

test('preload subscriptions are centralized through subscribeIpc cleanup helper', () => {
  assert.ok(preloadSource.includes('function subscribeIpc(channel, listener)'));
  assert.ok(preloadSource.includes('return () => ipcRenderer.removeListener(channel, listener);'));

  const exposedApiSource = preloadSource.slice(preloadSource.indexOf('contextBridge.exposeInMainWorld'));
  assert.equal(
    exposedApiSource.includes('ipcRenderer.on('),
    false,
    'exposed subscription APIs should return subscribeIpc(...) cleanup functions',
  );
});

test('preload on* APIs return cleanup functions from subscribeIpc', () => {
  const expectedChannels = [
    'save-before-quit',
    'screen-info',
    'active-window-info',
    'toggle-status-panel',
    'status-window-data',
    'status-window-closed',
    'pomodoro-state',
    'toggle-pause',
    'reset-positions',
    'toggle-pet-visibility',
    'switch-skin',
    'locale-changed',
    'window-migrated',
    'break-reminder-triggered',
    'system-suspended',
    'system-resumed',
  ];

  for (const channel of expectedChannels) {
    assert.match(
      preloadSource,
      new RegExp(`return subscribeIpc\\('${channel.replaceAll('-', '\\-')}'`),
      `${channel} should be subscribed through subscribeIpc`,
    );
  }
});

test('preload exposes platform info through electronAPI', () => {
  assert.match(
    preloadSource,
    /platform:\s*process\.platform/,
    'preload should expose process.platform through electronAPI'
  );
});

test('preload exposes pomodoro command APIs through electronAPI', () => {
  assert.match(preloadSource, /openPomodoroWindow:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('pomodoro-open-window'\)/);
  assert.match(preloadSource, /getPomodoroState:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('pomodoro-get-state'\)/);
  assert.match(preloadSource, /startPomodoro:\s*\(minutes\)\s*=>\s*ipcRenderer\.invoke\('pomodoro-start', minutes\)/);
  assert.match(preloadSource, /stopPomodoro:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('pomodoro-stop'\)/);
  assert.match(preloadSource, /setPomodoroAlwaysOnTop:\s*\(enabled\)\s*=>\s*ipcRenderer\.invoke\('pomodoro-set-always-on-top', enabled\)/);
});

