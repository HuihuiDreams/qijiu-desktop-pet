const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const electronMock = {
  get app() { return mockApp; },
  get Menu() { return mockMenu; },
  nativeImage: {
    createFromBitmap: () => ({ setTemplateImage: () => {} })
  },
  get screen() { return mockScreen; },
  Tray: class {
    constructor() { mockTrayInstance = this; this.events = {}; }
    on(evt, cb) { this.events[evt] = cb; }
    setToolTip(t) { this.tooltip = t; }
    setContextMenu(m) { this.contextMenu = m; }
  }
};

let mockApp = { getVersion: () => '1.0.0', isPackaged: true, quit: () => {} };
let mockMenu = { buildFromTemplate: (template) => template };
let mockScreen = { getAllDisplays: () => [{ id: 1 }, { id: 2 }] };
let mockTrayInstance;

const { setupElectronMock } = require('./helpers/mockElectron');
const restoreRequire = setupElectronMock(electronMock);

const TrayManager = require('../src/main/TrayManager');
test.after(() => restoreRequire());

function createMockDeps() {
  return {
    I18N: {
      zh: { ui: { trayTitle: '桌宠', langZh: '中文', trayPomodoroRunning: '专注中', trayPomodoroCompleted: '专注完成', trayMinuteUnit: '分钟' } },
      en: { ui: { trayTitle: 'Pet', langEn: 'English', trayPomodoroRunning: 'Focusing', trayPomodoroCompleted: 'Focus complete', trayMinuteUnit: 'min' } }
    },
    getCurrentLocale: () => 'zh',
    setCurrentLocale: () => {},
    LOCALE_KEY: 'locale',
    getPomodoroSnapshot: () => ({ status: 'idle' }),
    getUpdateMenuState: () => ({ enabled: true, checking: false, downloading: false }),
    windowManager: {},
    getIsPaused: () => false,
    setIsPaused: () => {},
    getPomodoroPetHidden: () => false,
    isPetCurrentlyHidden: () => false,
    showPetManually: () => {},
    hidePetManually: () => {},
    getCurrentPetDisplay: () => null,
    migrateWindowToDisplay: () => {},
    getBreakReminderEnabled: () => false,
    setBreakReminderEnabled: () => {},
    getBreakReminderIntervalMinutes: () => 60,
    setBreakReminderIntervalMinutes: () => {},
    getBreakReminderService: () => null,
    BREAK_REMINDER_TRAY_INTERVALS: [30, 60],
    BREAK_REMINDER_STORE_KEY: 'breakReminder',
    getScreensaverSettings: () => ({ enabled: true, idleThresholdMinutes: 5 }),
    updateScreensaverSettings: () => {},
    getWeatherSyncSettings: () => ({ enabled: true }),
    getStoredWeatherSyncSettings: () => ({ enabled: true }),
    updateWeatherSyncSettings: () => {},
    getWindowAwarenessEnabled: () => true,
    setWindowAwarenessEnabled: () => {},
    AutoLaunchService: { isAutoLaunchEnabled: () => true, setAutoLaunchPreference: async () => {} },
    initStore: async () => {},
    getStore: () => ({ set: () => {} }),
    openPomodoroWindow: () => {},
    openSkinSelector: () => {},
    openCitySettingWindow: () => {},
    sendSkinSelectorData: () => {},
    checkForUpdatesFromTray: async () => {}
  };
}

function withPlatform(platform, fn) {
  const originalPlatform = process.platform;
  try {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    fn();
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  }
}

test('TrayManager - Full Coverage', async (t) => {
  t.beforeEach(() => {
    // Mutate in-place so TrayManager's captured `app` reference stays valid
    mockApp.getVersion = () => '1.0.0';
    mockApp.isPackaged = true;
    mockApp.quit = () => {};
    mockMenu.buildFromTemplate = (template) => template;
    mockScreen.getAllDisplays = () => [{ id: 1 }, { id: 2 }];
    mockTrayInstance = null;
  });

  await t.test('createTray and refreshTrayMenu build the menu properly', () => {
    const deps = createMockDeps();
    TrayManager.init(deps);
    withPlatform('win32', () => { TrayManager.createTray(); });
    assert.ok(mockTrayInstance);
  });

  await t.test('darwin platform handles template images and display switches', () => {
    const deps = createMockDeps();
    TrayManager.init(deps);
    withPlatform('darwin', () => { TrayManager.createTray(); });
    const menu = mockTrayInstance.contextMenu;
    const switchScreenItem = menu.find(i => i.label && i.label.includes('traySwitchScreen'));
    assert.ok(switchScreenItem);
  });

  await t.test('trayMenu items execute correct deps functions', async () => {
    const deps = createMockDeps();
    let actions = [];
    
    deps.openSkinSelector = () => actions.push('openSkinSelector');
    deps.openPomodoroWindow = () => actions.push('openPomodoroWindow');
    deps.setIsPaused = (v) => actions.push(`setIsPaused:${v}`);
    deps.showPetManually = () => actions.push('showPet');
    deps.hidePetManually = () => actions.push('hidePet');
    deps.openCitySettingWindow = () => actions.push('openCitySettingWindow');
    deps.updateWeatherSyncSettings = (s) => actions.push(`updateWeather:${s.enabled}`);
    deps.setWindowAwarenessEnabled = (v) => actions.push(`setWindowAwareness:${v}`);
    deps.checkForUpdatesFromTray = async () => actions.push('checkForUpdates');
    deps.AutoLaunchService.setAutoLaunchPreference = async (v) => actions.push(`setAutoLaunch:${v}`);
    deps.updateScreensaverSettings = (s) => actions.push(`updateScreensaver:${s.enabled}:${s.idleThresholdMinutes}`);
    deps.setBreakReminderEnabled = (v) => actions.push(`setBreakReminderEnabled:${v}`);
    deps.setBreakReminderIntervalMinutes = (v) => actions.push(`setBreakReminderIntervalMinutes:${v}`);
    deps.setCurrentLocale = (l) => actions.push(`locale:${l}`);

    mockApp.isPackaged = false; // To show devtools

    let devToolsOpened = false;
    let resetPositionsSent = false;
    let statusPanelToggled = false;
    let localeChangedCount = 0;
    
    deps.windowManager = {
      mainWindow: {
        isDestroyed: () => false,
        webContents: {
          openDevTools: () => { devToolsOpened = true; },
          send: (ch) => {
            if (ch === 'reset-positions') resetPositionsSent = true;
            if (ch === 'toggle-status-panel') statusPanelToggled = true;
            if (ch === 'locale-changed') localeChangedCount++;
          }
        }
      },
      statusWindow: {
        isDestroyed: () => false,
        isVisible: () => true,
        webContents: { send: (ch) => { if (ch === 'locale-changed') localeChangedCount++; } }
      },
      pomodoroWindow: {
        isDestroyed: () => false,
        webContents: { send: (ch) => { if (ch === 'locale-changed') localeChangedCount++; } }
      },
      citySettingWindow: {
        isDestroyed: () => false,
        webContents: { send: (ch) => { if (ch === 'locale-changed') localeChangedCount++; } }
      },
      skinSelectorWindow: {
        isDestroyed: () => false,
        webContents: { send: (ch) => { if (ch === 'locale-changed') localeChangedCount++; } }
      }
    };

    TrayManager.init(deps);
    TrayManager.createTray();
    
    const findItem = (labelFragment) => mockTrayInstance.contextMenu.find(i => i.label && i.label.includes(labelFragment));
    
    findItem('trayChooseSkin').click();
    assert.ok(actions.includes('openSkinSelector'));
    
    findItem('trayPauseWalk').click();
    assert.ok(actions.includes('setIsPaused:true'));
    
    findItem('trayHidePet').click();
    assert.ok(actions.includes('hidePet'));
    deps.isPetCurrentlyHidden = () => true;
    TrayManager.refreshTrayMenu();
    findItem('trayShowPet').click();
    assert.ok(actions.includes('showPet'));
    
    findItem('trayWeatherSyncConfig').click();
    assert.ok(actions.includes('openCitySettingWindow'));
    
    findItem('trayWeatherSyncOn').click();
    assert.ok(actions.includes('updateWeather:false')); // toggled
    
    withPlatform('win32', () => { TrayManager.refreshTrayMenu(); });
    const awarenessItem = findItem('trayWindowAwareness');
    if (awarenessItem && awarenessItem.click) {
      awarenessItem.click();
      assert.ok(actions.includes('setWindowAwareness:false'));
    }
    
    await findItem('trayAutoLaunchOn').click();
    assert.ok(actions.includes('setAutoLaunch:false'));
    
    findItem('trayUpdateCheck').click();
    assert.ok(actions.includes('checkForUpdates'));
    
    findItem('trayDevTools').click();
    assert.ok(devToolsOpened);
    
    findItem('trayResetPos').click();
    assert.ok(resetPositionsSent);
    
    findItem('trayHideStatusPanel').click();
    assert.ok(statusPanelToggled);
    
    await findItem('trayScreensaverOn').click();
    assert.ok(actions.includes('updateScreensaver:false:5'));
    
    const ssThresholdItem = findItem('trayScreensaverThreshold');
    await ssThresholdItem.submenu[0].click();
    
    await findItem('trayBreakReminderOff').click();
    assert.ok(actions.includes('setBreakReminderEnabled:true'));
    
    const breakIntervalItem = findItem('trayBreakReminderInterval');
    await breakIntervalItem.submenu[0].click();
    assert.ok(actions.includes('setBreakReminderIntervalMinutes:30'));
    
    const langItem = findItem('trayLanguage');
    await langItem.submenu[1].click(); // 'en'
    assert.ok(actions.includes('locale:en'));
    assert.equal(localeChangedCount, 5); // 5 windows updated
    
    let quitCalled = false;
    mockApp.quit = () => { quitCalled = true; };
    findItem('trayQuit').click();
    assert.ok(quitCalled);
  });
  
  await t.test('pomodoro tray label reflects state correctly', () => {
    const deps = createMockDeps();
    let currentPomodoro = { status: 'idle' };
    deps.getPomodoroSnapshot = () => currentPomodoro;
    
    TrayManager.init(deps);
    TrayManager.createTray();
    
    let item = mockTrayInstance.contextMenu.find(i => i.click && i.label && i.label.includes('trayPomodoroOpen'));
    assert.ok(item);
    
    currentPomodoro = { status: 'running', remainingMs: 65000 };
    TrayManager.refreshTrayMenu();
    item = mockTrayInstance.contextMenu.find(i => i.click && i.label && i.label.includes('专注中'));
    assert.ok(item, 'Should show running label');
    assert.ok(item.label.includes('2'), 'Should ceil minutes to 2');
    
    currentPomodoro = { status: 'completed' };
    TrayManager.refreshTrayMenu();
    item = mockTrayInstance.contextMenu.find(i => i.click && i.label && i.label.includes('专注完成'));
    assert.ok(item, 'Should show completed label');
    
    let opened = false;
    deps.openPomodoroWindow = () => { opened = true; };
    item.click();
    assert.ok(opened);
  });
});
