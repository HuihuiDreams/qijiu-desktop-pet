'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

const AUTO_LAUNCH_PATH = require.resolve('../src/main/services/AutoLaunchService');
const STORE_MANAGER_PATH = require.resolve('../src/main/services/StoreManager');

function createAutoLaunchTestContext(options = {}) {
  const {
    isPackaged = false,
    platform = process.platform,
    initialStore = {},
    initialOpenAtLogin = false,
    initialWillLaunchAtLogin = initialOpenAtLogin,
    initialStatus = initialOpenAtLogin ? 'enabled' : 'not-registered',
    throwOnSet = false,
  } = options;

  let currentOpenAtLogin = initialOpenAtLogin;
  let currentWillLaunchAtLogin = initialWillLaunchAtLogin;
  let currentStatus = initialStatus;
  const storeData = new Map(Object.entries(initialStore));

  const mockStore = {
    get: (key) => storeData.get(key),
    set: (key, val) => storeData.set(key, val),
    has: (key) => storeData.has(key),
  };

  const mockApp = {
    isPackaged,
    getLoginItemSettings: () => ({
      openAtLogin: currentOpenAtLogin,
      executableWillLaunchAtLogin: currentWillLaunchAtLogin,
      status: currentStatus,
    }),
    setLoginItemSettings: (settings) => {
      if (throwOnSet) {
        throw new Error('System policy rejected login item registration');
      }
      currentOpenAtLogin = Boolean(settings.openAtLogin);
      currentWillLaunchAtLogin = Boolean(settings.openAtLogin);
      currentStatus = settings.openAtLogin ? 'enabled' : 'not-registered';
    },
  };

  delete require.cache[AUTO_LAUNCH_PATH];
  delete require.cache[STORE_MANAGER_PATH];

  const originalLoad = Module._load;
  const originalPlatform = process.platform;

  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return { app: mockApp };
    }
    if (request === './StoreManager' || request === '../services/StoreManager') {
      return {
        getStore: () => mockStore,
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const service = require('../src/main/services/AutoLaunchService');
    return {
      service,
      mockApp,
      mockStore,
      storeData,
      getOpenAtLogin: () => currentOpenAtLogin,
      cleanup: () => {
        delete require.cache[AUTO_LAUNCH_PATH];
        delete require.cache[STORE_MANAGER_PATH];
        Module._load = originalLoad;
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      },
    };
  } catch (err) {
    Module._load = originalLoad;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    throw err;
  }
}

test('AutoLaunchService: unpackaged dev mode succeeds without invoking native registration', async () => {
  const ctx = createAutoLaunchTestContext({ isPackaged: false, initialStore: { autoLaunch: false } });
  try {
    const res = await ctx.service.setAutoLaunchPreference(true);
    assert.equal(res.success, true);
    assert.equal(res.preference, true);
    assert.equal(ctx.service.isAutoLaunchEnabled(), true);
    assert.equal(ctx.storeData.get('autoLaunch'), true);
  } finally {
    ctx.cleanup();
  }
});

test('AutoLaunchService: packaged mode updates system status and returns success when API succeeds', async () => {
  const ctx = createAutoLaunchTestContext({
    isPackaged: true,
    platform: 'darwin',
    initialStore: { autoLaunch: false },
    initialOpenAtLogin: false,
  });
  try {
    const res = await ctx.service.setAutoLaunchPreference(true);
    assert.equal(res.success, true);
    assert.equal(res.preference, true);
    assert.equal(res.loginItem.openAtLogin, true);
    assert.equal(ctx.service.isAutoLaunchEnabled(), true);
    assert.equal(ctx.storeData.get('autoLaunch'), true);
    assert.equal(ctx.getOpenAtLogin(), true);
  } finally {
    ctx.cleanup();
  }
});

test('AutoLaunchService: packaged mode rolls back preference and returns false when API throws', async () => {
  const ctx = createAutoLaunchTestContext({
    isPackaged: true,
    platform: 'darwin',
    initialStore: { autoLaunch: false },
    initialOpenAtLogin: false,
    throwOnSet: true,
  });
  try {
    const res = await ctx.service.setAutoLaunchPreference(true);
    assert.equal(res.success, false);
    assert.equal(res.preference, false);
    assert.equal(res.loginItem.openAtLogin, false);
    assert.equal(ctx.service.isAutoLaunchEnabled(), false);
    assert.equal(ctx.storeData.get('autoLaunch'), false);
    assert.equal(ctx.getOpenAtLogin(), false);
  } finally {
    ctx.cleanup();
  }
});

test('AutoLaunchService: syncAutoLaunchPreference in packaged mode aligns with real system status', async () => {
  const ctx = createAutoLaunchTestContext({
    isPackaged: true,
    platform: 'win32',
    initialStore: { autoLaunch: true },
    initialOpenAtLogin: false, // system shows disabled despite store being true
    throwOnSet: true, // system refuses to apply
  });
  try {
    const res = await ctx.service.syncAutoLaunchPreference();
    assert.equal(res.preference, true);
    assert.equal(res.loginItem.openAtLogin, false);
    assert.equal(ctx.service.isAutoLaunchEnabled(), false);
  } finally {
    ctx.cleanup();
  }
});

test('AutoLaunchService: Windows sync treats a Run key disabled in Task Manager as off', async () => {
  const ctx = createAutoLaunchTestContext({
    isPackaged: true,
    platform: 'win32',
    initialStore: { autoLaunch: true },
    initialOpenAtLogin: true,
    initialWillLaunchAtLogin: false, // Run key exists but StartupApproved disables it
    throwOnSet: true,
  });
  try {
    const res = await ctx.service.syncAutoLaunchPreference();
    assert.equal(res.loginItem.openAtLogin, true);
    assert.equal(res.loginItem.executableWillLaunchAtLogin, false);
    assert.equal(ctx.service.isAutoLaunchEnabled(), false);
  } finally {
    ctx.cleanup();
  }
});

test('AutoLaunchService: macOS sync treats requires-approval as off even when openAtLogin is true', async () => {
  const ctx = createAutoLaunchTestContext({
    isPackaged: true,
    platform: 'darwin',
    initialStore: { autoLaunch: true },
    initialOpenAtLogin: true,
    initialStatus: 'requires-approval',
    throwOnSet: true,
  });
  try {
    const res = await ctx.service.syncAutoLaunchPreference();
    assert.equal(res.loginItem.openAtLogin, true);
    assert.equal(res.loginItem.status, 'requires-approval');
    assert.equal(ctx.service.isAutoLaunchEnabled(), false);
  } finally {
    ctx.cleanup();
  }
});
