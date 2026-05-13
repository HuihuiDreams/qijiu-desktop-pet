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
