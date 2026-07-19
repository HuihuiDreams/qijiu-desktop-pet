const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('update progress window uses local files and IPC instead of string script execution', () => {
  const mainSource = readSource('main.js') + '\n' + readSource('src/main/AppLifecycle.js') + '\n' + readSource('src/main/windows/WindowManager.js') + '\n' + readSource('src/main/windows/StatusWindow.js') + '\n' + readSource('src/main/windows/SkinSelectorWindow.js') + '\n' + readSource('src/main/windows/PomodoroWindow.js') + '\n' + readSource('src/main/windows/CitySettingWindow.js');

  assert.equal(mainSource.includes('executeJavaScript'), false);
  assert.equal(mainSource.includes('data:text/html'), false);
  assert.ok(mainSource.includes("preload: path.join(__dirname, 'updateProgressPreload.js')") || mainSource.includes("preload: path.join(__dirname, '..', '..', 'updateProgressPreload.js')"));
  assert.ok(mainSource.includes("updateProgressWindow.loadFile(path.join(__dirname, 'src', 'update-progress.html'))") || mainSource.includes("updateProgressWindow.loadFile(path.join(__dirname, '..', '..', 'src', 'update-progress.html'))"));
  assert.ok(mainSource.includes("webContents.send('update-progress', payload)"));
});

test('update progress page keeps CSP strict for scripts and styles', () => {
  const htmlSource = readSource('src/update-progress.html');

  assert.match(htmlSource, /script-src 'self'/);
  assert.match(htmlSource, /style-src 'self'/);
  assert.equal(htmlSource.includes('unsafe-inline'), false);
});

test('primary BrowserWindows explicitly enable renderer sandboxing', () => {
  const mainSource = readSource('main.js') + '\n' + readSource('src/main/AppLifecycle.js') + '\n' + readSource('src/main/windows/WindowManager.js') + '\n' + readSource('src/main/windows/StatusWindow.js') + '\n' + readSource('src/main/windows/SkinSelectorWindow.js') + '\n' + readSource('src/main/windows/PomodoroWindow.js') + '\n' + readSource('src/main/windows/CitySettingWindow.js');

  const sandboxMatches = mainSource.match(/sandbox: true/g) || [];
  assert.ok(sandboxMatches.length >= 3);
});
