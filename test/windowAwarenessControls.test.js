const assert = require('node:assert/strict');
const test = require('node:test');
const { readMainProcessSource, read } = require('./helpers/sourceCorpus');

const mainSource = readMainProcessSource();
const i18nSource = read('src/data/i18n.js');
const debugSource = read('src/debug.js');
const appSource = read('src/app.js');
const settingsServiceSource = read('src/main/services/SettingsService.js');
const settingsHtmlSource = read('src/settings.html');

test('SettingsService exposes Window Awareness toggle on Windows/macOS and unavailable state elsewhere', () => {
  assert.match(mainSource, /ipc(?:Main)?\.handle\(['"]settings-set-window-awareness['"]/);
  assert.ok(mainSource.includes("process.platform === 'win32' || process.platform === 'darwin'"));
  assert.ok(mainSource.includes('setWindowAwarenessEnabled(enabled)'));
  assert.ok(settingsHtmlSource.includes('id="window-awareness-switch"'));
});

test('Window Awareness toggle sends disabled fallback and restarts sampling', () => {
  assert.ok(mainSource.includes('function setWindowAwarenessEnabled(enabled)'));
  assert.ok(mainSource.includes("unavailableActiveWindowPayload('disabled')"));
  assert.ok(mainSource.includes('startActiveWindowAwareness();'));
});

test('Window Awareness settings labels are localized', () => {
  assert.ok(i18nSource.includes('settingsWindowAwarenessLabel'));
  assert.ok(i18nSource.includes('settingsWindowAwarenessHint'));
  assert.ok(i18nSource.includes('settingsWindowAwarenessUnavailable'));
});

test('CP Screensaver settings threshold uses shared allowlist source without tray submenu', () => {
  assert.ok(settingsServiceSource.includes('SCREENSAVER_ALLOWED_IDLE_MINUTES'));
  assert.ok(settingsServiceSource.includes("require('./screensaverAllowedMinutes')"));
  assert.ok(!settingsServiceSource.includes('[1, 5, 10, 30, 60]'));

  assert.ok(!i18nSource.includes('trayScreensaverPowerHint'));
});

test('debug tools expose current Window Awareness state', () => {
  assert.ok(appSource.includes('windowAwareness: windowAwarenessSystem.getDebugInfo()'));
  assert.ok(debugSource.includes('window.probeWindowAwareness'));
  assert.ok(debugSource.includes('window.explainWindowAwareness'));
  assert.ok(debugSource.includes('__LAST_WINDOW_AWARENESS_EXPLANATION'));
  assert.ok(debugSource.includes('unreachable-platform'));
  assert.ok(debugSource.includes('window.__LAST_WINDOW_AWARENESS_PROBE = result'));
  assert.ok(debugSource.includes('JSON.stringify(result, null, 2)'));
  assert.ok(debugSource.includes('window.testWindowAwareness'));
  assert.ok(debugSource.includes('window.debugTaskbarPlatforms'));
  assert.ok(debugSource.includes('window.testTaskbarAwareness'));
  assert.ok(debugSource.includes('__LAST_TASKBAR_PLATFORM_PROBE'));
  assert.ok(debugSource.includes('__LAST_TASKBAR_AWARENESS_TEST'));
  assert.ok(debugSource.includes("mode: 'unavailable'"));
  assert.equal(debugSource.includes('pet.x = platform.x'), true);
  assert.ok(debugSource.includes('options.reposition === true'));
  assert.ok(appSource.includes('window.__DEBUG_MOVEMENT = movementSystem'));
  assert.ok(appSource.includes('window.__DEBUG_WINDOW_AWARENESS = windowAwarenessSystem'));
  assert.ok(debugSource.includes('__DEBUG_SCREEN'));
});
