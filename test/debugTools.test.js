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

test('debug console helpers are gated by the main-process debug flag, not by the file path', () => {
  assert.match(debugSource, /^if \(window\.electronAPI\?\.debugToolsEnabled\) \{/m);
  assert.doesNotMatch(debugSource, /app\.asar/);
  assert.doesNotMatch(debugSource, /location\.pathname/);
});

test('preload derives debugToolsEnabled from the same argument PetWindow passes', () => {
  const root = path.join(__dirname, '..');
  const preloadSource = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const petWindowSource = fs.readFileSync(path.join(root, 'src', 'main', 'windows', 'PetWindow.js'), 'utf8');

  const argument = /const DEBUG_TOOLS_ARGUMENT = '([^']+)'/.exec(petWindowSource)?.[1];
  assert.ok(argument, 'PetWindow must define DEBUG_TOOLS_ARGUMENT');
  assert.ok(
    preloadSource.includes(`debugToolsEnabled: process.argv.includes('${argument}')`),
    'preload.js must check the same argument string (sandboxed preloads cannot import it)',
  );
});

test('app.js keeps mounting the __DEBUG_* data globals that the packaged performance tooling uses', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const performanceScenarios = fs.readFileSync(path.join(__dirname, '..', 'tools', 'performance', 'scenarios.js'), 'utf8');

  for (const name of ['__DEBUG_PETS', '__DEBUG_MOVEMENT', '__DEBUG_WEATHER']) {
    assert.ok(performanceScenarios.includes(`window.${name}`), `performance scenarios use ${name}`);
    assert.match(appSource, new RegExp(`^\\s*window\\.${name} =`, 'm'));
  }
  assert.doesNotMatch(appSource, /debugToolsEnabled/, 'the data globals must not be gated by the console-helper flag');
});
