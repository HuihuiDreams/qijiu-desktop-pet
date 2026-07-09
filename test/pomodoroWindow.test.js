const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('pomodoro window files exist and use strict local assets', () => {
  const html = readSource('src/pomodoro.html');

  assert.match(html, /pomodoro\.css/);
  assert.match(html, /pomodoroWindow\.js/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /style-src 'self'/);
  assert.equal(html.includes('unsafe-inline'), false);
});

test('pomodoro window exposes the expected UI states and controls', () => {
  const html = readSource('src/pomodoro.html');

  for (const id of [
    'pomodoro-panel',
    'pomodoro-pin',
    'pomodoro-close',
    'pomodoro-setup',
    'pomodoro-running',
    'pomodoro-completed',
    'pomodoro-minutes',
    'pomodoro-start',
    'pomodoro-stop',
    'pomodoro-finish',
    'pomodoro-running-cultivate',
    'pomodoro-complete-kiss',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} should exist`);
  }

  assert.equal(html.includes('id="pomodoro-running-yueqi"'), false);
  assert.equal(html.includes('id="pomodoro-running-shenjiu"'), false);
  assert.equal(html.includes('id="pomodoro-complete-yueqi"'), false);
  assert.equal(html.includes('id="pomodoro-complete-shenjiu"'), false);
  assert.equal(html.includes('<figcaption'), false);
});

test('pomodoro reuses the shared panel design class and tokens', () => {
  const html = readSource('src/pomodoro.html');
  const indexCss = readSource('src/index.css');
  const css = readSource('src/pomodoro.css');

  assert.match(html, /class="[^"]*xianxia-panel[^"]*"/);
  assert.match(indexCss, /\.xianxia-panel/);
  assert.match(indexCss, /var\(--panel-bg\)/);
  assert.match(indexCss, /var\(--panel-border\)/);
  assert.match(indexCss, /var\(--panel-shadow\)/);
  assert.match(css, /\.pomodoro-panel/);
});

test('pomodoro CSS keeps the English title compact in the small window', () => {
  const css = readSource('src/pomodoro.css');

  assert.match(css, /html\[lang="en"\] \.pomodoro-titlebar>span/);
  assert.match(css, /white-space:\s*nowrap/);
  assert.match(css, /text-overflow:\s*ellipsis/);
});

test('pomodoro renderer uses safe DOM APIs for dynamic text and images', () => {
  const source = readSource('src/pomodoroWindow.js');

  assert.equal(source.includes('innerHTML'), false);
  assert.match(source, /textContent/);
  assert.match(source, /setPetImage/);
  assert.match(source, /pet-asset:\/\/skin\/default\/cultivate\.webp/);
  assert.match(source, /pet-asset:\/\/skin\/default\/kiss\.webp/);
});

test('pomodoro pin button updates optimistically while IPC confirms the window level', () => {
  const source = readSource('src/pomodoroWindow.js');

  assert.match(source, /const nextIsAlwaysOnTop = !currentState\.isAlwaysOnTop/);
  assert.match(source, /renderState\(\{ isAlwaysOnTop: nextIsAlwaysOnTop \}\)/);
  assert.match(source, /pinBtn\.disabled = true/);
  assert.match(source, /setPomodoroAlwaysOnTop\(nextIsAlwaysOnTop\)/);
  assert.match(source, /function isIpcFailure\(result\)/);
  assert.match(source, /if \(isIpcFailure\(result\)\)/);
  assert.match(source, /renderState\(\{ isAlwaysOnTop: !nextIsAlwaysOnTop \}\)/);
  assert.match(source, /pinBtn\.disabled = false/);
});
