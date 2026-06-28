const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const contextMenuCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'context-menu.css'), 'utf8');

test('context menu uses a high-opacity readable surface', () => {
  assert.match(contextMenuCss, /--menu-surface:\s*rgba\([^;]+0\.96\)/);
  assert.match(contextMenuCss, /background:\s*var\(--menu-surface\)/);
  assert.match(contextMenuCss, /--menu-text:\s*rgba\(/);
});

test('disabled context menu items remain readable without whole-item opacity fading', () => {
  const disabledRule = contextMenuCss.match(/\.menu-item\.disabled\s*\{[^}]+\}/s)?.[0] || '';
  const disabledMarkerRule = contextMenuCss.match(/\.menu-item\.disabled::before\s*\{[^}]+\}/s)?.[0] || '';

  assert.match(disabledRule, /color:\s*var\(--menu-disabled-text\)/);
  assert.match(disabledRule, /background:\s*repeating-linear-gradient\(/);
  assert.match(disabledRule, /var\(--menu-disabled-stripe\)/);
  assert.match(disabledMarkerRule, /background:\s*var\(--menu-disabled-marker\)/);
  assert.doesNotMatch(disabledRule, /opacity:\s*0\.35/);
});

test('menu items include transform transition for active scaling', () => {
  const menuItemRule = contextMenuCss.match(/\.menu-item\s*\{[^}]+\}/s)?.[0] || '';
  assert.match(menuItemRule, /transform\s+0\.1s\s+ease/);
});
