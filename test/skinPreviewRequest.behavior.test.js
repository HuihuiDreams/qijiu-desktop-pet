const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { setupElectronMock } = require('./helpers/mockElectron');
const handlers = {};
const restoreRequire = setupElectronMock({
  app: { getAppPath: () => path.join(__dirname, '..') },
  ipcMain: { handle: (channel, handler) => { handlers[channel] = handler; } },
});
const SkinService = require('../src/main/services/SkinService');
restoreRequire();

function createHarness() {
  const stored = { petState: { skinId: 'default', score: 10 } };
  const messages = [];
  let closeCount = 0;
  let originalSkinId = 'default';
  const mainWindow = {
    isDestroyed: () => false,
    webContents: {
      id: 1,
      isDestroyed: () => false,
      send: (channel, skinId, options) => { messages.push({ channel, skinId, options }); },
    },
  };
  const selectorWindow = { isDestroyed: () => false, webContents: { id: 2 } };
  const selectorEvent = { sender: selectorWindow.webContents };
  const mainEvent = { sender: mainWindow.webContents };
  SkinService.setCurrentSkinId('default');
  SkinService.init({
    windowManager: { mainWindow, skinSelectorWindow: selectorWindow },
    skinSelectorWindowModule: {
      getSkinSelectorOriginalSkinId: () => originalSkinId,
      setSkinSelectorOriginalSkinId: (skinId) => { originalSkinId = skinId; },
      setSkinSelectorSelectionInProgress: () => {},
      closeSkinSelectorWindow: () => { closeCount += 1; },
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
    preview: async (skinId) => {
      const result = await handlers['preview-skin'](selectorEvent, skinId);
      assert.equal(result.success, true);
      return messages.filter((message) => message.channel === 'switch-skin' && message.options.isPreview).at(-1);
    },
    report: (request, success) => handlers['report-skin-loaded'](mainEvent, request.skinId, {
      requestId: request.options.requestId,
      success,
      ...(success ? {} : { error: 'Image failed to load' }),
    }),
    confirm: () => handlers['confirm-skin'](selectorEvent),
    cancel: () => handlers['cancel-skin'](selectorEvent),
    snapshot: () => ({
      confirmed: SkinService.getConfirmedSkinId(),
      preview: SkinService.getPreviewSkinId(),
      stored: { ...stored.petState },
      closeCount,
    }),
  };
}

function observe(promise) {
  const observed = { settled: false, promise: null };
  observed.promise = promise.then((result) => {
    observed.settled = true;
    return result;
  });
  return observed;
}

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('revisiting birds waits for the latest request and ignores older birds success and failure reports', async () => {
  const harness = createHarness();
  const oldBirds = await harness.preview('birds');
  await harness.report(oldBirds, true);
  const school = await harness.preview('school_au');
  const latestBirds = await harness.preview('birds');
  const confirmation = observe(harness.confirm());
  await flushAsyncWork();
  const beforeLatestReport = { ...harness.snapshot(), settled: confirmation.settled };

  await harness.report(oldBirds, true);
  await flushAsyncWork();
  const afterOldSuccess = { ...harness.snapshot(), settled: confirmation.settled };
  await harness.report(oldBirds, false);
  await flushAsyncWork();
  const afterOldFailure = { ...harness.snapshot(), settled: confirmation.settled };

  await harness.report(latestBirds, true);
  const result = await confirmation.promise;

  const pendingSnapshot = {
    confirmed: 'default', preview: 'birds', stored: { skinId: 'default', score: 10 }, closeCount: 0, settled: false,
  };
  assert.deepEqual(beforeLatestReport, pendingSnapshot, 'the earlier birds load must not confirm a new birds preview');
  assert.deepEqual(afterOldSuccess, pendingSnapshot, 'an older success must not resolve the newest confirmation');
  assert.deepEqual(afterOldFailure, pendingSnapshot, 'an older failure must not resolve the newest confirmation');
  assert.ok(latestBirds.options.requestId != null, 'each preview must expose its request ID to the renderer');
  assert.equal(new Set([oldBirds.options.requestId, school.options.requestId, latestBirds.options.requestId]).size, 3);
  assert.equal(result.success, true);
  assert.deepEqual(harness.snapshot(), {
    confirmed: 'birds', preview: null, stored: { skinId: 'birds', score: 10 }, closeCount: 1,
  });
});

test('an older birds success cannot replace the latest birds load failure', async () => {
  const harness = createHarness();
  const oldBirds = await harness.preview('birds');
  await harness.report(oldBirds, true);
  await harness.preview('school_au');
  const latestBirds = await harness.preview('birds');

  await harness.report(latestBirds, false);
  await harness.report(oldBirds, true);
  const result = await harness.confirm();

  assert.equal(result.success, false);
  assert.equal(result.error.code, 'LOAD_FAILED');
  assert.deepEqual(harness.snapshot(), {
    confirmed: 'default', preview: 'birds', stored: { skinId: 'default', score: 10 }, closeCount: 0,
  });
});

test('changing preview while confirmation waits rejects the old confirmation and keeps the new preview open', async () => {
  const harness = createHarness();
  const birds = await harness.preview('birds');
  const confirmation = harness.confirm();
  const school = await harness.preview('school_au');
  await harness.report(birds, true);
  const result = await confirmation;
  const afterOldConfirmation = harness.snapshot();

  // Complete the new request as well so no load wait is left behind.
  await harness.report(school, true);

  assert.equal(result.success, false, 'a confirmation for a superseded preview must fail');
  assert.deepEqual(afterOldConfirmation, {
    confirmed: 'default', preview: 'school_au', stored: { skinId: 'default', score: 10 }, closeCount: 0,
  });
});

test('cancel after a successful report is queued rejects the old confirmation without closing a new preview', async () => {
  const harness = createHarness();
  const birds = await harness.preview('birds');
  const confirmation = harness.confirm();

  // IPC can receive cancel and a new preview before the awaiting confirm resumes.
  const oldReport = harness.report(birds, true);
  harness.cancel();
  const newPreview = harness.preview('school_au');
  await oldReport;
  const school = await newPreview;
  const result = await confirmation;
  const afterOldConfirmation = harness.snapshot();
  await harness.report(school, true);

  assert.equal(result.success, false, 'cancel must invalidate a confirmation whose load just finished');
  assert.deepEqual(afterOldConfirmation, {
    confirmed: 'default', preview: 'school_au', stored: { skinId: 'default', score: 10 }, closeCount: 1,
  });
});
