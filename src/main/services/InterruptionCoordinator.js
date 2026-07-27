/**
 * src/main/services/InterruptionCoordinator.js
 * 原子仲裁久坐提醒 ('break-reminder') 与 CP 屏保 ('screensaver') 的互斥租约。
 */

const ALLOWED_HOLDERS = new Set(['break-reminder', 'screensaver']);

function createInterruptionCoordinator() {
  let currentHolder = null;

  function tryAcquire(holder) {
    if (!ALLOWED_HOLDERS.has(holder)) return false;
    if (currentHolder === null) {
      currentHolder = holder;
      return true;
    }
    return currentHolder === holder;
  }

  function release(holder) {
    if (!ALLOWED_HOLDERS.has(holder)) return false;
    if (currentHolder === holder) {
      currentHolder = null;
      return true;
    }
    return false;
  }

  function getCurrentHolder() {
    return currentHolder;
  }

  return {
    tryAcquire,
    release,
    getCurrentHolder,
  };
}

module.exports = {
  createInterruptionCoordinator,
  ALLOWED_HOLDERS,
};
