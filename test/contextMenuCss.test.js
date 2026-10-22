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

test('context menu resets popover defaults and eliminates z-index 9999 and touch-action', () => {
  const menuRule = contextMenuCss.match(/\.context-menu\s*\{[^}]+\}/s)?.[0] || '';
  assert.doesNotMatch(menuRule, /z-index:\s*9999/);
  assert.doesNotMatch(menuRule, /touch-action:\s*none/);
  assert.match(menuRule, /inset:\s*auto/);
  assert.match(menuRule, /margin:\s*0/);
});

test('context menu configures discrete transitions with :popover-open and @starting-style', () => {
  const menuRule = contextMenuCss.match(/\.context-menu\s*\{[^}]+\}/s)?.[0] || '';
  assert.match(menuRule, /transition-property:[^;]*opacity[^;]*transform[^;]*display[^;]*overlay/);
  assert.match(menuRule, /transition-behavior:\s*allow-discrete/);

  assert.match(contextMenuCss, /\.context-menu:popover-open\s*\{[^}]*opacity:\s*1/s);
  assert.match(contextMenuCss, /@starting-style\s*\{\s*\.context-menu:popover-open\s*\{[^}]*opacity:\s*0/s);
});

test('button.menu-item has resets, focus-visible outlines, and aria-disabled support', () => {
  assert.match(contextMenuCss, /button\.menu-item/);
  assert.match(contextMenuCss, /button\.menu-item:focus-visible/);

  const ariaDisabledRule = contextMenuCss.match(/\.menu-item\[aria-disabled="true"\]\s*\{[^}]+\}/s)?.[0] || '';
  assert.match(ariaDisabledRule, /color:\s*var\(--menu-disabled-text\)/);
  assert.match(ariaDisabledRule, /background:\s*repeating-linear-gradient\(/);
});

test('context menu includes prefers-reduced-motion media query', () => {
  assert.match(contextMenuCss, /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
});
