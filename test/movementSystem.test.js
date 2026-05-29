const assert = require('node:assert/strict');
const test = require('node:test');

global.CONFIG = {
  WALK_TARGET_MARGIN: 0,
  TASKBAR_HEIGHT: 0,
  MOVE_SPEED: 1,
};

const { MovementSystem } = require('../src/systems/MovementSystem');

test('walking direction is set before the first walking frame renders', () => {
  const movementSystem = new MovementSystem(400, 300);
  const pet = {
    x: 100,
    y: 100,
    size: 96,
    speed: 1,
    state: 'idle',
    direction: 'left',
    idleTimer: 0,
    isDragging: false,
    isBusy: () => false,
    setState(newState) {
      this.state = newState;
    },
  };

  movementSystem.randomTarget = (targetPet) => {
    targetPet.targetX = 180;
    targetPet.targetY = 100;
  };

  movementSystem.update(pet, 16);

  assert.equal(pet.state, 'walking');
  assert.equal(pet.direction, 'right');
});

test('random targets stay inside one visible display area', () => {
  const movementSystem = new MovementSystem(3200, 1080, [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 300, width: 1280, height: 720 },
  ]);
  const pet = { size: 96 };

  for (let i = 0; i < 200; i += 1) {
    movementSystem.randomTarget(pet);
    const targetIsVisible = movementSystem.getWalkAreas().some((area) => (
      pet.targetX >= area.x
      && pet.targetY >= area.y
      && pet.targetX + pet.size <= area.x + area.width
      && pet.targetY + pet.size <= area.y + area.height
    ));

    assert.equal(targetIsVisible, true);
  }
});

test('walk area scale ratios survive normalization', () => {
  const movementSystem = new MovementSystem(3640, 1920, [
    { x: 0, y: 0, width: 2560, height: 1392, scaleRatio: 1 },
    { x: 2560, y: 0, width: 720, height: 1248, scaleRatio: 2 / 3 },
  ]);

  assert.deepEqual(movementSystem.getWalkAreas(), [
    { x: 0, y: 0, width: 2560, height: 1392, scaleRatio: 1 },
    { x: 2560, y: 0, width: 720, height: 1248, scaleRatio: 2 / 3 },
  ]);
});

test('pets are clamped back to the nearest visible display area', () => {
  const movementSystem = new MovementSystem(3200, 1080, [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 300, width: 1280, height: 720 },
  ]);
  const pet = { x: 2500, y: 80, size: 96 };

  movementSystem.clampPetToWalkAreas(pet);

  assert.equal(pet.y >= 300, true);
  assert.equal(pet.x >= 1920, true);
  assert.equal(pet.x + pet.size <= 3200, true);
});

test('walking between separated displays bridges the invisible coordinate gap', () => {
  const movementSystem = new MovementSystem(4920, 1920, [
    { x: 0, y: 0, width: 2560, height: 1392 },
    { x: 3840, y: 0, width: 1080, height: 1872 },
  ]);
  const pet = {
    x: 2500,
    y: 120,
    targetX: 4100,
    targetY: 120,
    targetArea: { x: 3840, y: 0, width: 1080, height: 1872 },
    size: 96,
    speed: 100,
    direction: 'right',
  };

  movementSystem.moveTowardTarget(pet, 16);

  assert.equal(pet.x, 3840);
  assert.equal(pet.y, 120);
  assert.equal(pet.direction, 'right');
});

test('movement clamps stale out-of-area targets back inside the visible display', () => {
  const movementSystem = new MovementSystem(3640, 1920, [
    { x: 0, y: 0, width: 2560, height: 1392 },
    { x: 2560, y: 0, width: 1080, height: 1872 },
  ]);
  const pet = {
    x: 3500,
    y: 120,
    targetX: 3800,
    targetY: 120,
    targetArea: { x: 2560, y: 0, width: 1080, height: 1872 },
    size: 96,
    speed: 10,
    direction: 'right',
  };

  movementSystem.moveTowardTarget(pet, 16);

  assert.equal(pet.x + pet.size <= 3640, true);
  assert.equal(pet.y + pet.size <= 1872, true);
});

test('movement ignores cached target areas that no longer match current displays', () => {
  const movementSystem = new MovementSystem(3640, 1920, [
    { x: 0, y: 0, width: 2560, height: 1392 },
    { x: 2560, y: 0, width: 1080, height: 1392 },
  ]);
  const pet = {
    x: 3000,
    y: 1200,
    targetX: 3200,
    targetY: 1800,
    targetArea: { x: 2560, y: 0, width: 1080, height: 1872 },
    size: 96,
    speed: 100,
    direction: 'right',
  };

  movementSystem.moveTowardTarget(pet, 16);

  assert.deepEqual(pet.targetArea, { x: 2560, y: 0, width: 1080, height: 1392, scaleRatio: 1 });
  assert.equal(pet.targetY + pet.size <= 1392, true);
  assert.equal(pet.y + pet.size <= 1392, true);
});

test('movement clamps cached targets to the right and bottom edges of a display', () => {
  const movementSystem = new MovementSystem(3640, 1920, [
    { x: 0, y: 0, width: 2560, height: 1392 },
    { x: 2560, y: 0, width: 1080, height: 1872 },
  ]);
  const pet = {
    x: 3500,
    y: 1810,
    targetX: 3700,
    targetY: 1900,
    targetArea: { x: 2560, y: 0, width: 1080, height: 1872 },
    size: 96,
    speed: 10,
    direction: 'right',
  };

  movementSystem.moveTowardTarget(pet, 16);

  assert.equal(pet.targetX, 3544);
  assert.equal(pet.targetY, 1776);
  assert.equal(pet.x + pet.size <= 3640, true);
  assert.equal(pet.y + pet.size <= 1872, true);
});

test('walking from a secondary display back to the primary display is not clamped at the seam', () => {
  const movementSystem = new MovementSystem(3640, 1920, [
    { x: 0, y: 0, width: 2560, height: 1392 },
    { x: 2560, y: 0, width: 1080, height: 1872 },
  ]);
  const pet = {
    x: 2560,
    y: 120,
    targetX: 2400,
    targetY: 120,
    targetArea: { x: 0, y: 0, width: 2560, height: 1392 },
    size: 96,
    speed: 10,
    direction: 'left',
  };

  movementSystem.moveTowardTarget(pet, 16);

  assert.equal(pet.x < 2560, true);
  assert.equal(pet.x + pet.size > 2560, true);
});

test('idle pets choose active window platforms when available', () => {
  const movementSystem = new MovementSystem(1920, 1080, [
    { x: 0, y: 0, width: 1920, height: 1040 },
  ]);
  movementSystem.setActivePlatform({
    x: 120,
    y: 76,
    width: 800,
    height: 48,
    source: 'active-window-top',
  });
  const pet = { size: 96 };

  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    movementSystem.randomTarget(pet);
  } finally {
    Math.random = originalRandom;
  }

  assert.deepEqual(pet.targetArea, {
    x: 120,
    y: 76,
    width: 800,
    height: 48,
    scaleRatio: 1,
    source: 'active-window-top',
  });
  assert.equal(pet.targetX >= 120, true);
  assert.equal(pet.targetX + pet.size <= 920, true);
  assert.equal(pet.targetY, 4);
  assert.equal(pet.targetY + pet.size, 100);
});

test('idle pets already on active window platforms keep walking along the edge on the 70 percent roll', () => {
  const movementSystem = new MovementSystem(1920, 1080, [
    { x: 0, y: 0, width: 1920, height: 1040 },
  ]);
  const platform = {
    x: 120,
    y: 76,
    width: 800,
    height: 48,
    source: 'active-window-top',
  };
  movementSystem.setActivePlatform(platform);
  const pet = {
    x: 400,
    y: 4,
    targetArea: platform,
    size: 96,
  };

  const rolls = [0.69, 0.5, 0.5];
  const originalRandom = Math.random;
  Math.random = () => rolls.shift() ?? 0.5;

  try {
    movementSystem.randomTarget(pet);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(pet.targetArea.source, 'active-window-top');
  assert.equal(pet.targetX >= 120, true);
  assert.equal(pet.targetX + pet.size <= 920, true);
  assert.equal(pet.targetY, 4);
  assert.equal(pet.targetY + pet.size, 100);
});

test('idle pets skip active window platforms when the 70 percent roll misses', () => {
  const movementSystem = new MovementSystem(1920, 1080, [
    { x: 0, y: 0, width: 1920, height: 1040 },
  ]);
  movementSystem.setActivePlatform({
    x: 120,
    y: 76,
    width: 800,
    height: 48,
    source: 'active-window-top',
  });
  const pet = { size: 96 };

  const rolls = [0.7, 0, 0, 0];
  const originalRandom = Math.random;
  Math.random = () => rolls.shift() ?? 0;

  try {
    movementSystem.randomTarget(pet);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(pet.targetArea.source, undefined);
  assert.equal(pet.targetY >= 0, true);
  assert.equal(pet.targetY + pet.size <= 1040, true);
  assert.notEqual(pet.targetY, 4);
});

test('active window platform arrivals land pets on the platform foot line', () => {
  const movementSystem = new MovementSystem(1920, 1080, [
    { x: 0, y: 0, width: 1920, height: 1040 },
  ]);
  const platform = {
    x: 120,
    y: 76,
    width: 800,
    height: 48,
    source: 'active-window-top',
  };
  movementSystem.setActivePlatform(platform);
  const pet = {
    x: 500,
    y: 300,
    targetX: 500,
    targetY: 4,
    targetArea: platform,
    size: 96,
    speed: 1000,
    direction: 'left',
  };

  movementSystem.moveTowardTarget(pet, 16);

  assert.equal(pet.y, 4);
  assert.equal(pet.y + pet.size, 100);
});

test('near-screen-top active window platforms are ignored when pets cannot fit above them', () => {
  const movementSystem = new MovementSystem(1920, 1080, [
    { x: 0, y: 0, width: 1920, height: 1040 },
  ]);
  movementSystem.setActivePlatform({
    x: 0,
    y: 0,
    width: 1920,
    height: 24,
    source: 'active-window-top',
  });
  const pet = { size: 96 };

  movementSystem.randomTarget(pet);

  assert.equal(pet.targetArea.source, undefined);
  assert.equal(pet.targetY >= 0, true);
  assert.equal(pet.targetY + pet.size <= 1040, true);
});

test('stale near-screen-top active window targets fall back to visible walk areas', () => {
  const movementSystem = new MovementSystem(1920, 1080, [
    { x: 0, y: 0, width: 1920, height: 1040 },
  ]);
  const pet = {
    x: 600,
    y: 20,
    targetX: 600,
    targetY: -84,
    targetArea: {
      x: 0,
      y: 0,
      width: 1920,
      height: 24,
      source: 'active-window-top',
    },
    size: 96,
    speed: 10,
    direction: 'left',
  };

  movementSystem.moveTowardTarget(pet, 16);

  assert.equal(pet.targetArea.source, undefined);
  assert.equal(pet.targetY >= 0, true);
  assert.equal(pet.y >= 0, true);
});

test('active platform removal falls back to display walk areas for new idle targets', () => {
  const movementSystem = new MovementSystem(1920, 1080, [
    { x: 0, y: 0, width: 1920, height: 1040 },
  ]);
  movementSystem.setActivePlatform({
    x: 120,
    y: 76,
    width: 800,
    height: 48,
    source: 'active-window-top',
  });
  movementSystem.setActivePlatform(null);
  const pet = { size: 96 };

  movementSystem.randomTarget(pet);

  assert.equal(pet.targetArea.source, undefined);
  assert.equal(pet.targetY + pet.size <= 1040, true);
});

test('idle pets can choose taskbar platforms when no active window platform is available', () => {
  const movementSystem = new MovementSystem(1920, 1080, [
    { x: 0, y: 0, width: 1920, height: 1040 },
  ]);
  movementSystem.setSurfacePlatforms([
    {
      x: 0,
      y: 1016,
      width: 1920,
      height: 48,
      source: 'taskbar-edge',
    },
  ]);
  const pet = { size: 96 };
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    movementSystem.randomTarget(pet);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(pet.targetArea.source, 'taskbar-edge');
  assert.equal(pet.targetX >= 0, true);
  assert.equal(pet.targetX + pet.size <= 1920, true);
  assert.equal(pet.targetY, 944);
  assert.equal(pet.targetY + pet.size, 1040);
});

test('active window platforms are preferred over taskbar platforms', () => {
  const movementSystem = new MovementSystem(1920, 1080, [
    { x: 0, y: 0, width: 1920, height: 1040 },
  ]);
  movementSystem.setSurfacePlatforms([
    {
      x: 0,
      y: 1016,
      width: 1920,
      height: 48,
      source: 'taskbar-edge',
    },
    {
      x: 120,
      y: 76,
      width: 800,
      height: 48,
      source: 'active-window-top',
    },
  ]);
  const pet = { size: 96 };

  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    movementSystem.randomTarget(pet);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(pet.targetArea.source, 'active-window-top');
  assert.equal(pet.targetY, 4);
});

test('walking pets keep their cached active window target when the active window changes', () => {
  const movementSystem = new MovementSystem(1920, 1080, [
    { x: 0, y: 0, width: 1920, height: 1040 },
  ]);
  const oldPlatform = {
    x: 120,
    y: 76,
    width: 800,
    height: 48,
    source: 'active-window-top',
  };
  const pet = {
    x: 100,
    y: 40,
    targetX: 500,
    targetY: 52,
    targetArea: oldPlatform,
    size: 96,
    speed: 10,
    direction: 'right',
  };

  movementSystem.setActivePlatform({
    x: 1000,
    y: 76,
    width: 700,
    height: 48,
    source: 'active-window-top',
  });
  movementSystem.moveTowardTarget(pet, 16);

  assert.deepEqual(pet.targetArea, oldPlatform);
  assert.equal(pet.x > 100, true);
  assert.equal(pet.x < 1000, true);
});
