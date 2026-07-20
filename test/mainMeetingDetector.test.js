const assert = require('node:assert/strict');
const test = require('node:test');
const { readMainProcessSource } = require('./helpers/sourceCorpus');

const mainSource = readMainProcessSource();

test('main process wires meeting detector lifecycle', () => {
  assert.ok(mainSource.includes("require('../../../meetingDetector')"));
  assert.ok(mainSource.includes('let meetingDetector = null'));
  assert.ok(mainSource.includes('function startMeetingDetector()'));
  assert.ok(mainSource.includes('function stopMeetingDetector()'));
  assert.ok(mainSource.includes('meetingDetector.stop()'));
});

test('meeting detector starts only after renderer visibility listener can be installed', () => {
  // createWindow() (and its did-finish-load handler) lives in PetWindow.js
  // since AppLifecycle Decomposition Phase 8, so this asserts the ordering
  // within the handler body itself rather than against the call site.
  const loadHandlerIndex = mainSource.indexOf("mainWindow.webContents.on('did-finish-load'");
  const detectorStartIndex = mainSource.indexOf('startMeetingDetector();', loadHandlerIndex);
  const handlerEndIndex = mainSource.indexOf('});', loadHandlerIndex);

  assert.notEqual(loadHandlerIndex, -1);
  assert.notEqual(detectorStartIndex, -1);
  assert.notEqual(handlerEndIndex, -1);
  assert.ok(detectorStartIndex > loadHandlerIndex, 'meeting detector must start inside the did-finish-load handler');
  assert.ok(detectorStartIndex < handlerEndIndex, 'meeting detector start call must remain within the did-finish-load handler body');
  assert.ok(mainSource.includes('sendPetVisibility(!isPetCurrentlyHidden());'));
});

test('main process keeps meeting hidden state separate from manual hidden state', () => {
  assert.ok(mainSource.includes('let meetingHidden = false'));
  assert.ok(mainSource.includes('function isPetCurrentlyHidden()'));
  assert.ok(mainSource.includes('return petHidden || meetingHidden'));
  assert.ok(mainSource.includes('function hidePetForMeeting('));
  assert.ok(mainSource.includes('function showPetAfterMeeting('));
});

test('manual show clears meeting auto-hide state', () => {
  assert.ok(mainSource.includes('meetingHidden = false;'));
  assert.ok(mainSource.includes('sendPetVisibility(true);'));
});

test('tray label reflects combined hidden state', () => {
  assert.ok(mainSource.includes('isPetCurrentlyHidden() ? trayMenuLabel(\'trayShowPet\') : trayMenuLabel(\'trayHidePet\')'));
});

test('break reminder stays quiet while meeting-hidden', () => {
  assert.ok(mainSource.includes('if (isPetCurrentlyHidden()) return false;'));
});
