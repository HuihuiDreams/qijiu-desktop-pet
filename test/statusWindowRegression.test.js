const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('showStatusWindow uses the status window module, not a bare createStatusWindow', () => {
  const appLifecycle = readSource('src/main/AppLifecycle.js');

  // createStatusWindow lives in windows/StatusWindow.js; calling it bare from
  // AppLifecycle throws ReferenceError and the status panel never opens.
  assert.match(appLifecycle, /statusWindowModule\.(openStatusWindow|createStatusWindow)\(\)/);
  assert.equal(
    /[^.]\bcreateStatusWindow\(\)/.test(appLifecycle),
    false,
    'AppLifecycle must not call a bare createStatusWindow()'
  );
});

test('status window keeps its original size and close-event side effects', () => {
  const statusWindow = readSource('src/main/windows/StatusWindow.js');

  // The panel UI needs the original 400x460 bounds; 160x180 clips it.
  assert.match(statusWindow, /width = 400/);
  assert.match(statusWindow, /height = 460/);

  // Closing must notify the main renderer and refresh the tray menu.
  assert.match(statusWindow, /webContents\.send\('status-window-closed'\)/);
  assert.match(statusWindow, /deps\.refreshTrayMenu\(\)/);
});

test('status window module receives the refreshTrayMenu dependency it uses', () => {
  const appLifecycle = readSource('src/main/AppLifecycle.js');

  // The closed handler calls deps.refreshTrayMenu(); if it is not wired in the
  // init() call the close event throws TypeError.
  assert.match(appLifecycle, /statusWindowModule\.init\(\{[\s\S]*?refreshTrayMenu[\s\S]*?\}\)/);
});
