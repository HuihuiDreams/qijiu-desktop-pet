const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const effectsCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'effects.css'), 'utf8');

test('weather visuals stay local to pets and do not tint the whole screen', () => {
  assert.doesNotMatch(effectsCss, /body::before/);
  assert.doesNotMatch(effectsCss, /--weather-filter/);
  assert.doesNotMatch(effectsCss, /#pet-stage\s*\{[^}]*filter:/s);
  assert.match(effectsCss, /\.weather-particle-group/);
  assert.match(effectsCss, /weather-interaction-muted/);
  assert.match(effectsCss, /weather-particle--wind/);
  assert.match(effectsCss, /\.weather-particle--wind::before/);
  assert.match(effectsCss, /\.weather-particle--wind::after/);
  assert.match(effectsCss, /weatherWindDrift/);
  assert.match(effectsCss, /weather-lightning/);
  assert.match(effectsCss, /transform:\s*translate3d/);
});
