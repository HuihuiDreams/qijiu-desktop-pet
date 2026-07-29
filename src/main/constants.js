/**
 * src/main/constants.js
 * 主进程跨模块共享的 electron-store key 常量，避免各服务各自硬编码同一个字符串。
 */

const LOCALE_KEY = 'locale';
const BREAK_REMINDER_STORE_KEY = 'breakReminderSettings';
const POMODORO_LAST_MINUTES_KEY = 'lastPomodoroMinutes';
const SCREENSAVER_STORE_KEY = 'screensaverSettings';

module.exports = {
  LOCALE_KEY,
  BREAK_REMINDER_STORE_KEY,
  POMODORO_LAST_MINUTES_KEY,
  SCREENSAVER_STORE_KEY,
};
