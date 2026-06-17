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
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} should exist`);
  }
});

test('pomodoro CSS reuses the status window visual system', () => {
  const css = readSource('src/pomodoro.css');

  assert.match(css, /\.pomodoro-panel/);
  assert.match(css, /--font-display/);
  assert.match(css, /--color-jade/);
  assert.match(css, /rgba\(61,\s*139,\s*107,\s*0\.3\)/);
  assert.match(css, /border-radius:\s*14px/);
  assert.match(css, /0 12px 30px rgba\(30,\s*42,\s*54,\s*0\.16\)/);
});

test('pomodoro renderer uses safe DOM APIs for dynamic text and images', () => {
  const source = readSource('src/pomodoroWindow.js');

  assert.equal(source.includes('innerHTML'), false);
  assert.match(source, /textContent/);
  assert.match(source, /setPetImage/);
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
