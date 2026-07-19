const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'AppLifecycle.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'TrayManager.js'), 'utf8');
const i18nSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'i18n.js'), 'utf8');
const debugSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'debug.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

test('tray exposes Window Awareness toggle on Windows/macOS and unavailable state elsewhere', () => {
  assert.ok(mainSource.includes("trayMenuLabel('trayWindowAwarenessOff')"));
  assert.ok(mainSource.includes("trayMenuLabel('trayWindowAwarenessOn')"));
  assert.ok(mainSource.includes("trayMenuLabel('trayWindowAwarenessUnavailable')"));
  assert.ok(mainSource.includes("enabled: process.platform === 'win32' || process.platform === 'darwin'"));
  assert.match(mainSource, /setWindowAwarenessEnabled\(!.*?getWindowAwarenessEnabled\(\)\)/);
});

test('Window Awareness toggle sends disabled fallback and restarts sampling', () => {
  assert.ok(mainSource.includes('function setWindowAwarenessEnabled(enabled)'));
  assert.ok(mainSource.includes("unavailableActiveWindowPayload('disabled')"));
  assert.ok(mainSource.includes('startActiveWindowAwareness();'));
});

test('Window Awareness tray labels are localized', () => {
  assert.ok(i18nSource.includes('trayWindowAwarenessOn'));
  assert.ok(i18nSource.includes('trayWindowAwarenessOff'));
  assert.ok(i18nSource.includes('trayWindowAwarenessUnavailable'));
});

test('debug tools expose current Window Awareness state', () => {
  assert.ok(appSource.includes('windowAwareness: windowAwarenessSystem.getDebugInfo()'));
  assert.ok(debugSource.includes('window.debugWindowAwareness'));
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
