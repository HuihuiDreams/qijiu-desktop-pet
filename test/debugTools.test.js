const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const debugSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'debug.js'), 'utf8');

test('testInteraction defaults to a valid overlay type', () => {
  assert.match(debugSource, /window\.testInteraction = function \(type = 'kiss'\)/);
  assert.match(debugSource, /validOverlayTypes = \['kiss', 'hug', 'cultivate', 'shareFood', 'throwup'\]/);
  assert.match(debugSource, /validOverlayTypes\.includes\(type\)/);
});

test('debug tools expose weather effect console helpers', () => {
  assert.match(debugSource, /window\.testWeatherClear = function/);
  assert.match(debugSource, /window\.testWeatherCloudy = function/);
  assert.match(debugSource, /window\.testWeatherRain = function \(intensity = 'heavy'\)/);
  assert.match(debugSource, /window\.testWeatherSnow = function \(intensity = 'medium'\)/);
  assert.match(debugSource, /window\.testWeatherWindy = function \(windIntensity = 'normal'\)/);
  assert.match(debugSource, /window\.testWeatherThunderstorm = function \(intensity = 'heavy'\)/);
  assert.match(debugSource, /window\.testWeatherRainWind = function/);
  assert.match(debugSource, /window\.clearWeatherEffect = function/);
  assert.match(debugSource, /__DEBUG_WEATHER\.set/);
  assert.match(debugSource, /__DEBUG_WEATHER\.force/);
});
