const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const CONTROLLER_PATH = require.resolve('../src/main/services/MeetingDetectorController');

function loadFreshController(createMeetingDetector) {
  const originalLoad = Module._load;
  delete require.cache[CONTROLLER_PATH];

  Module._load = function loadMeetingDetector(request, parent, isMain) {
    if (request === '../../../meetingDetector' && parent?.filename === CONTROLLER_PATH) {
      return { createMeetingDetector };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    // eslint-disable-next-line global-require
    return require('../src/main/services/MeetingDetectorController');
  } finally {
    Module._load = originalLoad;
  }
}

function withPlatform(platform, callback) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    return callback();
  } finally {
    Object.defineProperty(process, 'platform', originalDescriptor);
  }
}

test('MeetingDetectorController relays detector transitions to the injected visibility service', () => {
  const visibilityEvents = [];
  const detectors = [];
  const Controller = loadFreshController((options) => {
    const detector = {
      start: () => { detector.started = true; },
      stop: () => { detector.stopped = true; },
      options,
      started: false,
      stopped: false,
    };
    detectors.push(detector);
    return detector;
  });

  Controller.init({
    hidePetForMeeting: () => visibilityEvents.push('hidden-for-meeting'),
    showPetAfterMeeting: () => visibilityEvents.push('shown-after-meeting'),
  });

  withPlatform('win32', () => Controller.startMeetingDetector());
  detectors[0].options.onMeetingStart({ detectedApps: ['Teams'] });
  detectors[0].options.onMeetingEnd({ detectedApps: [] });

  assert.equal(detectors.length, 1);
  assert.equal(detectors[0].started, true);
  assert.deepEqual(visibilityEvents, ['hidden-for-meeting', 'shown-after-meeting']);
});

test('MeetingDetectorController replaces an existing detector and does not start on unsupported platforms', () => {
  const lifecycleEvents = [];
  const Controller = loadFreshController(() => {
    const id = lifecycleEvents.filter((event) => event.startsWith('created')).length + 1;
    lifecycleEvents.push(`created-${id}`);
    return {
      start: () => lifecycleEvents.push(`started-${id}`),
      stop: () => lifecycleEvents.push(`stopped-${id}`),
    };
  });

  Controller.init({
    hidePetForMeeting: () => {},
    showPetAfterMeeting: () => {},
  });

  withPlatform('darwin', () => {
    Controller.startMeetingDetector();
    Controller.startMeetingDetector();
    Controller.stopMeetingDetector();
  });
  withPlatform('linux', () => Controller.startMeetingDetector());

  assert.deepEqual(lifecycleEvents, [
    'created-1',
    'started-1',
    'stopped-1',
    'created-2',
    'started-2',
    'stopped-2',
  ]);
});
