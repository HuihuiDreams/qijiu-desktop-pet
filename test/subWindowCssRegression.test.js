const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function extractRule(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} rule must exist`);
  // 去掉注释，注释里可以提到被替换掉的变量名
  return css.slice(start, css.indexOf('}', start) + 1).replace(/\/\*[\s\S]*?\*\//g, '');
}

test('pomodoro tooltip uses the body font instead of the calligraphy display font at 11px', () => {
  const css = readSource('src/pomodoro.css');
  const rule = extractRule(css, '.pomodoro-tooltip');

  assert.match(rule, /font-family:\s*var\(--font-body\)/);
  assert.doesNotMatch(rule, /--font-display/);
  assert.match(rule, /font-size:\s*11px/);
});

test('pomodoro page loads index.css so --font-body is defined', () => {
  const html = readSource('src/pomodoro.html');
  assert.match(html, /<link rel="stylesheet" href="index\.css">/);
  assert.match(readSource('src/index.css'), /--font-body:/);
});

test('update progress sweep animates transform instead of layout-affecting left', () => {
  const css = readSource('src/update-progress.css');
  const keyframes = css.slice(css.indexOf('@keyframes sweep'));
  const body = keyframes.slice(0, keyframes.indexOf('\n}\n') + 3);

  assert.match(body, /transform:\s*translateX\(/);
  assert.doesNotMatch(body, /\bleft\s*:/);
  assert.match(extractRule(css, '.checking .fill'), /left:\s*0/);
});

test('update progress checking state keeps the fill width the sweep keyframes were derived from', () => {
  // translateX 的百分比相对填充自身宽度，换算依据是 38%
  assert.match(readSource('src/update-progress.js'), /mode === 'checking' \? '38%'/);
});
