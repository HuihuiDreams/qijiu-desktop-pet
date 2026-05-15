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
