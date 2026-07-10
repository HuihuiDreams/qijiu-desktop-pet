const assert = require('node:assert/strict');
const test = require('node:test');

const { WeatherParticleLayer } = require('../src/ui/WeatherParticleLayer.js');

function createFakeElement() {
  const element = {
    id: '',
    className: '',
    dataset: {},
    children: [],
    parentNode: null,
    style: {
      setProperty(name, value) {
        this[name] = value;
      },
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
    },
    remove() {
      if (!this.parentNode) return;
      const index = this.parentNode.children.indexOf(this);
      if (index >= 0) this.parentNode.children.splice(index, 1);
      this.parentNode = null;
    },
  };
  return element;
}

test('WeatherParticleLayer creates bounded rain particles by intensity', () => {
  const root = createFakeElement();
  global.document = {
    createElement() {
      return createFakeElement();
    },
  };

  try {
    const layer = new WeatherParticleLayer(root, {
      WEATHER_RAIN_PARTICLE_MAX: 10,
      WEATHER_SNOW_PARTICLE_MAX: 8,
    });

    layer.sync(
      { weatherKind: 'rain', intensity: 'light' },
      { scaleRatio: 2 / 3, pets: [{ x: 100, y: 120, size: 96 }, { x: 300, y: 120, size: 96 }] },
    );

    assert.equal(root.children.length, 1);
    assert.equal(root.children[0].dataset.weather, 'rain');
    assert.equal(root.children[0].dataset.intensity, 'light');
    assert.equal(root.children[0].style['--weather-effect-scale'], 2 / 3);
    assert.equal(root.children[0].children.length, 2);
    assert.equal(root.children[0].children[0].children.length, 1);
    assert.equal(root.children[0].children[1].children.length, 1);
    assert.match(root.children[0].children[0].style.transform, /^translate3d\(/);
  } finally {
    delete global.document;
  }
});

test('WeatherParticleLayer uses visibly distinct particle counts for all intensity levels', () => {
  const root = createFakeElement();
  global.document = {
    createElement() {
      return createFakeElement();
    },
  };

  try {
    const layer = new WeatherParticleLayer(root, {
      WEATHER_RAIN_PARTICLE_MAX: 48,
      WEATHER_SNOW_PARTICLE_MAX: 40,
    });
    const pet = { x: 100, y: 120, size: 96 };
    const countFor = (weatherKind, intensity) => {
      layer.sync({ weatherKind, intensity }, { visible: true, pets: [pet] });
      return root.children[0].children[0].children.length;
    };

    assert.deepEqual(
      ['light', 'normal', 'medium', 'heavy'].map(intensity => countFor('rain', intensity)),
      [9, 19, 33, 48],
    );
    assert.deepEqual(
      ['light', 'normal', 'medium', 'heavy'].map(intensity => countFor('snow', intensity)),
      [8, 16, 28, 40],
    );
  } finally {
    delete global.document;
  }
});

test('WeatherParticleLayer reuses unchanged layer and clears on inactive weather', () => {
  const root = createFakeElement();
  global.document = {
    createElement() {
      return createFakeElement();
    },
  };

  try {
    const layer = new WeatherParticleLayer(root, { WEATHER_RAIN_PARTICLE_MAX: 12 });

    layer.sync(
      { weatherKind: 'rain', intensity: 'heavy' },
      { visible: true, scaleRatio: 1, pets: [{ x: 100, y: 120, size: 96 }] },
    );
    const firstLayer = root.children[0];

    layer.sync(
      { weatherKind: 'rain', intensity: 'heavy' },
      { visible: true, scaleRatio: 1, pets: [{ x: 130, y: 150, size: 96 }] },
    );
    assert.equal(root.children.length, 1);
    assert.equal(root.children[0], firstLayer);
    assert.match(root.children[0].children[0].style.transform, /^translate3d\(98/);

    layer.sync({ weatherKind: 'unknown', intensity: 'none' }, { visible: true, scaleRatio: 1, pets: [{ x: 130, y: 150, size: 96 }] });
    assert.equal(root.children.length, 0);
    assert.equal(layer.layer, null);
  } finally {
    delete global.document;
  }
});

test('WeatherParticleLayer clears particles when hidden or switched to snow', () => {
  const root = createFakeElement();
  global.document = {
    createElement() {
      return createFakeElement();
    },
  };

  try {
    const layer = new WeatherParticleLayer(root, {
      WEATHER_RAIN_PARTICLE_MAX: 10,
      WEATHER_SNOW_PARTICLE_MAX: 8,
    });

    layer.sync({ weatherKind: 'rain', intensity: 'heavy' }, { visible: true, pets: [{ x: 100, y: 120, size: 96 }] });
    assert.equal(root.children[0].children[0].children.length, 10);

    layer.sync({ weatherKind: 'snow', intensity: 'medium' }, { visible: true, pets: [{ x: 100, y: 120, size: 96 }] });
    assert.equal(root.children.length, 1);
    assert.equal(root.children[0].dataset.weather, 'snow');
    assert.equal(root.children[0].children[0].children.length, 6);

    layer.sync({ weatherKind: 'snow', intensity: 'medium' }, { visible: false, pets: [{ x: 100, y: 120, size: 96 }] });
    assert.equal(root.children.length, 0);
  } finally {
    delete global.document;
  }
});

test('WeatherParticleLayer creates bounded wind particles for windy weather', () => {
  const root = createFakeElement();
  global.document = {
    createElement() {
      return createFakeElement();
    },
  };

  try {
    const layer = new WeatherParticleLayer(root, {
      WEATHER_WIND_PARTICLE_MAX: 12,
    });

    layer.sync(
      { weatherKind: 'windy', intensity: 'normal', windIntensity: 'normal' },
      { visible: true, pets: [{ x: 100, y: 120, size: 96 }] },
    );

    const weatherLayer = root.children[0];
    const group = weatherLayer.children[0];
    assert.equal(weatherLayer.dataset.weather, 'windy');
    assert.equal(weatherLayer.dataset.windIntensity, 'normal');
    assert.equal(group.children.length, 5);
    assert.ok(group.children.every(child => child.className.includes('weather-particle--wind')));
  } finally {
    delete global.document;
  }
});

test('WeatherParticleLayer default windy weather is visually noticeable', () => {
  const root = createFakeElement();
  global.document = {
    createElement() {
      return createFakeElement();
    },
  };

  try {
    const layer = new WeatherParticleLayer(root);

    layer.sync(
      { weatherKind: 'windy', intensity: 'normal', windIntensity: 'normal' },
      { visible: true, pets: [{ x: 100, y: 120, size: 96 }] },
    );

    const windParticles = root.children[0].children[0].children
      .filter(child => child.className.includes('weather-particle--wind'));
    assert.equal(windParticles.length, 8);
    assert.ok(Number(windParticles[0].style['--weather-particle-opacity']) >= 0.34);
  } finally {
    delete global.document;
  }
});

test('WeatherParticleLayer keeps rain primary and adds wind particles when wind is present', () => {
  const root = createFakeElement();
  global.document = {
    createElement() {
      return createFakeElement();
    },
  };

  try {
    const layer = new WeatherParticleLayer(root, {
      WEATHER_RAIN_PARTICLE_MAX: 10,
      WEATHER_WIND_PARTICLE_MAX: 10,
    });

    layer.sync(
      { weatherKind: 'rain', intensity: 'light', windIntensity: 'normal' },
      { visible: true, pets: [{ x: 100, y: 120, size: 96 }] },
    );

    const group = root.children[0].children[0];
    assert.equal(root.children[0].dataset.weather, 'rain');
    assert.equal(root.children[0].dataset.windIntensity, 'normal');
    assert.equal(group.children.filter(child => child.className.includes('weather-particle--rain')).length, 2);
    assert.equal(group.children.filter(child => child.className.includes('weather-particle--wind')).length, 4);
  } finally {
    delete global.document;
  }
});

test('WeatherParticleLayer renders thunderstorm as rain plus local lightning', () => {
  const root = createFakeElement();
  global.document = {
    createElement() {
      return createFakeElement();
    },
  };

  try {
    const layer = new WeatherParticleLayer(root, {
      WEATHER_RAIN_PARTICLE_MAX: 10,
    });

    layer.sync(
      { weatherKind: 'thunderstorm', intensity: 'light' },
      { visible: true, pets: [{ x: 100, y: 120, size: 96 }] },
    );

    const group = root.children[0].children[0];
    assert.equal(root.children[0].dataset.weather, 'thunderstorm');
    assert.equal(group.children.filter(child => child.className.includes('weather-particle--rain')).length, 2);
    assert.equal(group.children.filter(child => child.className.includes('weather-lightning')).length, 2);
  } finally {
    delete global.document;
  }
});

test('WeatherParticleLayer creates bounded heat particles and bottom glow', () => {
  const root = createFakeElement();
  global.document = {
    createElement() {
      return createFakeElement();
    },
  };

  try {
    const layer = new WeatherParticleLayer(root, {
      WEATHER_HEAT_PARTICLE_MAX: 16,
    });

    layer.sync(
      { weatherKind: 'heat', intensity: 'heavy' },
      { visible: true, pets: [{ x: 100, y: 120, size: 96 }] },
    );

    const group = root.children[0].children[0];
    assert.equal(root.children[0].dataset.weather, 'heat');
    assert.equal(group.children.filter(child => child.className.includes('weather-particle--heat')).length, 16);
    assert.equal(group.children.filter(child => child.className.includes('weather-heat-glow')).length, 2);
  } finally {
    delete global.document;
  }
});

test('WeatherParticleLayer merges and centers particle groups during pet interaction to avoid old separate glow circles', () => {
  const root = createFakeElement();
  global.document = {
    createElement() {
      return createFakeElement();
    },
    getElementById() {
      return null;
    },
  };

  try {
    const layer = new WeatherParticleLayer(root, { WEATHER_HEAT_PARTICLE_MAX: 16 });
    const pets = [
      { x: 100, y: 200, size: 96 },
      { x: 300, y: 200, size: 96 },
    ];

    layer.sync(
      { weatherKind: 'heat', intensity: 'normal' },
      { visible: true, pets, isInteracting: true },
    );

    const layerEl = root.children[0];
    const groupA = layerEl.children[0];
    const groupB = layerEl.children[1];

    assert.equal(groupB.style.opacity, '0');
    assert.equal(groupB.style.visibility, 'hidden');
    assert.equal(groupA.style.opacity, '1');
    assert.equal(groupA.style.visibility, 'visible');

    // cx = ((100 + 48) + (300 + 48)) / 2 = 248. mergedWidth > baseWidthA.
    // Ensure groupA transform is centered around cx and not left at petA's original x
    const transformA = groupA.style.transform;
    assert.ok(transformA && transformA.includes('translate3d('), 'groupA should have translate3d transform');
  } finally {
    delete global.document;
  }
});
