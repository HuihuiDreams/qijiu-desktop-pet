const assert = require('node:assert/strict');
const test = require('node:test');

const { Pet } = require('../src/pet/Pet');
const { MovementSystem } = require('../src/systems/MovementSystem');
const { StageGeometry } = require('../src/systems/StageGeometry');

function createScene(t, scaleRatio) {
  const hadConfig = Object.prototype.hasOwnProperty.call(global, 'CONFIG');
  const originalConfig = global.CONFIG;
  global.CONFIG = {
    PET_SIZE: 96,
    MOVE_SPEED: 2,
    WALK_TARGET_MARGIN: 0,
    TASKBAR_HEIGHT: 0,
    IDLE_DURATION_MIN: 1000,
    IDLE_DURATION_MAX: 2000,
  };
  t.after(() => {
    if (hadConfig) global.CONFIG = originalConfig;
    else delete global.CONFIG;
  });

  const walkArea = { x: 100, y: 100, width: 1200, height: 600, scaleRatio };
  const movement = new MovementSystem(1400, 800);
  let pet = null;
  const geometry = new StageGeometry({
    getMovementSystem: () => movement,
    getPets: () => pet ? [pet] : [],
  });
  geometry.applyScreenInfo({ width: 1400, height: 800, walkAreas: [walkArea] });
  pet = new Pet({ id: 'scale-test' });
  pet.idleTimer = 1000;

  return {
    pet,
    movement,
    geometry,
    walkArea,
    resize(percent) {
      pet.applyScale(percent, geometry.getVisualScaleForPet(pet));
      geometry.keepPetReachable(pet);
    },
  };
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} should equal ${expected}`);
}

for (const ratio of [1, 1 / 3, 2 / 3, 1.5]) {
  for (const source of ['taskbar-edge', 'active-window-top']) {
    for (const state of ['idle', 'walking']) {
      test(`resizing a ${state} pet preserves its ${source} attachment at DPI ${ratio}`, (t) => {
        const { pet, movement, resize } = createScene(t, ratio);
        const platform = {
          x: 250,
          y: source === 'taskbar-edge' ? 676 : 426,
          width: 800,
          height: 48,
          source,
        };
        if (source === 'taskbar-edge') platform.scaleRatio = ratio;
        movement.setSurfacePlatforms([platform]);
        const platformY = platform.y + platform.height / 2;
        pet.x = 400;
        pet.y = platformY - pet.size * ratio;
        pet.targetX = state === 'walking' ? 800 : pet.x;
        pet.targetY = pet.y;
        pet.targetArea = platform;
        pet.setState(state);
        const initial = { x: pet.x, y: pet.y, targetX: pet.targetX, targetY: pet.targetY };
        const centerX = pet.x + pet.size * ratio / 2;
        const targetCenterX = pet.targetX + pet.size * ratio / 2;

        for (const percent of [150, 50, 100]) {
          resize(percent);
          assertClose(pet.x + pet.size * ratio / 2, centerX, `${percent}% visual bottom center x`);
          assertClose(pet.y + pet.size * ratio, platformY, `${percent}% visual bottom`);
          assert.equal(movement.findCurrentSurfacePlatform(pet)?.source, source,
            `${percent}% must retain the current surface platform`);

          movement.resolveTargetArea(pet);
          assert.equal(pet.targetArea.source, source);
          assertClose(pet.targetY + pet.size * ratio, platformY, `${percent}% target bottom`);
          assertClose(pet.targetX + pet.size * ratio / 2, targetCenterX, `${percent}% target center x`);
        }

        assertClose(pet.x, initial.x, 'cancel restores x');
        assertClose(pet.y, initial.y, 'cancel restores y');
        assertClose(pet.targetX, initial.targetX, 'cancel restores target x');
        assertClose(pet.targetY, initial.targetY, 'cancel restores target y');

        movement.update(pet, 16.666);
        assertClose(pet.y + pet.size * ratio, platformY, 'next movement frame stays on the platform');
        assert.equal(movement.findCurrentSurfacePlatform(pet)?.source, source);
        if (state === 'walking') assert.ok(pet.x > initial.x, 'walking continues horizontally');
      });
    }
  }

  test(`bottom-edge resize and cancel preserve position with room for 150% width at DPI ${ratio}`, (t) => {
    const { pet, walkArea, resize } = createScene(t, ratio);
    const right = walkArea.x + walkArea.width;
    const bottom = walkArea.y + walkArea.height;
    const centerX = right - 144 * ratio / 2;
    pet.x = centerX - pet.size * ratio / 2;
    pet.y = bottom - pet.size * ratio;
    pet.targetX = pet.x;
    pet.targetY = pet.y;
    const initial = { x: pet.x, y: pet.y };

    for (const percent of [150, 50, 100]) {
      resize(percent);
      assertClose(pet.x + pet.size * ratio / 2, centerX, `${percent}% bottom center x`);
      assertClose(pet.y + pet.size * ratio, bottom, `${percent}% bottom edge`);
      assert.ok(pet.x + pet.size * ratio <= right + 1e-8, 'visual right remains inside the walk area');
    }

    assertClose(pet.x, initial.x, 'cancel restores x');
    assertClose(pet.y, initial.y, 'cancel restores y');
  });

  test(`resizing at the exact bottom-right corner keeps the entire pet visible at DPI ${ratio}`, (t) => {
    const { pet, walkArea, resize } = createScene(t, ratio);
    const right = walkArea.x + walkArea.width;
    const bottom = walkArea.y + walkArea.height;
    pet.x = right - pet.size * ratio;
    pet.y = bottom - pet.size * ratio;
    pet.targetX = pet.x;
    pet.targetY = pet.y;

    for (const percent of [150, 50, 100]) {
      resize(percent);
      assert.ok(pet.x >= walkArea.x, `${percent}% visual left remains visible`);
      assert.ok(pet.y >= walkArea.y, `${percent}% visual top remains visible`);
      assert.ok(pet.x + pet.size * ratio <= right + 1e-8, `${percent}% visual right remains visible`);
      assert.ok(pet.y + pet.size * ratio <= bottom + 1e-8, `${percent}% visual bottom remains visible`);
    }
  });
}

test('resizing and cancel preserve the original visible anchor above an existing taskbar target', (t) => {
  const ratio = 2 / 3;
  const { pet, movement, geometry, resize } = createScene(t, ratio);
  geometry.applyScreenInfo({
    width: 1920,
    height: 1080,
    walkAreas: [{ x: 0, y: 0, width: 1920, height: 1040, scaleRatio: ratio }],
  });
  const platform = {
    x: 0,
    y: 1016,
    width: 1920,
    height: 48,
    scaleRatio: ratio,
    source: 'taskbar-edge',
  };
  movement.setSurfacePlatforms([platform]);
  pet.x = 500;
  pet.y = 944;
  pet.targetX = 700;
  pet.targetY = 944;
  pet.targetArea = platform;
  pet.setState('walking');
  const centerX = pet.x + pet.size * ratio / 2;
  const bottom = pet.y + pet.size * ratio;
  const targetCenterX = pet.targetX + pet.size * ratio / 2;

  assert.equal(bottom, 1008, 'the existing visible feet are above the platform');
  for (const percent of [150, 100]) {
    resize(percent);
    assertClose(pet.x + pet.size * ratio / 2, centerX, `${percent}% current center x`);
    assertClose(pet.y + pet.size * ratio, bottom, `${percent}% current bottom`);
    assertClose(pet.targetX + pet.size * ratio / 2, targetCenterX, `${percent}% target center x`);
    assertClose(pet.targetY + pet.size * ratio, bottom, `${percent}% target bottom`);
  }

  assertClose(pet.x, 500, 'cancel restores the original x');
  assertClose(pet.y, 944, 'cancel restores the original y');
  assertClose(pet.targetX, 700, 'cancel restores the original target x');
  assertClose(pet.targetY, 944, 'cancel restores the original target y');
});

for (const ratio of [1 / 3, 2 / 3, 1.5]) {
  test(`bridging a display gap from the bottom-right lands inside the target display at DPI ${ratio}`, (t) => {
    const { pet, movement, geometry } = createScene(t, ratio);
    const targetArea = { x: 100, y: 100, width: 1200, height: 600, scaleRatio: ratio };
    const currentArea = { x: 1500, y: 900, width: 800, height: 600, scaleRatio: 1 };
    geometry.applyScreenInfo({
      width: 2300,
      height: 1500,
      walkAreas: [targetArea, currentArea],
    });
    pet.x = 1600;
    pet.y = 1000;
    pet.targetX = 500;
    pet.targetY = 400;
    pet.targetArea = targetArea;

    assert.equal(movement.bridgeToTargetArea(pet, currentArea, targetArea), true);

    assert.ok(pet.x >= targetArea.x, 'visual left remains inside the target display');
    assert.ok(pet.y >= targetArea.y, 'visual top remains inside the target display');
    assertClose(pet.x + pet.size * ratio, targetArea.x + targetArea.width,
      'visual right lands at the target display edge');
    assertClose(pet.y + pet.size * ratio, targetArea.y + targetArea.height,
      'visual bottom lands at the target display edge');
    assertClose(geometry.getVisualScaleForPet(pet), ratio, 'landing uses the target display DPI');
  });
}

test('a fully visible low-DPI pet keeps its scale beside a higher-DPI display during preview and cancel', (t) => {
  const ratio = 1 / 3;
  const { pet, movement, geometry, resize } = createScene(t, ratio);
  const lowArea = { x: 100, y: 100, width: 1200, height: 600, scaleRatio: ratio };
  const neighbor = { x: 1300, y: 100, width: 1200, height: 600, scaleRatio: 1 };
  geometry.applyScreenInfo({
    width: 2600,
    height: 800,
    walkAreas: [lowArea, neighbor],
  });
  pet.x = lowArea.x + lowArea.width - pet.size * ratio;
  pet.y = 300;
  pet.targetX = pet.x;
  pet.targetY = pet.y;

  assert.ok(pet.x + pet.size / 2 > neighbor.x,
    'the logical center lies in the neighbor despite the complete visual bounds being on the low-DPI display');
  const assertLowDpiAndVisible = (percent) => {
    assertClose(geometry.getVisualScaleForPet(pet), ratio, `${percent}% renderer DPI`);
    assertClose(movement.getMovementScaleForPet(pet), ratio, `${percent}% movement DPI`);
    assert.ok(pet.x >= lowArea.x, `${percent}% visual left remains on the low-DPI display`);
    assert.ok(pet.y >= lowArea.y, `${percent}% visual top remains on the low-DPI display`);
    assert.ok(pet.x + pet.size * ratio <= lowArea.x + lowArea.width + 1e-8,
      `${percent}% visual right remains on the low-DPI display`);
    assert.ok(pet.y + pet.size * ratio <= lowArea.y + lowArea.height + 1e-8,
      `${percent}% visual bottom remains on the low-DPI display`);
  };

  assertLowDpiAndVisible(100);
  for (const percent of [150, 50, 100]) {
    resize(percent);
    assertLowDpiAndVisible(percent);
  }
});

test('fractional display bounds preserve DPI throughout bottom-right scale previews', (t) => {
  const ratio = 0.4;
  const { pet, movement, geometry, resize } = createScene(t, ratio);
  const walkArea = { x: 1920, y: 0, width: 546.4, height: 748.8000000000001, scaleRatio: ratio };
  const right = walkArea.x + walkArea.width;
  const bottom = walkArea.y + walkArea.height;
  geometry.applyScreenInfo({ width: 2600, height: 800, walkAreas: [walkArea] });
  pet.applyScale(50, ratio);
  pet.x = right - pet.size * ratio;
  pet.y = bottom - pet.size * ratio;
  pet.targetX = pet.x;
  pet.targetY = pet.y;

  for (let percent = 50; percent <= 150; percent += 1) {
    resize(percent);
    assertClose(geometry.getVisualScaleForPet(pet), ratio, `${percent}% renderer DPI`);
    assertClose(movement.getMovementScaleForPet(pet), ratio, `${percent}% movement DPI`);
    assert.ok(pet.x >= walkArea.x - 1e-8, `${percent}% visual left remains visible`);
    assert.ok(pet.y >= walkArea.y - 1e-8, `${percent}% visual top remains visible`);
    assert.ok(pet.x + pet.size * ratio <= right + 1e-8, `${percent}% visual right remains visible`);
    assert.ok(pet.y + pet.size * ratio <= bottom + 1e-8, `${percent}% visual bottom remains visible`);
  }
});
