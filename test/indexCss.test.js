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

test('index.css uses var(--pet-size, 96px) for .pet-body dimensions and font-size', () => {
  const petBodyRule = indexCss.match(/(?:^|\n)\.pet-body\s*\{[^}]+\}/)?.[0] || '';
  assert.match(petBodyRule, /width:\s*var\(--pet-size,\s*96px\);/);
  assert.match(petBodyRule, /height:\s*var\(--pet-size,\s*96px\);/);
  assert.match(petBodyRule, /font-size:\s*calc\(var\(--pet-size,\s*96px\)\s*\/\s*2\);/);
});

test('index.css modernizes alpha color tokens using CSS Relative Color syntax', () => {
  // Jade derived tokens
  assert.match(indexCss, /--color-jade-glow:\s*rgb\(from\s+var\(--color-jade\)\s+r\s+g\s+b\s*\/\s*0\.45\);/);
  assert.match(indexCss, /--color-jade-mist:\s*rgb\(from\s+var\(--color-jade\)\s+r\s+g\s+b\s*\/\s*0\.15\);/);

  // Gold derived tokens
  assert.match(indexCss, /--color-gold-glow:\s*rgb\(from\s+var\(--color-gold\)\s+r\s+g\s+b\s*\/\s*0\.45\);/);

  // Crimson derived tokens
  assert.match(indexCss, /--color-crimson-soft:\s*rgb\(from\s+var\(--color-crimson\)\s+r\s+g\s+b\s*\/\s*0\.2\);/);

  // Ink derived tokens
  assert.match(indexCss, /--color-ink-faint:\s*rgb\(from\s+var\(--color-ink\)\s+r\s+g\s+b\s*\/\s*0\.08\);/);

  // Glow shadow tokens
  assert.match(indexCss, /--shadow-glow-jade:\s*0\s+0\s+12px\s+rgb\(from\s+var\(--color-jade\)\s+r\s+g\s+b\s*\/\s*0\.45\);/);
  assert.match(indexCss, /--shadow-glow-gold:\s*0\s+0\s+12px\s+rgb\(from\s+var\(--color-gold\)\s+r\s+g\s+b\s*\/\s*0\.45\);/);

  // Solid tokens remain untouched
  assert.match(indexCss, /--color-jade-deep:\s*#3d8b6b;/);
  assert.match(indexCss, /--color-shenjiu-light:\s*#b8e4d0;/);
  assert.match(indexCss, /--color-shenjiu-dark:\s*#4a9e7a;/);
  assert.match(indexCss, /--color-ink-light:\s*#546a7b;/);
});


