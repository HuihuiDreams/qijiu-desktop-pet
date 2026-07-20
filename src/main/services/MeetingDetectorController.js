/**
 * src/main/services/MeetingDetectorController.js
 * 会议自动隐藏检测器的生命周期管理。init(deps) 模式，deps 提供
 * PetVisibilityService 的 hidePetForMeeting/showPetAfterMeeting 回调。
 */
const { createMeetingDetector } = require('../../../meetingDetector');

let deps = {};
let meetingDetector = null;

function init(dependencies) {
  deps = dependencies;
}

function stopMeetingDetector() {
  if (!meetingDetector) return;
  meetingDetector.stop();
  meetingDetector = null;
}

function startMeetingDetector() {
  stopMeetingDetector();
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;

  meetingDetector = createMeetingDetector({
    platform: process.platform,
    onMeetingStart: deps.hidePetForMeeting,
    onMeetingEnd: deps.showPetAfterMeeting,
    onError: (error) => {
      console.warn('Meeting detector scan failed:', error.message);
    },
  });
  meetingDetector.start();
}

module.exports = {
  init,
  startMeetingDetector,
  stopMeetingDetector,
};
