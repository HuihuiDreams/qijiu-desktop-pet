const assert = require('node:assert/strict');
const test = require('node:test');

const { StageGeometry } = require('../src/systems/StageGeometry');

// StageGeometry 是纯几何状态持有者：不依赖 window/document 之外的任何浏览器 API，
// 因此可以直接以 Node 单测覆盖其核心查询逻辑。

function makeMovementSystemStub(walkAreas) {
  const calls = { setScreenSize: [], clampPetToWalkAreas: [] };
  return {
    calls,
    getWalkAreas: () => walkAreas,
    setScreenSize: (w, h, areas) => calls.setScreenSize.push([w, h, areas]),
    clampPetToWalkAreas: (pet) => calls.clampPetToWalkAreas.push(pet),
  };
}

test('constructor seeds screenInfo from initialWidth/initialHeight with empty walk areas', () => {
  const geometry = new StageGeometry({ initialWidth: 1920, initialHeight: 1080 });
  assert.equal(geometry.width, 1920);
  assert.equal(geometry.height, 1080);
  assert.deepEqual(geometry.screenInfo.walkAreas, []);
  assert.deepEqual(geometry.screenInfo.taskbarPlatforms, []);
  assert.equal(geometry.screenInfo.adjacentDisplays, null);
});

test('applyScreenInfo normalizes non-array walkAreas/taskbarPlatforms/displays to []', () => {
  const geometry = new StageGeometry({});
  geometry.applyScreenInfo({ width: 800, height: 600 });

  assert.equal(geometry.width, 800);
  assert.equal(geometry.height, 600);
  assert.deepEqual(geometry.screenInfo.walkAreas, []);
  assert.deepEqual(geometry.screenInfo.taskbarPlatforms, []);
  assert.deepEqual(geometry.screenInfo.displays, []);
  assert.equal(geometry.screenInfo.adjacentDisplays, null);
});

test('applyScreenInfo forwards new size to MovementSystem and clamps every tracked pet', () => {
  const movementSystem = makeMovementSystemStub([]);
  const pets = [{ id: 'a' }, { id: 'b' }];
  const geometry = new StageGeometry({
    getMovementSystem: () => movementSystem,
    getPets: () => pets,
  });

  const walkAreas = [{ x: 0, y: 0, width: 100, height: 100 }];
  geometry.applyScreenInfo({ width: 1024, height: 768, walkAreas });

  assert.deepEqual(movementSystem.calls.setScreenSize, [[1024, 768, walkAreas]]);
  assert.deepEqual(movementSystem.calls.clampPetToWalkAreas, pets);
});

test('getWalkAreaForPoint finds the walk area containing a point, using MovementSystem when available', () => {
  const walkAreas = [
    { x: 0, y: 0, width: 100, height: 100, scaleRatio: 1 },
    { x: 100, y: 0, width: 100, height: 100, scaleRatio: 2 },
  ];
  const movementSystem = makeMovementSystemStub(walkAreas);
  const geometry = new StageGeometry({ getMovementSystem: () => movementSystem });

  assert.deepEqual(geometry.getWalkAreaForPoint(50, 50), walkAreas[0]);
  assert.deepEqual(geometry.getWalkAreaForPoint(150, 50), walkAreas[1]);
  assert.equal(geometry.getWalkAreaForPoint(500, 500), undefined);
});

test('getWalkAreas prefers MovementSystem output and falls back to raw screenInfo.walkAreas', () => {
  const msAreas = [{ x: 0, y: 0, width: 10, height: 10 }];
  const movementSystem = makeMovementSystemStub(msAreas);
  const geometryWithMovement = new StageGeometry({ getMovementSystem: () => movementSystem });
  assert.equal(geometryWithMovement.getWalkAreas(), msAreas);

  const geometryNoMovement = new StageGeometry({});
  geometryNoMovement.applyScreenInfo({ width: 800, height: 600, walkAreas: [{ x: 1, y: 1, width: 2, height: 2 }] });
  assert.deepEqual(geometryNoMovement.getWalkAreas(), [{ x: 1, y: 1, width: 2, height: 2 }]);
});

test('getWalkAreaForPoint falls back to raw screenInfo.walkAreas without a MovementSystem', () => {
  const geometry = new StageGeometry({});
  geometry.applyScreenInfo({
    width: 800,
    height: 600,
    walkAreas: [{ x: 0, y: 0, width: 800, height: 600, scaleRatio: 1 }],
  });

  const area = geometry.getWalkAreaForPoint(10, 10);
  assert.equal(area.width, 800);
});

test('getVisualScaleForPoint/ForPet return the containing area scaleRatio, defaulting to 1', () => {
  const walkAreas = [
    { x: 0, y: 0, width: 100, height: 100, scaleRatio: 1.5 },
  ];
  const movementSystem = makeMovementSystemStub(walkAreas);
  const geometry = new StageGeometry({ getMovementSystem: () => movementSystem });

  assert.equal(geometry.getVisualScaleForPoint(50, 50), 1.5);
  // 落在任何已知区域之外时安全回退到 1
  assert.equal(geometry.getVisualScaleForPoint(999, 999), 1);

  const pet = { x: 40, y: 40, size: 20 }; // center = (50, 50)
  assert.equal(geometry.getVisualScaleForPet(pet), 1.5);
});

test('getWeatherEffectScale prefers the primary walk area, then the first area, defaulting to 1', () => {
  const geometry = new StageGeometry({});
  geometry.applyScreenInfo({
    width: 800,
    height: 600,
    walkAreas: [
      { x: 0, y: 0, width: 400, height: 600, scaleRatio: 1 },
      { x: 400, y: 0, width: 400, height: 600, scaleRatio: 2, isPrimary: true },
    ],
  });
  assert.equal(geometry.getWeatherEffectScale(), 2);

  const geometryNoPrimary = new StageGeometry({});
  geometryNoPrimary.applyScreenInfo({
    width: 800,
    height: 600,
    walkAreas: [{ x: 0, y: 0, width: 800, height: 600, scaleRatio: 3 }],
  });
  assert.equal(geometryNoPrimary.getWeatherEffectScale(), 3);

  const geometryEmpty = new StageGeometry({});
  assert.equal(geometryEmpty.getWeatherEffectScale(), 1);
});

test('getMenuBoundsForPet falls back to the full window when the pet is outside every walk area', () => {
  global.window = { innerWidth: 1280, innerHeight: 720 };
  try {
    const geometry = new StageGeometry({});
    const pet = { x: 5000, y: 5000, size: 96 };
    const bounds = geometry.getMenuBoundsForPet(pet);
    assert.deepEqual(bounds, { x: 0, y: 0, width: 1280, height: 720 });
  } finally {
    delete global.window;
  }
});

test('keepPetReachable is a no-op without a MovementSystem and clamps otherwise', () => {
  const geometryNoMovement = new StageGeometry({});
  assert.doesNotThrow(() => geometryNoMovement.keepPetReachable({ id: 'lonely' }));

  const movementSystem = makeMovementSystemStub([]);
  const geometry = new StageGeometry({ getMovementSystem: () => movementSystem });
  const pet = { id: 'tracked' };
  geometry.keepPetReachable(pet);
  assert.deepEqual(movementSystem.calls.clampPetToWalkAreas, [pet]);
});
