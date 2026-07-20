const assert = require('node:assert/strict');
const test = require('node:test');

const { SkinSwitchController } = require('../src/systems/SkinSwitchController');

function makeSkinManagerStub(availableIds = ['default', 'birds']) {
  const applyCalls = [];
  return {
    applyCalls,
    getAvailableSkins: () => availableIds.map((id) => ({ id, displayName: id })),
    applySkin: async (skinId, targets) => {
      applyCalls.push({ skinId, targets });
      return { skinId };
    },
  };
}

function makeElectronApiStub(skinIds = ['default', 'birds']) {
  const setCurrentSkinCalls = [];
  return {
    setCurrentSkinCalls,
    getAvailableSkins: async () => skinIds,
    setCurrentSkin: (skinId) => setCurrentSkinCalls.push(skinId),
  };
}

test('applySkinById falls back to default for an unknown skin id', async () => {
  const skinManager = makeSkinManagerStub(['default', 'birds']);
  const electronAPI = makeElectronApiStub();
  const controller = new SkinSwitchController({
    skinManager,
    skinTargets: { petA: {}, petB: {} },
    electronAPI,
    saveCurrentState: async () => {},
  });

  await controller.applySkinById('does-not-exist');

  assert.equal(skinManager.applyCalls.length, 1);
  assert.equal(skinManager.applyCalls[0].skinId, 'default');
  assert.deepEqual(electronAPI.setCurrentSkinCalls, ['default']);
});

test('applySkinById ignores concurrent calls while a switch is already in flight', async () => {
  const skinManager = makeSkinManagerStub();
  let resolveApply;
  skinManager.applySkin = (skinId) => new Promise((resolve) => {
    resolveApply = () => resolve({ skinId });
  });
  const electronAPI = makeElectronApiStub();
  const controller = new SkinSwitchController({
    skinManager,
    skinTargets: {},
    electronAPI,
    saveCurrentState: async () => {},
  });

  const firstCall = controller.applySkinById('birds');
  assert.equal(controller.isSwitching(), true);
  await controller.applySkinById('default'); // should be a no-op while switching

  resolveApply();
  await firstCall;

  assert.deepEqual(electronAPI.setCurrentSkinCalls, ['birds']);
  assert.equal(controller.isSwitching(), false);
});

test('applySkinById skips saveCurrentState when persist is false, but still applies and reports the skin', async () => {
  const skinManager = makeSkinManagerStub();
  const electronAPI = makeElectronApiStub();
  const saveCalls = [];
  const controller = new SkinSwitchController({
    skinManager,
    skinTargets: {},
    electronAPI,
    saveCurrentState: async () => saveCalls.push(Date.now()),
  });

  await controller.applySkinById('birds', { persist: false });

  assert.equal(saveCalls.length, 0);
  assert.deepEqual(electronAPI.setCurrentSkinCalls, ['birds']);
});

test('applySkinById calls saveCurrentState by default (persist not specified)', async () => {
  const skinManager = makeSkinManagerStub();
  const electronAPI = makeElectronApiStub();
  const saveCalls = [];
  const controller = new SkinSwitchController({
    skinManager,
    skinTargets: {},
    electronAPI,
    saveCurrentState: async () => saveCalls.push(true),
  });

  await controller.applySkinById('birds');

  assert.equal(saveCalls.length, 1);
});

test('applySkinById clears any active interaction overlay before switching', async () => {
  const skinManager = makeSkinManagerStub();
  const electronAPI = makeElectronApiStub();
  let overlayCleared = false;
  const controller = new SkinSwitchController({
    skinManager,
    skinTargets: {},
    electronAPI,
    saveCurrentState: async () => {},
    clearInteractionOverlay: () => { overlayCleared = true; },
  });

  await controller.applySkinById('birds');

  assert.equal(overlayCleared, true);
});

test('applySkinById swallows errors from skinManager.applySkin and resets the in-flight flag', async () => {
  const skinManager = makeSkinManagerStub();
  skinManager.applySkin = async () => { throw new Error('boom'); };
  const electronAPI = makeElectronApiStub();
  const controller = new SkinSwitchController({
    skinManager,
    skinTargets: {},
    electronAPI,
    saveCurrentState: async () => {},
  });

  await assert.doesNotReject(() => controller.applySkinById('birds'));
  assert.equal(controller.isSwitching(), false);
});

test('refreshAvailableSkins forwards the skin id list from electronAPI into SkinManager', async () => {
  const skinManager = makeSkinManagerStub();
  const setAvailableCalls = [];
  skinManager.setAvailableSkins = (ids) => setAvailableCalls.push(ids);
  const electronAPI = makeElectronApiStub(['default', 'animal_ears']);
  const controller = new SkinSwitchController({ skinManager, electronAPI });

  await controller.refreshAvailableSkins();

  assert.deepEqual(setAvailableCalls, [['default', 'animal_ears']]);
});

test('refreshAvailableSkins does not touch SkinManager when electronAPI rejects', async () => {
  const skinManager = makeSkinManagerStub();
  const setAvailableCalls = [];
  skinManager.setAvailableSkins = (ids) => setAvailableCalls.push(ids);
  const electronAPI = { getAvailableSkins: async () => { throw new Error('offline'); } };
  const controller = new SkinSwitchController({ skinManager, electronAPI });

  await assert.doesNotReject(() => controller.refreshAvailableSkins());
  assert.deepEqual(setAvailableCalls, []);
});
