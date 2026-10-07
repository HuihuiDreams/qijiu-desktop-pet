const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { setupElectronMock } = require('./helpers/mockElectron');
const { SkinManager } = require('../src/systems/SkinManager');
const { SkinSwitchController } = require('../src/systems/SkinSwitchController');
const { SpriteView } = require('../src/pet/SpriteView');

const handlers = {};
const restoreRequire = setupElectronMock({
  app: { getAppPath: () => path.join(__dirname, '..') },
  ipcMain: { handle: (channel, handler) => { handlers[channel] = handler; } },
});
const SkinService = require('../src/main/services/SkinService');
restoreRequire();

function createSkinLoadHarness(t, shouldFail) {
  const previousImage = global.Image;
  const imageRequests = [];
  global.Image = class FakeImage {
    set src(resource) {
      imageRequests.push(resource);
      queueMicrotask(() => {
        if (shouldFail(resource)) this.onerror?.(new Error('Image failed to load'));
        else this.onload?.();
      });
    }
  };
  t.after(() => {
    if (previousImage === undefined) delete global.Image;
    else global.Image = previousImage;
  });

  const stored = { petState: { skinId: 'default', score: 10 } };
  const renderWork = [];
  let controller;
  const mainWindow = {
    isDestroyed: () => false,
    webContents: {
      id: 1,
      isDestroyed: () => false,
      send: (channel, skinId, options) => {
        if (channel === 'switch-skin') {
          renderWork.push(controller.applySkinById(skinId, options));
        }
      },
    },
  };
  const selectorWindow = { isDestroyed: () => false, webContents: { id: 2 } };
  const selectorEvent = { sender: selectorWindow.webContents };
  const mainEvent = { sender: mainWindow.webContents };
  const skinManager = new SkinManager();
  skinManager.setAvailableSkins(['default', 'birds', 'animal_ears']);

  const createPet = (id) => ({
    id,
    updateSkin: function (skinPaths) {
      this.image = skinPaths.image;
      this.imageScale = skinPaths.imageScale;
      this.sprites = skinPaths.sprites;
    },
  });
  const skinTargets = {
    petA: createPet('yueqi'),
    petB: createPet('shenjiu'),
    spriteView: new SpriteView(),
    renderer: { setSkinPrefix(value) { this.skinPrefix = value; } },
  };
  controller = new SkinSwitchController({
    skinManager,
    skinTargets,
    electronAPI: {
      reportSkinLoaded: (skinId, result) => handlers['report-skin-loaded'](mainEvent, skinId, result),
      setCurrentSkin: (skinId) => handlers['set-current-skin'](mainEvent, skinId),
    },
    saveCurrentState: async () => {
      stored.petState = { ...stored.petState, skinId: skinManager.getCurrentSkin() };
    },
  });

  SkinService.setCurrentSkinId('default');
  SkinService.init({
    windowManager: { mainWindow, skinSelectorWindow: selectorWindow },
    skinSelectorWindowModule: {
      setSkinSelectorSelectionInProgress: () => {},
      setSkinSelectorOriginalSkinId: () => {},
      closeSkinSelectorWindow: () => {},
    },
    sendPomodoroState: () => {},
    trayManager: { refreshTrayMenu: () => {} },
    StoreManager: {
      getStore: () => ({
        get: (key) => stored[key],
        set: (key, value) => { stored[key] = value; },
      }),
    },
  });

  return {
    stored,
    imageRequests,
    skinManager,
    skinTargets,
    preview: async (skinId = 'birds') => {
      const result = await handlers['preview-skin'](selectorEvent, skinId);
      assert.equal(result.success, true);
      await renderWork.at(-1);
    },
    confirm: async () => {
      const result = await handlers['confirm-skin'](selectorEvent);
      await Promise.all(renderWork);
      return result;
    },
  };
}

for (const resource of [
  'left.webp',
  'right.webp',
  'yueqi/walk_left01.webp',
  'shenjiu/walk_right01.webp',
]) {
  test(`confirm-skin rejects when required birds resource ${resource} fails to load`, async (t) => {
    const failedUrl = `pet-asset://skin/birds/${resource}`;
    const harness = createSkinLoadHarness(t, (url) => url === failedUrl);

    await harness.preview('animal_ears');
    const previousPaths = harness.skinManager.buildPaths('animal_ears');
    await harness.preview();
    const result = await harness.confirm();

    assert.equal(harness.skinManager.getCurrentSkin(), 'animal_ears');
    for (const key of ['petA', 'petB']) {
      const pet = harness.skinTargets[key];
      assert.equal(pet.image, previousPaths[key].image);
      assert.equal(pet.imageScale, previousPaths[key].imageScale);
      assert.deepEqual(pet.sprites, previousPaths[key].sprites);
      assert.equal(pet._sv_lastResource, null);
      assert.equal(pet._sv_frameIndex, 0);
    }
    assert.deepEqual(harness.skinTargets.spriteView.imageMap, previousPaths.imageMap);
    assert.equal(harness.skinTargets.renderer.skinPrefix, previousPaths.overlayPrefix);

    assert.ok(harness.imageRequests.includes(failedUrl), 'the failing resource must have been requested');
    assert.equal(result.success, false, 'a failed required image must prevent confirmation');
    assert.equal(result.error.code, 'LOAD_FAILED');
    assert.equal(SkinService.getConfirmedSkinId(), 'default');
    assert.deepEqual(harness.stored.petState, { skinId: 'default', score: 10 });

    await harness.preview('default');
    assert.equal(harness.skinManager.getCurrentSkin(), 'default');
    assert.equal((await harness.confirm()).success, true);
  });
}

test('confirm-skin accepts birds when only optional cultivate action images fail to load', async (t) => {
  const harness = createSkinLoadHarness(t, (url) => url.endsWith('_cultivate.webp'));

  await harness.preview();
  assert.equal(SkinService.getConfirmedSkinId(), 'default', 'preview must not commit the skin');
  assert.equal(harness.stored.petState.skinId, 'default');
  const result = await harness.confirm();

  assert.ok(harness.imageRequests.some((url) => url.endsWith('_cultivate.webp')));
  assert.equal(result.success, true, 'optional action images must not block confirmation');
  assert.equal(SkinService.getConfirmedSkinId(), 'birds');
  assert.deepEqual(harness.stored.petState, { skinId: 'birds', score: 10 });
});

test('confirm-skin checks failed loading when preview returns to the confirmed skin', async (t) => {
  const harness = createSkinLoadHarness(t, (url) => url === 'pet-asset://skin/default/left.webp');

  await harness.preview();
  await harness.preview('default');
  const result = await harness.confirm();

  assert.equal(result.success, false);
  assert.equal(result.error.code, 'LOAD_FAILED');
  assert.equal(SkinService.getConfirmedSkinId(), 'default');
  assert.deepEqual(harness.stored.petState, { skinId: 'default', score: 10 });
});

test('initial SpriteView attachment keeps startup available when default images fail', async (t) => {
  const previousImage = global.Image;
  global.Image = class FakeImage {
    set src(resource) { queueMicrotask(() => this.onerror?.()); }
  };
  t.after(() => { global.Image = previousImage; });
  const pet = { id: 'yueqi', image: 'pet-asset://skin/default/left.webp', sprites: {} };

  await assert.doesNotReject(new SpriteView().attach(pet));
});
