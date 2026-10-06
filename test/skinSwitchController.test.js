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

test('applySkinById executes latest pending request when a switch is in flight (slow B -> cancel A)', async () => {
  const skinManager = makeSkinManagerStub();
  let resolveApplyB;
  let applyBCalled = false;
  let applyDefaultCalled = false;

  skinManager.applySkin = (skinId) => new Promise((resolve) => {
    if (skinId === 'birds') {
      applyBCalled = true;
      resolveApplyB = () => resolve({ skinId });
    } else {
      applyDefaultCalled = true;
      resolve({ skinId });
    }
  });

  const electronAPI = makeElectronApiStub();
  const saveCalls = [];
  const controller = new SkinSwitchController({
    skinManager,
    skinTargets: {},
    electronAPI,
    saveCurrentState: async () => saveCalls.push(electronAPI.setCurrentSkinCalls[electronAPI.setCurrentSkinCalls.length - 1]),
  });

  const callB = controller.applySkinById('birds');
  assert.equal(controller.isSwitching(), true);
  assert.equal(applyBCalled, true);

  // User cancels back to default while B is still loading
  const callDefault = controller.applySkinById('default');
  assert.equal(controller.isSwitching(), true);

  // Now B finishes loading
  resolveApplyB();
  await callB;
  await callDefault;

  assert.equal(applyDefaultCalled, true, 'rollback to default must be executed');
  assert.equal(controller.isSwitching(), false);
  // Final state in electronAPI and saveCalls must be 'default'
  assert.equal(electronAPI.setCurrentSkinCalls[electronAPI.setCurrentSkinCalls.length - 1], 'default');
  // B was superseded, so it should not have written 'birds' or final save must be 'default'
  assert.deepEqual(electronAPI.setCurrentSkinCalls, ['default']);
  assert.deepEqual(saveCalls, ['default']);
});

test('applySkinById replaces intermediate pending request with newest request (B -> C -> cancel A)', async () => {
  const skinManager = makeSkinManagerStub(['default', 'birds', 'animal_ears']);
  let resolveApplyB;
  const appliedSequence = [];

  skinManager.applySkin = (skinId) => new Promise((resolve) => {
    appliedSequence.push(skinId);
    if (skinId === 'birds') {
      resolveApplyB = () => resolve({ skinId });
    } else {
      resolve({ skinId });
    }
  });

  const electronAPI = makeElectronApiStub(['default', 'birds', 'animal_ears']);
  const controller = new SkinSwitchController({
    skinManager,
    skinTargets: {},
    electronAPI,
    saveCurrentState: async () => {},
  });

  const callB = controller.applySkinById('birds');
  // While B is loading, user clicks C, then quickly cancels to A (default)
  const callC = controller.applySkinById('animal_ears');
  const callA = controller.applySkinById('default');

  resolveApplyB();
  const resB = await callB;
  const resC = await callC;
  const resA = await callA;

  // C was superseded by A, so it was not applied
  assert.equal(resC.superseded, true);
  assert.deepEqual(appliedSequence, ['birds', 'default']);
  assert.deepEqual(electronAPI.setCurrentSkinCalls, ['default']);
  assert.equal(controller.isSwitching(), false);
});

test('applySkinById recovers and executes pending request even if current switch throws an error', async () => {
  const skinManager = makeSkinManagerStub();
  let rejectApplyB;
  let applyDefaultCalled = false;

  skinManager.applySkin = (skinId) => new Promise((resolve, reject) => {
    if (skinId === 'birds') {
      rejectApplyB = () => reject(new Error('failed to load birds image'));
    } else {
      applyDefaultCalled = true;
      resolve({ skinId });
    }
  });

  const electronAPI = makeElectronApiStub();
  const controller = new SkinSwitchController({
    skinManager,
    skinTargets: {},
    electronAPI,
    saveCurrentState: async () => {},
  });

  const callB = controller.applySkinById('birds');
  const callDefault = controller.applySkinById('default');

  rejectApplyB();
  await callB;
  await callDefault;

  assert.equal(applyDefaultCalled, true, 'pending default must execute even after B failed');
  assert.equal(controller.isSwitching(), false);
  assert.deepEqual(electronAPI.setCurrentSkinCalls, ['default']);
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
