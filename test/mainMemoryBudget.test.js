const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

test('main process applies Chromium memory budget switches before creating windows', () => {
  const mainSource = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src', 'main', 'AppLifecycle.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src', 'main', 'TrayManager.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src', 'main', 'IpcRouter.js'), 'utf8');
  const configureIndex = mainSource.indexOf('configureChromiumMemoryBudget();');
  const createWindowIndex = mainSource.indexOf('function createWindow()');

  assert.ok(configureIndex >= 0);
  assert.ok(createWindowIndex >= 0);
  assert.ok(configureIndex < createWindowIndex);
  assert.ok(mainSource.includes("app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128')"));
  assert.ok(mainSource.includes("app.commandLine.appendSwitch('disable-site-isolation-trials')"));
  assert.ok(mainSource.includes('HardwareMediaKeyHandling,MediaSessionService'));
});
