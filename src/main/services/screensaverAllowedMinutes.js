/**
 * src/main/services/screensaverAllowedMinutes.js
 * CP 屏保触发等待档位的唯一来源。供 ScreensaverController 与 TrayManager 共用。
 */

const SCREENSAVER_ALLOWED_IDLE_MINUTES = Object.freeze([1, 3, 5, 10, 15, 30]);

const LEGACY_MIGRATED_IDLE_MINUTES = Object.freeze({ from: 60, to: 30 });

module.exports = {
  SCREENSAVER_ALLOWED_IDLE_MINUTES,
  LEGACY_MIGRATED_IDLE_MINUTES,
};