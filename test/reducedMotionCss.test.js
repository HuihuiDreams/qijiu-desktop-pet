const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('city-setting.css provides reduced-motion coverage for panel entrance and pulse search', () => {
  const css = readSource('src/city-setting.css');
  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.city-panel[\s\S]*?animation:\s*none;?[\s\S]*?\}/
  );
  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.city-status--searching[\s\S]*?animation:\s*none;?[\s\S]*?\}/
  );
});

test('pet-scale.css provides reduced-motion coverage for panel entrance', () => {
  const css = readSource('src/pet-scale.css');
  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.scale-panel\s*\{[\s\S]*?animation:\s*none;?[\s\S]*?\}/
  );
});

test('pomodoro.css provides reduced-motion coverage for pomodoro panel entrance without duplicate blocks', () => {
  const css = readSource('src/pomodoro.css');
  const blocks = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)/g) || [];
  assert.equal(blocks.length, 3, 'pomodoro.css should have exactly 3 reduced-motion blocks (dial/panel, stamp ceremony, tooltip)');
  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.pomodoro-panel\s*\{[\s\S]*?animation:\s*none;?[\s\S]*?\.pomodoro-dial-emblem/
  );
});

test('status.css provides reduced-motion coverage for status panel entrance', () => {
  const css = readSource('src/status.css');
  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.status-panel\s*\{[\s\S]*?animation:\s*none;?[\s\S]*?\}/
  );
});

test('index.css preserves pet resident animations under reduced motion (locks intentional decision)', () => {
  const css = readSource('src/index.css');
  assert.doesNotMatch(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.pet-body/
  );
  assert.match(css, /@keyframes walkBounce/);
  assert.match(css, /@keyframes sleepBreath/);
  assert.match(css, /@keyframes workPulse/);
  assert.match(css, /@keyframes interactJoy/);
  assert.match(css, /@keyframes moodFade/);
});
