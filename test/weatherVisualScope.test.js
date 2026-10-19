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
  assert.match(effectsCss, /calc\(170px \* var\(--weather-effect-scale, 1\)\)/);
  assert.match(effectsCss, /calc\(150px \* var\(--weather-effect-scale, 1\)\)/);
  assert.match(effectsCss, /calc\(-165px \* var\(--weather-effect-scale, 1\)\)/);
});

test('heat glow percentage widths inherit the scaled group width without another scale factor', () => {
  for (const selector of ['.weather-heat-glow', '.weather-heat-glow--2']) {
    const rule = effectsCss.slice(effectsCss.indexOf(`${selector} {`)).split('}')[0];
    const width = rule.match(/\bwidth:\s*([^;]+);/)[1];
    assert.match(width, /^\d+(?:\.\d+)?%$/, `${selector} width must scale only through its container`);
  }
});
