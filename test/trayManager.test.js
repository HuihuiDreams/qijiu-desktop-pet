const test = require('node:test');
const assert = require('node:assert/strict');

const electronMock = {
  get app() { return mockApp; },
  get Menu() { return mockMenu; },
  nativeImage: {
    createFromBitmap: () => ({ setTemplateImage: () => {} })
  },
  get screen() { return mockScreen; },
  Tray: class {
    constructor() { mockTrayInstance = this; }
    setToolTip(t) { this.tooltip = t; }
    setContextMenu(m) { this.contextMenu = m; }
  }
};

let mockApp = { getVersion: () => '1.0.0', isPackaged: true, quit: () => {} };
let mockLastMenu;
function buildMockMenu(template) {
  const menu = [...template];
  mockLastMenu = menu;
  return menu;
}
let mockMenu = { buildFromTemplate: buildMockMenu };
let mockScreen = { getAllDisplays: () => [{ id: 1 }, { id: 2 }] };
let mockTrayInstance;

const { setupElectronMock } = require('./helpers/mockElectron');
const restoreRequire = setupElectronMock(electronMock);

const TrayManager = require('../src/main/TrayManager');
test.after(() => restoreRequire());

function createMockDeps() {
  return {
    I18N: {
      zh: {
        ui: {
          trayTitle: '桌宠',
          traySettings: '⚙️ 设置…',
          trayPomodoroRunning: '专注中',
          trayPomodoroCompleted: '专注完成',
          trayMinuteUnit: '分钟',
        },
      },
      en: {
        ui: {
          trayTitle: 'Pet',
          traySettings: '⚙️ Settings…',
          trayPomodoroRunning: 'Focusing',
          trayPomodoroCompleted: 'Focus complete',
          trayMinuteUnit: 'min',
        },
      },
    },
    getCurrentLocale: () => 'zh',
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
    openPomodoroWindow: () => {},
    openSkinSelector: () => {},
    openSettingsWindow: () => {},
    checkForUpdatesFromTray: async () => {},
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

test('TrayManager - Streamlined Menu Coverage', async (t) => {
  t.beforeEach(() => {
    mockApp.getVersion = () => '1.0.0';
    mockApp.isPackaged = true;
    mockApp.quit = () => {};
    mockMenu.buildFromTemplate = buildMockMenu;
    mockLastMenu = null;
    mockScreen.getAllDisplays = () => [{ id: 1 }, { id: 2 }];
    mockTrayInstance = null;
  });

  await t.test('createTray and refreshTrayMenu build the menu properly', () => {
    const deps = createMockDeps();
    TrayManager.init(deps);
    withPlatform('win32', () => { TrayManager.createTray(); });
    assert.ok(mockTrayInstance);
    assert.equal(mockTrayInstance.contextMenu, mockLastMenu);
  });

  await t.test('darwin platform handles template images and display switches', () => {
    const deps = createMockDeps();
    TrayManager.init(deps);
    withPlatform('darwin', () => { TrayManager.createTray(); });
    const menu = mockLastMenu;
    const switchScreenItem = menu.find(i => i.label && i.label.includes('traySwitchScreen'));
    assert.ok(switchScreenItem);
  });

  await t.test('streamlined tray omits migrated preference items and opens unified settings', async () => {
    const deps = createMockDeps();
    const actions = [];

    deps.openSkinSelector = () => actions.push('openSkinSelector');
    deps.openSettingsWindow = () => actions.push('openSettingsWindow');
    deps.openPomodoroWindow = () => actions.push('openPomodoroWindow');
    deps.setIsPaused = (v) => actions.push(`setIsPaused:${v}`);
    deps.showPetManually = () => actions.push('showPet');
    deps.hidePetManually = () => actions.push('hidePet');
    deps.checkForUpdatesFromTray = async () => actions.push('checkForUpdates');

    mockApp.isPackaged = false;

    let devToolsOpened = false;
    let resetPositionsSent = false;
    let statusPanelToggled = false;

    deps.windowManager = {
      mainWindow: {
        isDestroyed: () => false,
        webContents: {
          openDevTools: () => { devToolsOpened = true; },
          send: (ch) => {
            if (ch === 'reset-positions') resetPositionsSent = true;
            if (ch === 'toggle-status-panel') statusPanelToggled = true;
          },
        },
      },
      statusWindow: {
        isDestroyed: () => false,
        isVisible: () => true,
      },
    };

    TrayManager.init(deps);
    TrayManager.createTray();

    const findItem = (labelFragment) => mockLastMenu.find(i => i.label && i.label.includes(labelFragment));

    // Migrated preference items must NOT exist in tray menu
    for (const removedKey of [
      'trayPetScale',
      'trayBreakReminder',
      'trayScreensaver',
      'trayWeatherSync',
      'trayWindowAwareness',
      'trayLanguage',
      'trayAutoLaunch',
    ]) {
      assert.equal(findItem(removedKey), undefined, `${removedKey} must be moved to unified SettingsWindow`);
    }

    findItem('trayChooseSkin').click();
    assert.ok(actions.includes('openSkinSelector'));

    findItem('设置').click();
    assert.ok(actions.includes('openSettingsWindow'));

    findItem('trayPauseWalk').click();
    assert.ok(actions.includes('setIsPaused:true'));

    findItem('trayHidePet').click();
    assert.ok(actions.includes('hidePet'));
    deps.isPetCurrentlyHidden = () => true;
    TrayManager.refreshTrayMenu();
    findItem('trayShowPet').click();
    assert.ok(actions.includes('showPet'));

    findItem('trayUpdateCheck').click();
    assert.ok(actions.includes('checkForUpdates'));

    findItem('trayDevTools').click();
    assert.ok(devToolsOpened);

    findItem('trayResetPos').click();
    assert.ok(resetPositionsSent);

    findItem('trayHideStatusPanel').click();
    assert.ok(statusPanelToggled);

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

    let item = mockLastMenu.find(i => i.click && i.label && i.label.includes('trayPomodoroOpen'));
    assert.ok(item);

    currentPomodoro = { status: 'running', remainingMs: 65000 };
    TrayManager.refreshTrayMenu();
    item = mockLastMenu.find(i => i.click && i.label && i.label.includes('专注中'));
    assert.ok(item, 'Should show running label');
    assert.ok(item.label.includes('2'), 'Should ceil minutes to 2');

    currentPomodoro = { status: 'completed' };
    TrayManager.refreshTrayMenu();
    item = mockLastMenu.find(i => i.click && i.label && i.label.includes('专注完成'));
    assert.ok(item, 'Should show completed label');

    let opened = false;
    deps.openPomodoroWindow = () => { opened = true; };
    item.click();
    assert.ok(opened);
  });

  await t.test('pomodoro hidden state disables pause and hide tray actions', () => {
    const deps = createMockDeps();
    deps.getPomodoroPetHidden = () => true;
    TrayManager.init(deps);
    TrayManager.createTray();

    const pauseItem = mockLastMenu.find(i => i.label && i.label.includes('trayPauseWalk'));
    const hideItem = mockLastMenu.find(i => i.label && i.label.includes('trayHidePet'));
    assert.equal(pauseItem.enabled, false);
    assert.equal(hideItem.enabled, false);
  });

  await t.test('status panel label treats a panel hidden for fullscreen RDP as open', () => {
    const deps = createMockDeps();
    let hiddenForRdp = true;
    const statusWindow = { isDestroyed: () => false, isVisible: () => false };
    deps.windowManager = { statusWindow };
    deps.isHiddenForFullscreenRdp = (win) => win === statusWindow && hiddenForRdp;
    TrayManager.init(deps);
    TrayManager.createTray();
    const findLabel = (key) => mockLastMenu.find(i => i.label && i.label.includes(key));
    assert.ok(findLabel('trayHideStatusPanel'), 'RDP-hidden panel must offer "hide" to match the renderer toggle');

    hiddenForRdp = false;
    TrayManager.refreshTrayMenu();
    assert.ok(findLabel('trayShowStatusPanel'));
    assert.equal(findLabel('trayHideStatusPanel'), undefined);
  });
});
