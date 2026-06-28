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
