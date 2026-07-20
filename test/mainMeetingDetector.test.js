const assert = require('node:assert/strict');
const test = require('node:test');
const { readMainProcessSource } = require('./helpers/sourceCorpus');

const mainSource = readMainProcessSource();

test('main process wires meeting detector lifecycle', () => {
  assert.ok(mainSource.includes("require('../../meetingDetector')"));
  assert.ok(mainSource.includes('let meetingDetector = null'));
  assert.ok(mainSource.includes('function startMeetingDetector()'));
  assert.ok(mainSource.includes('function stopMeetingDetector()'));
  assert.ok(mainSource.includes('meetingDetector.stop()'));
});

test('meeting detector starts only after renderer visibility listener can be installed', () => {
  const loadHandlerIndex = mainSource.indexOf("mainWindow.webContents.on('did-finish-load'");
  const detectorStartIndex = mainSource.indexOf('startMeetingDetector();');
  const readyCreateWindowIndex = Math.max(mainSource.indexOf('setTimeout(createWindow, 500)'), mainSource.indexOf('createWindow();'));

  assert.notEqual(loadHandlerIndex, -1);
  assert.notEqual(detectorStartIndex, -1);
  assert.notEqual(readyCreateWindowIndex, -1);
  assert.ok(detectorStartIndex > loadHandlerIndex);
  assert.ok(detectorStartIndex < readyCreateWindowIndex);
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
