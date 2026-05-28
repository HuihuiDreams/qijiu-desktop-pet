const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
const configSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'config.js'), 'utf8');

test('index.html loads WindowAwarenessSystem before app.js', () => {
  const systemIndex = indexSource.indexOf('systems/WindowAwarenessSystem.js');
  const appIndex = indexSource.indexOf('app.js');

  assert.equal(systemIndex > -1, true);
  assert.equal(systemIndex < appIndex, true);
});

test('app.js wires WindowAwarenessSystem into MovementSystem without IPC in movement updates', () => {
  assert.ok(appSource.includes('new WindowAwarenessSystem(window.electronAPI'));
  assert.ok(appSource.includes('windowAwarenessSystem.start()'));
  assert.ok(appSource.includes('taskbarPlatforms: Array.isArray(info.taskbarPlatforms) ? info.taskbarPlatforms : []'));
  assert.ok(appSource.includes('if (!windowAwarenessSystem.isSurfaceAwarenessEnabled()) return []'));
  assert.ok(appSource.includes('movementSystem.setSurfacePlatforms(getSurfacePlatforms(Date.now()))'));
});

test('config exposes window awareness defaults', () => {
  assert.ok(configSource.includes('WINDOW_AWARENESS_ENABLED: true'));
  assert.ok(configSource.includes('WINDOW_AWARENESS_PLATFORM_TTL_MS: 2500'));
  assert.ok(configSource.includes('TASKBAR_PLATFORM_WEIGHT: 120'));
});
