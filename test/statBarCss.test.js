const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const statBarCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'stat-bar.css'), 'utf8');
const indexCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');
const statusCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'status.css'), 'utf8');

test('stat-bar.css centralizes shared status bar styling', () => {
  assert.match(statBarCss, /\.stat-bar\s*\{/);
  assert.match(statBarCss, /\.stat-bar-fill\s*\{/);
  assert.match(statBarCss, /\.stat-bar-fill::after\s*\{/);
  assert.match(statBarCss, /\.stat-bar-fill--affection\s*\{/);
  assert.match(statBarCss, /\.stat-bar-fill--hunger\s*\{/);
  assert.match(statBarCss, /\.stat-bar-fill--qi\s*\{/);
  assert.match(statBarCss, /\.stat-bar-fill--mood\s*\{/);
  assert.match(statBarCss, /\.stat-value\s*\{/);
});

test('status.css and index.css do not duplicate .stat-bar container styling', () => {
  assert.doesNotMatch(statusCss, /\.stat-bar\s*\{[^}]*background:/);
  assert.doesNotMatch(indexCss, /\.stat-bar\s*\{[^}]*background:/);
});
