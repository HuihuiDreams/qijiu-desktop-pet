const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const { MovementSystem } = require('../src/systems/MovementSystem');

function createRendererHarness() {
  let isUserPaused = false;
  let isVisible = true;
  let isPaused = false;
  let stageDisplay = '';

  const listeners = {
    'toggle-pause': [],
    'toggle-pet-visibility': [],
  };

  const electronAPI = {
    onTogglePause: (cb) => { listeners['toggle-pause'].push(cb); },
    onTogglePetVisibility: (cb) => { listeners['toggle-pet-visibility'].push(cb); },
  };

  const mainWindow = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: (channel, ...args) => {
        if (listeners[channel]) {
          listeners[channel].forEach((cb) => cb(...args));
        }
      },
    },
  };

  const deps = {
    ipcMain: { handle: () => {} },
    windowManager: { mainWindow },
    trayManager: { refreshTrayMenu: () => {} },
  };

  function updateEffectivePause() {
    isPaused = !isVisible || isUserPaused;
  }

  electronAPI.onTogglePause((paused) => {
    isUserPaused = Boolean(paused);
    updateEffectivePause();
  });

  electronAPI.onTogglePetVisibility((visible, state) => {
    stageDisplay = visible ? '' : 'none';
    isVisible = Boolean(visible);
    if (state && typeof state.isPaused === 'boolean') {
      isUserPaused = state.isPaused;
    }
    updateEffectivePause();
  });

  return {
    deps,
    electronAPI,
    getIsUserPaused: () => isUserPaused,
    getIsPaused: () => isPaused,
    getIsVisible: () => isVisible,
    getStageDisplay: () => stageDisplay,
  };
}

class TestPet {
  constructor() {
    this.state = 'idle';
    this.x = 100;
    this.y = 100;
    this.targetX = 100;
    this.targetY = 100;
    this.size = 64;
    this.direction = 'right';
    this.isDragging = false;
    this.idleTimer = 10000;
  }
  isBusy() {
    return false;
  }
}

function runMovementStep(harness, pet, movementSystem, deltaMs) {
  if (!harness.getIsPaused() && !pet.isDragging) {
    movementSystem.update(pet, deltaMs);
  }
}

test('R3: user pause is preserved across manual hide and show', () => {
  const harness = createRendererHarness();
  delete require.cache[require.resolve('../src/main/services/PetVisibilityService')];
  const service = require('../src/main/services/PetVisibilityService');
  service.init(harness.deps);

  const pet = new TestPet();
  const movement = new MovementSystem(1920, 1080);

  // User pauses
  service.setPaused(true);
  assert.equal(harness.getIsPaused(), true);
  assert.equal(service.getIsPaused(), true);

  runMovementStep(harness, pet, movement, 250);
  assert.equal(pet.idleTimer, 10000, 'idleTimer must not decrease while paused');

  // Manual hide
  service.hidePetManually();
  assert.equal(harness.getIsPaused(), true);
  assert.equal(harness.getIsVisible(), false);
  assert.equal(harness.getStageDisplay(), 'none');
  runMovementStep(harness, pet, movement, 250);
  assert.equal(pet.idleTimer, 10000);

  // Manual show
  service.showPetManually();
  assert.equal(harness.getIsVisible(), true);
  assert.equal(harness.getStageDisplay(), '');
  assert.equal(harness.getIsPaused(), true, 'effective pause must remain true after show');
  assert.equal(service.getIsPaused(), true, 'main service must report paused');

  runMovementStep(harness, pet, movement, 250);
  assert.equal(pet.idleTimer, 10000, 'movement update must remain suppressed');
});

test('R3: user pause is preserved across meeting hide and show', () => {
  const harness = createRendererHarness();
  delete require.cache[require.resolve('../src/main/services/PetVisibilityService')];
  const service = require('../src/main/services/PetVisibilityService');
  service.init(harness.deps);

  const pet = new TestPet();
  const movement = new MovementSystem(1920, 1080);

  service.setPaused(true);
  assert.equal(harness.getIsPaused(), true);

  service.hidePetForMeeting();
  assert.equal(harness.getIsPaused(), true);
  assert.equal(harness.getIsVisible(), false);

  service.showPetAfterMeeting();
  assert.equal(harness.getIsVisible(), true);
  assert.equal(harness.getIsPaused(), true, 'must stay paused after meeting ends');

  runMovementStep(harness, pet, movement, 250);
  assert.equal(pet.idleTimer, 10000);
});

test('R3: user pause is preserved across pomodoro focus and restore', () => {
  const harness = createRendererHarness();
  delete require.cache[require.resolve('../src/main/services/PetVisibilityService')];
  const service = require('../src/main/services/PetVisibilityService');
  service.init(harness.deps);

  const pet = new TestPet();
  const movement = new MovementSystem(1920, 1080);

  service.setPaused(true);
  assert.equal(harness.getIsPaused(), true);

  service.enterPomodoroPetFocus();
  assert.equal(harness.getIsPaused(), true);
  assert.equal(harness.getIsVisible(), false);

  service.restorePomodoroPetFocus();
  assert.equal(harness.getIsVisible(), true);
  assert.equal(harness.getIsPaused(), true, 'must stay paused after pomodoro restores');

  runMovementStep(harness, pet, movement, 250);
  assert.equal(pet.idleTimer, 10000);
});

test('R3: unpaused pet resumes moving after hide/show lifecycle', () => {
  const harness = createRendererHarness();
  delete require.cache[require.resolve('../src/main/services/PetVisibilityService')];
  const service = require('../src/main/services/PetVisibilityService');
  service.init(harness.deps);

  const pet = new TestPet();
  const movement = new MovementSystem(1920, 1080);

  assert.equal(harness.getIsPaused(), false);
  runMovementStep(harness, pet, movement, 250);
  assert.equal(pet.idleTimer, 9750, 'unpaused pet updates movement');

  // Hide manually
  service.hidePetManually();
  assert.equal(harness.getIsPaused(), true, 'effective pause is true while hidden');
  runMovementStep(harness, pet, movement, 250);
  assert.equal(pet.idleTimer, 9750, 'movement suppressed while hidden');

  // Show manually
  service.showPetManually();
  assert.equal(harness.getIsPaused(), false, 'effective pause returns to false');
  runMovementStep(harness, pet, movement, 250);
  assert.equal(pet.idleTimer, 9500, 'movement resumes after show');
});

test('R3: src/app.js implements effective pause calculation and avoids isPaused = !visible', () => {
  const appSource = fs.readFileSync(require.resolve('../src/app.js'), 'utf8');
  assert.ok(!appSource.includes('isPaused = !visible;'), 'app.js must not unconditionally overwrite isPaused with !visible');
  assert.match(appSource, /isUserPaused/, 'app.js must track user pause choice');
});
