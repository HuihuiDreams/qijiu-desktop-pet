'use strict';

const SCENARIO_NAMES = Object.freeze([
  'idle',
  'walking',
  'rain',
  'wind',
  'heat',
  'thunderstorm',
]);

const SCENARIO_DEFINITIONS = Object.freeze({
  idle: Object.freeze({
    name: 'idle',
    weather: Object.freeze({ weatherKind: 'unknown', intensity: 'none' }),
    petMode: 'idle',
  }),
  walking: Object.freeze({
    name: 'walking',
    weather: Object.freeze({ weatherKind: 'unknown', intensity: 'none' }),
    petMode: 'walking',
  }),
  rain: Object.freeze({
    name: 'rain',
    weather: Object.freeze({ weatherKind: 'rain', intensity: 'heavy' }),
    petMode: 'idle',
  }),
  wind: Object.freeze({
    name: 'wind',
    weather: Object.freeze({ weatherKind: 'windy', intensity: 'heavy', windIntensity: 'heavy' }),
    petMode: 'idle',
  }),
  heat: Object.freeze({
    name: 'heat',
    weather: Object.freeze({ weatherKind: 'heat', intensity: 'normal' }),
    petMode: 'idle',
  }),
  thunderstorm: Object.freeze({
    name: 'thunderstorm',
    weather: Object.freeze({ weatherKind: 'thunderstorm', intensity: 'heavy' }),
    petMode: 'idle',
  }),
});

function getScenarioDefinition(name) {
  const definition = SCENARIO_DEFINITIONS[name];
  if (!definition) {
    throw new Error(`Unknown performance scenario: ${name}`);
  }
  return definition;
}

async function applyScenario(page, name) {
  const definition = getScenarioDefinition(name);
  await page.waitForFunction(() => Boolean(
    window.__DEBUG_WEATHER
    && window.__DEBUG_PETS
    && window.__DEBUG_MOVEMENT
  ));

  return page.evaluate((scenario) => {
    const weatherDebug = window.__DEBUG_WEATHER;
    const pets = Object.entries(window.__DEBUG_PETS);
    const movement = window.__DEBUG_MOVEMENT;
    let weather;

    if (window.__DESKPET_PERF_SCENARIO_TIMER) {
      clearInterval(window.__DESKPET_PERF_SCENARIO_TIMER);
      delete window.__DESKPET_PERF_SCENARIO_TIMER;
    }

    if (scenario.weather.intensity === 'none') {
      weather = typeof weatherDebug.clear === 'function'
        ? weatherDebug.clear()
        : weatherDebug.force('unknown', { intensity: 'none' });
    } else {
      weather = weatherDebug.force(scenario.weather.weatherKind, {
        intensity: scenario.weather.intensity,
        windIntensity: scenario.weather.windIntensity,
      });
    }

    const walkAreas = Array.isArray(movement.walkAreas) && movement.walkAreas.length > 0
      ? movement.walkAreas
      : (typeof movement.getWalkAreas === 'function' ? movement.getWalkAreas() : []);
    const walkArea = walkAreas[0] || {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const setWalkingTarget = (pet) => {
      const petSize = Number.isFinite(pet.size) ? pet.size : 0;
      const left = walkArea.x + petSize;
      const right = walkArea.x + Math.max(petSize, walkArea.width - petSize);
      const targetX = Math.abs(right - pet.x) >= Math.abs(left - pet.x) ? right : left;
      pet.targetArea = walkArea;
      pet.targetX = targetX;
      pet.targetY = walkArea.y + Math.max(0, walkArea.height - petSize);
      pet.direction = targetX >= pet.x ? 'right' : 'left';
      pet.setState('walking');
    };

    const petStates = pets.map(([id, pet]) => {
      pet.isDragging = false;
      if (scenario.petMode === 'walking') {
        setWalkingTarget(pet);
      } else {
        pet.setState('idle');
        pet.idleTimer = 60 * 60 * 1000;
      }
      return {
        id,
        state: pet.state,
        direction: pet.direction,
        targetX: pet.targetX,
        targetY: pet.targetY,
      };
    });

    if (scenario.petMode === 'walking') {
      window.__DESKPET_PERF_SCENARIO_TIMER = setInterval(() => {
        pets.forEach(([, pet]) => {
          const arrived = Math.abs((pet.targetX || 0) - pet.x) <= 12;
          if (arrived || pet.state !== 'walking') setWalkingTarget(pet);
        });
      }, 250);
    }

    return {
      scenario: scenario.name,
      weather,
      petStates,
      particleCount: document.querySelectorAll('.weather-particle').length,
      domCount: document.querySelectorAll('*').length,
      controllerActive: Boolean(window.__DESKPET_PERF_SCENARIO_TIMER),
    };
  }, definition);
}

async function collectRendererSample(page, options = {}) {
  const { durationMs } = options;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new TypeError('durationMs must be a finite positive number');
  }

  return page.evaluate(async ({ durationMs: sampleDurationMs }) => {
    const frameIntervalsMs = [];
    const longTaskDurationsMs = [];
    let observer = null;
    const pushEntries = (entries) => {
      for (const entry of entries) {
        if (Number.isFinite(entry.duration)) longTaskDurationsMs.push(entry.duration);
      }
    };

    try {
      observer = new PerformanceObserver((list) => {
        pushEntries(list.getEntries());
      });
      observer.observe({ type: 'longtask' });
    } catch (_) {
      observer = null;
    }

    await new Promise((resolve) => {
      const startedAt = performance.now();
      let previousFrameAt = null;
      const sampleFrame = (now) => {
        if (previousFrameAt !== null) frameIntervalsMs.push(now - previousFrameAt);
        previousFrameAt = now;
        if (now - startedAt >= sampleDurationMs) {
          resolve();
          return;
        }
        requestAnimationFrame(sampleFrame);
      };
      requestAnimationFrame(sampleFrame);
    });

    if (observer) {
      pushEntries(observer.takeRecords());
      observer.disconnect();
    }

    return {
      frameIntervalsMs,
      longTaskDurationsMs,
      particleCount: document.querySelectorAll('.weather-particle').length,
      domCount: document.querySelectorAll('*').length,
      window: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
      },
      screen: {
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth,
      },
      devicePixelRatio: window.devicePixelRatio,
    };
  }, { durationMs });
}

module.exports = {
  SCENARIO_NAMES,
  getScenarioDefinition,
  applyScenario,
  collectRendererSample,
};
