const assert = require('node:assert/strict');
const test = require('node:test');

const { CONFIG } = require('../src/data/config');

global.CONFIG = CONFIG;

const { NurtureSystem } = require('../src/systems/NurtureSystem');
const { InteractionSystem } = require('../src/systems/InteractionSystem');

function createPet() {
  return {
    x: 0,
    y: 0,
    size: 96,
    direction: 'right',
    isDragging: false,
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
    isBusy() {
      return this.state !== 'idle';
    },
  };
}

test('offline decay makes qi and mood visibly fall over one hour', () => {
  const pet = createPet();
  pet.stats.affection = 10; // set starting affection to verify decay
  const nurtureSystem = new NurtureSystem();

  nurtureSystem.applyOfflineDecay(pet, 60 * 60 * 1000);

  assert.equal(pet.stats.hunger, 56);
  assert.equal(pet.stats.qi, 76);
  assert.equal(pet.stats.mood, 46);
  // 1 hour = 0.5 points decay. Handle floating point precision.
  assert.equal(Math.round(pet.stats.affection * 10) / 10, 9.5); 
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

test('rest restores mood and a small amount of qi at a hunger cost', () => {
  const pet = createPet();
  const nurtureSystem = new NurtureSystem();

  pet.stats.qi = 50;
  pet.stats.mood = 40;
  const rested = nurtureSystem.rest(pet);

  assert.equal(rested, true);
  assert.equal(pet.stats.qi, 60);
  assert.equal(pet.stats.mood, 55);
  assert.equal(pet.stats.hunger, 70);
  assert.equal(pet.state, 'sleeping');
  assert.equal(pet.stateTimer, CONFIG.REST_DURATION);
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

test('share food uses the updated symmetric mood values', () => {
  const yueqi = createPet();
  const shenjiu = createPet();
  const interactionSystem = new InteractionSystem();

  interactionSystem.applyInteraction(yueqi, shenjiu, CONFIG.INTERACTIONS.shareFood);

  assert.equal(yueqi.stats.hunger, 75);
  assert.equal(shenjiu.stats.hunger, 90);
  assert.equal(yueqi.stats.mood, 73);
  assert.equal(shenjiu.stats.mood, 73);
});

test('share food switches to throwup presentation only when Shen Jiu would exceed full hunger', () => {
  const yueqi = createPet();
  const shenjiu = createPet();
  shenjiu.x = 10;
  const interactionSystem = new InteractionSystem();
  interactionSystem.pickInteraction = () => ({ key: 'shareFood', ...CONFIG.INTERACTIONS.shareFood });

  shenjiu.stats.hunger = 90;
  let interaction = interactionSystem.update(yueqi, shenjiu, 16);

  assert.equal(interaction.key, 'shareFood');
  assert.equal(interaction.overlayKey, 'shareFood');
  assert.equal(interaction.dialogue, null);
  assert.equal(shenjiu.stats.hunger, 100);

  interactionSystem.isInteracting = false;
  interactionSystem.cooldownTimer = 0;
  yueqi.state = 'idle';
  shenjiu.state = 'idle';
  shenjiu.stats.hunger = 91;

  interaction = interactionSystem.update(yueqi, shenjiu, 16);

  assert.equal(interaction.key, 'shareFood');
  assert.equal(interaction.overlayKey, 'throwup');
  assert.deepEqual(interaction.dialogue, {
    yueqi: '小九你怎么了？',
    shenjiu: '呕~~你要撑死我吗？！',
  });
  assert.equal(shenjiu.stats.hunger, 100);
});
