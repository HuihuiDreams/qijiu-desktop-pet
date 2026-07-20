const { test } = require('node:test');
const assert = require('node:assert');
const { InteractionSystem } = require('../src/systems/InteractionSystem');

// 模拟 CONFIG
global.CONFIG = {
  INTERACTION_DISTANCE: 180,
  INTERACTION_COOLDOWN: 60000,
  INTERACTION_DURATION: 4000,
  PET_SIZE: 96,
  INTERACTIONS: {
    greet: { weight: 30, moodA: 1, moodB: 1, affection: 1, hungerA: 0, hungerB: 0, qiA: 0, qiB: 0, minAffection: 0 },
  }
};

// 简单的 Pet mock 类
class MockPet {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.size = 96;
    this.direction = 'right';
    this.state = 'idle';
    this.isDragging = false;
    this.stats = { affection: 50, hunger: 100, qi: 100, mood: 100 };
    this.idleTimer = 0;
  }
  
  isBusy() { return this.state === 'interacting'; }
  setState(state) { this.state = state; }
  modifyStat(key, delta) { this.stats[key] += delta; }
}

test('InteractionSystem - Anti-Overlap when triggered', (t) => {
  const system = new InteractionSystem();
  const petA = new MockPet();
  const petB = new MockPet();
  
  // 让两只宠物坐标完全一致（发生完全交叠）
  petA.x = 100;
  petA.y = 100;
  petB.x = 100;
  petB.y = 100;
  
  const interaction = system.update(petA, petB, 16);
  
  assert.ok(interaction !== null, 'Should trigger an interaction');
  
  // 验证防交叠机制
  const currentXDist = Math.abs(petA.x - petB.x);
  const minXDist = 96;
  
  assert.ok(currentXDist >= minXDist, `Pets should be pushed apart. Distance: ${currentXDist}`);
  
  // 验证他们仍然面对面
  if (petA.x < petB.x) {
    assert.strictEqual(petA.direction, 'right');
    assert.strictEqual(petB.direction, 'left');
  } else {
    assert.strictEqual(petA.direction, 'left');
    assert.strictEqual(petB.direction, 'right');
  }
});

test('InteractionSystem - cooldown and duration logic', () => {
  const system = new InteractionSystem();
  const petA = new MockPet();
  const petB = new MockPet();
  
  // Set interacting
  system.isInteracting = true;
  system.interactionTimer = 100;
  system.cooldownTimer = 0;
  
  // Update to decrease timer
  system.update(petA, petB, 200);
  
  assert.strictEqual(system.isInteracting, false);
  assert.strictEqual(system.currentInteraction, null);
  assert.strictEqual(petA.state, 'idle');
  assert.strictEqual(petA.idleTimer, 2000);
  assert.strictEqual(system.cooldownTimer, CONFIG.INTERACTION_COOLDOWN);
  
  // Decrease cooldown
  system.update(petA, petB, 10000);
  assert.strictEqual(system.cooldownTimer, CONFIG.INTERACTION_COOLDOWN - 10000);
});

test('InteractionSystem - pickInteraction fallback', () => {
  const system = new InteractionSystem();
  const orig = Math.random;
  Math.random = () => 1; // max roll
  const interaction = system.pickInteraction(100, new MockPet());
  assert.strictEqual(interaction.key, 'greet');
  Math.random = orig;
});

test('InteractionSystem - getPresentation shareFood overfeed', () => {
  const system = new InteractionSystem();
  const petA = new MockPet();
  const petB = new MockPet();
  petB.stats.hunger = 90;
  
  const interaction = {
    key: 'shareFood',
    hungerB: 20
  };
  
  global.window = {
    DIALOGUES: {
      throwup: {
        yueqi: ['test-y'],
        shenjiu: ['test-s']
      }
    }
  };
  
  const presentation = system.getPresentation(petA, petB, interaction);
  assert.strictEqual(presentation.overlayKey, 'throwup');
  assert.strictEqual(presentation.dialogue.yueqi, 'test-y');
  assert.strictEqual(presentation.dialogue.shenjiu, 'test-s');
  
  delete global.window;
});
