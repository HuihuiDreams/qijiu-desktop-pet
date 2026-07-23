const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SCENARIO_NAMES,
  getScenarioDefinition,
  applyScenario,
  collectRendererSample,
} = require('../tools/performance/scenarios');

test('exports the fixed deterministic performance scenario names', () => {
  assert.deepEqual(SCENARIO_NAMES, ['idle', 'walking', 'rain', 'wind', 'heat', 'thunderstorm']);
  assert.equal(Object.isFrozen(SCENARIO_NAMES), true);
});

test('returns immutable definitions for each supported scenario and rejects unknown names', () => {
  for (const name of SCENARIO_NAMES) {
    const definition = getScenarioDefinition(name);
    assert.equal(definition.name, name);
    assert.equal(Object.isFrozen(definition), true);
  }

  assert.throws(() => getScenarioDefinition('snow'), /Unknown performance scenario/);
});

test('maps weather scenarios to their fixed weather intensity', () => {
  assert.deepEqual(getScenarioDefinition('idle').weather, { weatherKind: 'unknown', intensity: 'none' });
  assert.deepEqual(getScenarioDefinition('rain').weather, { weatherKind: 'rain', intensity: 'heavy' });
  assert.deepEqual(getScenarioDefinition('wind').weather, {
    weatherKind: 'windy',
    intensity: 'heavy',
    windIntensity: 'heavy',
  });
  assert.deepEqual(getScenarioDefinition('heat').weather, { weatherKind: 'heat', intensity: 'normal' });
  assert.deepEqual(getScenarioDefinition('thunderstorm').weather, { weatherKind: 'thunderstorm', intensity: 'heavy' });
});

test('applyScenario waits for existing debug hooks before evaluating the scenario', async () => {
  const calls = [];
  const page = {
    async waitForFunction(predicate) {
      calls.push({ type: 'wait', predicate: String(predicate) });
    },
    async evaluate(callback, argument) {
      calls.push({ type: 'evaluate', callback: String(callback), argument });
      return { scenario: argument.name, weather: argument.weather, petStates: [], particleCount: 0, domCount: 0 };
    },
  };

  const result = await applyScenario(page, 'rain');

  assert.equal(calls[0].type, 'wait');
  assert.match(calls[0].predicate, /__DEBUG_WEATHER/);
  assert.match(calls[0].predicate, /__DEBUG_PETS/);
  assert.match(calls[0].predicate, /__DEBUG_MOVEMENT/);
  assert.equal(calls[1].type, 'evaluate');
  assert.deepEqual(calls[1].argument, getScenarioDefinition('rain'));
  assert.equal(result.scenario, 'rain');
});

test('applyScenario passes wind intensity and installs the walking controller through its renderer callback', async () => {
  const calls = [];
  const page = {
    async waitForFunction() {},
    async evaluate(callback, argument) {
      calls.push({ callback: String(callback), argument });
      return { scenario: argument.name };
    },
  };

  await applyScenario(page, 'wind');
  assert.deepEqual(calls[0].argument.weather, {
    weatherKind: 'windy',
    intensity: 'heavy',
    windIntensity: 'heavy',
  });
  assert.match(calls[0].callback, /windIntensity/);

  await applyScenario(page, 'walking');
  assert.match(calls[1].callback, /__DESKPET_PERF_SCENARIO_TIMER/);
  assert.match(calls[1].callback, /clearInterval/);
  assert.match(calls[1].callback, /setInterval/);
  assert.match(calls[1].callback, /setState\('walking'\)/);
});

test('collectRendererSample rejects non-finite or non-positive durations before page evaluation', async () => {
  const page = { evaluate() { throw new Error('must not evaluate'); } };

  for (const durationMs of [0, -1, Number.NaN, Infinity, '100']) {
    await assert.rejects(() => collectRendererSample(page, { durationMs }), /durationMs must be a finite positive number/);
  }
});

test('collectRendererSample evaluates an in-renderer requestAnimationFrame sampler', async () => {
  const calls = [];
  const page = {
    async evaluate(callback, argument) {
      calls.push({ callback: String(callback), argument });
      return { frameIntervalsMs: [16], longTaskDurationsMs: [], particleCount: 2, domCount: 5 };
    },
  };

  const result = await collectRendererSample(page, { durationMs: 100 });

  assert.equal(calls[0].argument.durationMs, 100);
  assert.match(calls[0].callback, /requestAnimationFrame/);
  assert.match(calls[0].callback, /PerformanceObserver/);
  assert.doesNotMatch(calls[0].callback, /buffered\s*:/);
  assert.match(calls[0].callback, /takeRecords\(\)/);
  assert.deepEqual(result.frameIntervalsMs, [16]);
});
