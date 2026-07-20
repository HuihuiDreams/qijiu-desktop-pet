const assert = require('node:assert/strict');
const test = require('node:test');

const MODULE_PATH = require.resolve('../src/main/services/PetVisibilityService');

function loadFreshService() {
  delete require.cache[MODULE_PATH];
  // eslint-disable-next-line global-require
  return require('../src/main/services/PetVisibilityService');
}

function createStubDeps() {
  const sent = [];
  let refreshCount = 0;
  const ipcHandlers = {};
  const mainWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, ...args) => sent.push([channel, ...args]),
    },
  };
  const deps = {
    ipcMain: {
      handle: (channel, handler) => { ipcHandlers[channel] = handler; },
    },
    windowManager: { mainWindow },
    trayManager: {
      refreshTrayMenu: () => { refreshCount += 1; },
    },
  };
  return {
    deps,
    sent,
    ipcHandlers,
    getRefreshCount: () => refreshCount,
  };
}

function lastVisibilityMessage(sent) {
  const messages = sent.filter((entry) => entry[0] === 'toggle-pet-visibility');
  return messages[messages.length - 1];
}

test('PetVisibilityService requires no direct electron dependency', () => {
  const source = require('node:fs').readFileSync(MODULE_PATH, 'utf8');
  assert.ok(!source.includes("require('electron')"), 'module must receive electron capabilities via injected deps only');
});

test('init registers the get-pet-visibility-state IPC handler via injected ipcMain', () => {
  const Service = loadFreshService();
  const { deps, ipcHandlers } = createStubDeps();
  Service.init(deps);

  assert.equal(typeof ipcHandlers['get-pet-visibility-state'], 'function');
  assert.deepEqual(ipcHandlers['get-pet-visibility-state'](), {
    visible: true,
    reason: 'visible',
    sources: { manual: false, meeting: false, pomodoro: false },
  });
});

test('priority: manual hide wins over meeting hide when both are active', () => {
  const Service = loadFreshService();
  const { deps } = createStubDeps();
  Service.init(deps);

  Service.hidePetManually();
  Service.hidePetForMeeting();

  const state = Service.getPetVisibilityState();
  assert.equal(state.visible, false);
  assert.equal(state.reason, 'manual');
  assert.deepEqual(state.sources, { manual: true, meeting: true, pomodoro: false });
});

test('priority: manual hide wins over pomodoro focus hide when both are active', () => {
  const Service = loadFreshService();
  const { deps } = createStubDeps();
  Service.init(deps);

  Service.hidePetManually();
  Service.enterPomodoroPetFocus();

  const state = Service.getPetVisibilityState();
  assert.equal(state.reason, 'manual');
  assert.deepEqual(state.sources, { manual: true, meeting: false, pomodoro: true });
});

test('priority: meeting hide wins over pomodoro focus hide when manual is inactive', () => {
  const Service = loadFreshService();
  const { deps } = createStubDeps();
  Service.init(deps);

  Service.enterPomodoroPetFocus();
  Service.hidePetForMeeting();

  const state = Service.getPetVisibilityState();
  assert.equal(state.reason, 'meeting');
  assert.deepEqual(state.sources, { manual: false, meeting: true, pomodoro: true });
});

test('sequential release: manual+meeting hidden together, releasing manual clears both (showPetManually semantics)', () => {
  const Service = loadFreshService();
  const { deps, sent } = createStubDeps();
  Service.init(deps);

  Service.hidePetManually();
  Service.hidePetForMeeting();
  assert.equal(Service.getPetVisibilityState().reason, 'manual');

  Service.showPetManually();
  const state = Service.getPetVisibilityState();
  assert.equal(state.visible, true);
  assert.equal(state.reason, 'visible');
  assert.deepEqual(state.sources, { manual: false, meeting: false, pomodoro: false });

  const lastMsg = lastVisibilityMessage(sent);
  assert.equal(lastMsg[1], true);
});

test('sequential release: meeting hide then meeting clear restores visibility when nothing else hides', () => {
  const Service = loadFreshService();
  const { deps, sent } = createStubDeps();
  Service.init(deps);

  Service.hidePetForMeeting();
  assert.equal(Service.getPetVisibilityState().reason, 'meeting');
  assert.equal(lastVisibilityMessage(sent)[1], false);

  Service.showPetAfterMeeting();
  assert.equal(Service.getPetVisibilityState().reason, 'visible');
  assert.equal(lastVisibilityMessage(sent)[1], true);
});

test('meeting hide is a no-op while manual hide is already active (no duplicate visibility push)', () => {
  const Service = loadFreshService();
  const { deps, sent } = createStubDeps();
  Service.init(deps);

  Service.hidePetManually();
  const countBefore = sent.filter((e) => e[0] === 'toggle-pet-visibility').length;

  Service.hidePetForMeeting();
  const countAfter = sent.filter((e) => e[0] === 'toggle-pet-visibility').length;

  assert.equal(Service.getPetVisibilityState().reason, 'manual');
  assert.equal(countAfter, countBefore, 'hidePetForMeeting must not resend visibility while manual hide already suppresses the pet');
});

test('pomodoro focus: entering focus hides the pet, pauses walking, and snapshots prior pause state', () => {
  const Service = loadFreshService();
  const { deps, sent } = createStubDeps();
  Service.init(deps);

  assert.equal(Service.getIsPaused(), false);
  Service.enterPomodoroPetFocus();

  assert.equal(Service.getPomodoroPetHidden(), true);
  assert.equal(Service.getIsPaused(), true);
  assert.equal(Service.getPetVisibilityState().reason, 'pomodoro');

  const pauseMsg = sent.find((e) => e[0] === 'toggle-pause');
  assert.deepEqual(pauseMsg, ['toggle-pause', true]);
  const visibilityMsg = lastVisibilityMessage(sent);
  assert.equal(visibilityMsg[1], false);
});

test('pomodoro focus: restoring focus un-hides the pet and replays the pre-focus pause state', () => {
  const Service = loadFreshService();
  const { deps, sent } = createStubDeps();
  Service.init(deps);

  // Pet was already paused by the user before entering focus.
  Service.setPaused(true);
  Service.enterPomodoroPetFocus();
  assert.equal(Service.getIsPaused(), true);

  Service.restorePomodoroPetFocus();
  assert.equal(Service.getPomodoroPetHidden(), false);
  assert.equal(Service.getIsPaused(), true, 'restoring focus must replay the snapshot (wasPaused=true), not force-unpause');
  assert.equal(Service.getPetVisibilityState().reason, 'visible');

  const pauseMessages = sent.filter((e) => e[0] === 'toggle-pause');
  // toggle-pause fired once for setPaused(true); enterPomodoroPetFocus found isPaused
  // already true so it did not re-fire; restorePomodoroPetFocus finds isPaused === wasPaused
  // (both true) so it also does not re-fire.
  assert.equal(pauseMessages.length, 1);
});

test('pomodoro focus: restoring focus resumes walking when pet was not paused beforehand', () => {
  const Service = loadFreshService();
  const { deps, sent } = createStubDeps();
  Service.init(deps);

  Service.enterPomodoroPetFocus();
  assert.equal(Service.getIsPaused(), true);

  Service.restorePomodoroPetFocus();
  assert.equal(Service.getIsPaused(), false);

  const pauseMessages = sent.filter((e) => e[0] === 'toggle-pause');
  assert.deepEqual(pauseMessages, [['toggle-pause', true], ['toggle-pause', false]]);
});

test('setPaused updates state and pushes toggle-pause only when the main window is alive', () => {
  const Service = loadFreshService();
  const { deps, sent } = createStubDeps();
  Service.init(deps);

  Service.setPaused(true);
  assert.equal(Service.getIsPaused(), true);
  assert.deepEqual(sent.filter((e) => e[0] === 'toggle-pause'), [['toggle-pause', true]]);

  deps.windowManager.mainWindow.isDestroyed = () => true;
  Service.setPaused(false);
  assert.equal(Service.getIsPaused(), false);
  // No new toggle-pause message: destroyed window must not receive sends.
  assert.deepEqual(sent.filter((e) => e[0] === 'toggle-pause'), [['toggle-pause', true]]);
});

test('sendPetVisibility is a no-op when there is no live main window', () => {
  const Service = loadFreshService();
  const { deps, sent } = createStubDeps();
  deps.windowManager.mainWindow = null;
  Service.init(deps);

  assert.doesNotThrow(() => Service.showPetManually());
  assert.equal(sent.length, 0);
});
