const assert = require('node:assert/strict');
const test = require('node:test');

const { TimeSystem } = require('../src/systems/TimeSystem');

function createPet(id) {
  return {
    id,
    x: 10,
    y: 20,
    stats: {
      affection: 1,
      hunger: 2,
      qi: 3,
      mood: 4,
    },
  };
}

test('TimeSystem.save stores the selected skinId with pet state', async () => {
  const saved = {};
  global.window = {
    electronAPI: {
      saveData: async (key, value) => {
        saved.key = key;
        saved.value = value;
      },
    },
  };

  const timeSystem = new TimeSystem();
  await timeSystem.save(createPet('yueqi'), createPet('shenjiu'), 'qban');

  assert.equal(saved.key, 'petState');
  assert.equal(saved.value.skinId, 'qban');
  assert.ok(saved.value.lastVisibleTime, 'should persist lastVisibleTime');
});

test('TimeSystem.save persists explicit lastVisibleTime', async () => {
  const saved = {};
  global.window = {
    electronAPI: {
      saveData: async (key, value) => {
        saved.key = key;
        saved.value = value;
      },
    },
  };

  const ts = 1700000000000;
  const timeSystem = new TimeSystem();
  await timeSystem.save(createPet('yueqi'), createPet('shenjiu'), 'default', ts);

  assert.equal(saved.value.lastVisibleTime, ts);
});

test('TimeSystem.load returns persisted skinId', async () => {
  const savedAt = Date.now() - 1000;
  global.window = {
    electronAPI: {
      loadData: async () => ({
        petA: { id: 'yueqi' },
        petB: { id: 'shenjiu' },
        skinId: 'qban',
        savedAt,
      }),
    },
  };

  const loaded = await new TimeSystem().load();

  assert.equal(loaded.skinId, 'qban');
  assert.equal(loaded.petAData.id, 'yueqi');
});

test('TimeSystem.load returns persisted lastVisibleTime', async () => {
  const ts = 1700000000000;
  global.window = {
    electronAPI: {
      loadData: async () => ({
        petA: { id: 'yueqi' },
        petB: { id: 'shenjiu' },
        savedAt: Date.now(),
        lastVisibleTime: ts,
      }),
    },
  };

  const loaded = await new TimeSystem().load();

  assert.equal(loaded.lastVisibleTime, ts);
});

test('TimeSystem.load falls back to default for legacy saves without skinId', async () => {
  global.window = {
    electronAPI: {
      loadData: async () => ({
        petA: { id: 'yueqi' },
        petB: { id: 'shenjiu' },
        savedAt: Date.now(),
      }),
    },
  };

  const loaded = await new TimeSystem().load();

  assert.equal(loaded.skinId, 'default');
  assert.equal(loaded.lastVisibleTime, undefined, 'legacy saves have no lastVisibleTime');
});

test('TimeSystem.deserializePet restores saved zero coordinates', () => {
  const pet = createPet('yueqi');
  const timeSystem = new TimeSystem();

  timeSystem.deserializePet(pet, {
    x: 0,
    y: 0,
    stats: {},
  });

  assert.equal(pet.x, 0);
  assert.equal(pet.y, 0);
});
