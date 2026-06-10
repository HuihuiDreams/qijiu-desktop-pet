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
