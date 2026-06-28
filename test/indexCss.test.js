const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const indexCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');

test('index.css includes focus-visible styling for .status-close button', () => {
  const statusCloseFocusRule = indexCss.match(/\.status-close:focus-visible\s*\{[^}]+\}/s)?.[0] || '';
  
  assert.match(statusCloseFocusRule, /outline:\s*2px\s+solid/);
  assert.match(statusCloseFocusRule, /outline-offset:\s*2px/);
});


test('xianxia-panel centralizes panel decoration across windows', () => {
  assert.match(indexCss, /\.xianxia-panel\s*\{/);
  assert.match(indexCss, /\.xianxia-panel::before,\s*\.xianxia-panel::after\s*\{/);
  assert.match(indexCss, /\.xianxia-panel::before\s*\{/);
  assert.match(indexCss, /\.xianxia-panel::after\s*\{/);

  const statusCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'status.css'), 'utf8');
  const pomodoroCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'pomodoro.css'), 'utf8');
  const cityCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'city-setting.css'), 'utf8');

  // Ensure individual panel styles no longer define ::before / ::after decorations
  assert.doesNotMatch(statusCss, /\.status-panel::before/);
  assert.doesNotMatch(pomodoroCss, /\.pomodoro-panel::before/);
  assert.doesNotMatch(cityCss, /\.city-panel::before/);
});
