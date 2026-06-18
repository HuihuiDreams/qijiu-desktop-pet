const test = require('node:test');
const assert = require('node:assert');
const { SpriteView } = require('../src/pet/SpriteView.js');
const { MovementSystem } = require('../src/systems/MovementSystem.js');
const { InteractionSystem } = require('../src/systems/InteractionSystem.js');

// Mock Pet
class MockPet {
  constructor(id) {
    this.id = id;
    this.state = 'idle';
    this.timePhase = 'day';
    this.direction = 'left';
    this.stats = { affection: 50, hunger: 80, qi: 80, mood: 80 };
    this.x = 100;
    this.y = 100;
    this.size = 100;
    this.targetX = 100;
    this.targetY = 100;
    this.idleTimer = 0;
  }
  isHungry() { return this.stats.hunger < 25; }
  isLowQi() { return this.stats.qi < 20; }
  isLowMood() { return this.stats.mood < 25; }
  isBusy() { return ['eating', 'sleeping', 'meditating', 'interacting'].includes(this.state); }
  setState(state) { this.state = state; }
  modifyStat(statName, value) {}
}

global.CONFIG = {
  IDLE_DURATION_MIN: 1000,
  IDLE_DURATION_MAX: 2000,
  INTERACTION_DISTANCE: 180,
  INTERACTIONS: {
    greet: { weight: 100, moodA: 1, moodB: 1, affection: 1, minAffection: 0 }
  }
};

test('Time Weather Renderer Integration', async (t) => {
  await t.test('SpriteView: renders sleeping sprite during night when idle', () => {
    const sv = new SpriteView();
    const pet = new MockPet('yueqi');

    // Day time + Idle -> Normal Idle
    pet.timePhase = 'day';
    pet.state = 'idle';
    assert.strictEqual(sv._resolveSpriteKey(pet), 'idle');
    assert.strictEqual(sv._resolveResource(pet).type, 'emoji'); // default fallback if no image

    // Night time + Idle -> Sleeping
    pet.timePhase = 'night';
    assert.strictEqual(sv._resolveSpriteKey(pet), 'sleeping');
    assert.strictEqual(sv._resolveResource(pet).src, 'assets/default/left_sleep.webp');

    // Evening + Idle -> Normal Idle
    pet.timePhase = 'evening';
    assert.strictEqual(sv._resolveSpriteKey(pet), 'idle');

    // Night time + Walking -> Walking (Sleeping should not override active states)
    pet.timePhase = 'night';
    pet.state = 'walking';
    assert.strictEqual(sv._resolveSpriteKey(pet), 'walkingLeft');
  });

  await t.test('MovementSystem: lowers movement frequency during night', () => {
    const ms = new MovementSystem(1920, 1080);
    const pet = new MockPet('yueqi');
    
    // We mock random to always trigger the 70% threshold
    const originalRandom = Math.random;
    
    // Test: night time falls into the 70% chance to sleep more
    Math.random = () => 0.1; 
    pet.timePhase = 'night';
    pet.state = 'idle';
    pet.idleTimer = 0;
    ms.update(pet, 16);
    assert.strictEqual(pet.state, 'idle', 'Pet should stay idle during night when random < 0.7');
    assert.ok(pet.idleTimer > 0, 'Idle timer should be extended');

    // Test: evening time should walk
    pet.timePhase = 'evening';
    pet.state = 'idle';
    pet.idleTimer = 0;
    ms.update(pet, 16);
    assert.strictEqual(pet.state, 'walking', 'Pet should start walking during evening');

    Math.random = originalRandom;
  });

  await t.test('InteractionSystem: lowers interaction frequency during night', () => {
    const is = new InteractionSystem();
    const petA = new MockPet('yueqi');
    const petB = new MockPet('shenjiu');

    // Set close enough to interact
    petA.x = 100;
    petB.x = 100;

    const originalRandom = Math.random;

    // Test: night time falls into 50% chance to skip interaction
    Math.random = () => 0.1;
    petA.timePhase = 'night';
    let result = is.update(petA, petB, 16);
    assert.strictEqual(result, null, 'Should skip interaction at night when random < 0.5');

    // Test: evening time does not skip
    petA.timePhase = 'evening';
    result = is.update(petA, petB, 16);
    assert.ok(result !== null, 'Should trigger interaction during evening');
    assert.strictEqual(result.key, 'greet');

    Math.random = originalRandom;
  });
});
