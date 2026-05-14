const assert = require('node:assert/strict');
const test = require('node:test');

const { CONFIG } = require('../src/data/config');

global.CONFIG = CONFIG;

const { NurtureSystem } = require('../src/systems/NurtureSystem');
const { InteractionSystem } = require('../src/systems/InteractionSystem');

function createPet() {
  return {
    stats: {
      affection: 0,
      hunger: 80,
      qi: 100,
      mood: 70,
    },
    state: 'idle',
    stateTimer: 0,
    idleTimer: 0,
    modifyStat(key, delta) {
      this.stats[key] = Math.max(0, Math.min(100, this.stats[key] + delta));
    },
    setState(newState) {
      this.state = newState;
    },
  };
}

test('offline decay makes qi and mood visibly fall over one hour', () => {
  const pet = createPet();
  const nurtureSystem = new NurtureSystem();

  nurtureSystem.applyOfflineDecay(pet, 60 * 60 * 1000);

  assert.equal(pet.stats.hunger, 56);
  assert.equal(pet.stats.qi, 76);
  assert.equal(pet.stats.mood, 46);
});

test('solo meditation restores one qi per second', () => {
  const pet = createPet();
  const nurtureSystem = new NurtureSystem();

  pet.stats.qi = 50;
  pet.state = 'meditating';
  pet.stateTimer = CONFIG.MEDITATE_DURATION;
  nurtureSystem.update(pet, 10 * 1000);

  assert.equal(pet.stats.qi, 60);
});

test('automatic interactions can happen once per minute', () => {
  assert.equal(CONFIG.INTERACTION_COOLDOWN, 60 * 1000);
});

test('cultivating together restores more qi than solo meditation', () => {
  const soloMeditationQi = CONFIG.MEDITATE_QI_RATE * (CONFIG.MEDITATE_DURATION / 1000);
  const pairedMeditationQi = Math.round(soloMeditationQi * CONFIG.CULTIVATE_QI_MULTIPLIER);

  assert.equal(CONFIG.MEDITATE_QI_RATE, 1);
  assert.equal(CONFIG.CULTIVATE_QI_MULTIPLIER, 1.5);
  assert.equal(CONFIG.INTERACTIONS.cultivate.qiA, pairedMeditationQi);
  assert.equal(CONFIG.INTERACTIONS.cultivate.qiB, pairedMeditationQi);
  assert.ok(pairedMeditationQi > soloMeditationQi);
});

test('share food uses the original asymmetric reward values', () => {
  const yueqi = createPet();
  const shenjiu = createPet();
  const interactionSystem = new InteractionSystem();

  interactionSystem.applyInteraction(yueqi, shenjiu, CONFIG.INTERACTIONS.shareFood);

  assert.equal(yueqi.stats.hunger, 75);
  assert.equal(shenjiu.stats.hunger, 90);
  assert.equal(yueqi.stats.mood, 78);
  assert.equal(shenjiu.stats.mood, 73);
});
