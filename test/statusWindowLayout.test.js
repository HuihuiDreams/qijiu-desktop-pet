const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('status window keeps English stat labels separate from progress bars', () => {
  const css = readSource('src/status.css');

  assert.match(css, /\.pet-status-block\s*\{[\s\S]*display:\s*flex/);
  assert.match(css, /\.pet-status-block\s*\{[\s\S]*flex-direction:\s*column/);
  assert.match(
    css,
    /\.status-panel\s+\.stat-row\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(88px,\s*max-content\)\s+minmax\(164px,\s*1fr\)\s+34px/,
    'each status row should reserve a stable label column before the progress bar',
  );
  assert.match(css, /\.status-panel\s+\.stat-row\s*\{[\s\S]*column-gap:\s*10px/);
  assert.match(css, /\.status-panel\s+\.stat-label\s*\{[\s\S]*width:\s*auto/);
  assert.match(css, /\.status-panel\s+\.stat-label\s*\{[\s\S]*min-width:\s*88px/);
  assert.match(css, /\.status-panel\s+\.stat-label\s*\{[\s\S]*white-space:\s*nowrap/);
  assert.doesNotMatch(css, /\.stat-row\s*\{[\s\S]*display:\s*contents/);
  assert.match(css, /\.status-panel\s+\.stat-bar\s*\{[\s\S]*min-width:\s*164px/);
  assert.match(css, /\.status-panel\s+\.stat-bar\s*\{[\s\S]*width:\s*100%/);
  assert.match(css, /\.status-panel\s+\.stat-value\s*\{[\s\S]*width:\s*34px/);
  assert.match(css, /\.status-panel\s+\.stat-value\s*\{[\s\S]*text-align:\s*right/);
});
