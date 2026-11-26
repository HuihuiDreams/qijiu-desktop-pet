const { app, Menu, nativeImage, screen } = require('electron');
let tray = null;
let deps = {};

function init(dependencies) {
  deps = dependencies;
}

function trayT(key) {
  const { I18N, getCurrentLocale } = deps;
  return (I18N[getCurrentLocale()]?.ui?.[key]) ?? (I18N.zh.ui[key]) ?? key;
}

function trayText(key, fallback) {
  const value = trayT(key);
  return value === key ? fallback : value;
}

function escapeElectronMenuLabel(label) {
  return String(label).replaceAll('&', '&&');
}

function trayMenuLabel(key, fallback) {
  const value = fallback === undefined ? trayT(key) : trayText(key, fallback);
  return escapeElectronMenuLabel(value);
}

function getPomodoroTrayLabel() {
  const snapshot = deps.getPomodoroSnapshot();
  if (snapshot.status === 'running') {
    const minutes = Math.max(1, Math.ceil(snapshot.remainingMs / 60000));
    return `${trayText('trayPomodoroRunning', 'Pomodoro')} ${minutes} ${trayMenuLabel('trayMinuteUnit')}`;
  }
  if (snapshot.status === 'completed') {
    return trayMenuLabel('trayPomodoroCompleted', 'Pomodoro complete');
  }
  return trayMenuLabel('trayPomodoroOpen');
}

function buildTrayMenu() {
  const updateMenuState = deps.getUpdateMenuState();
  const appVersion = app.getVersion();
  const { windowManager } = deps;
  const { statusWindow } = windowManager;
  // 全屏 RDP 临时隐藏的面板逻辑上仍是打开状态，标签与 renderer 的切换方向保持一致
  const isStatusPanelOpen = Boolean(statusWindow && !statusWindow.isDestroyed()
    && (statusWindow.isVisible() || deps.isHiddenForFullscreenRdp?.(statusWindow)));

  const menu = Menu.buildFromTemplate([
    {
      label: trayMenuLabel('trayTitle'),
      enabled: false,
    },
    { type: 'separator' },

    {
      label: isStatusPanelOpen ? trayMenuLabel('trayHideStatusPanel') : trayMenuLabel('trayShowStatusPanel'),
      click: () => {
        if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) windowManager.mainWindow.webContents.send('toggle-status-panel');
      },
    },
    {
      label: getPomodoroTrayLabel(),
      click: () => {
        deps.openPomodoroWindow();
      },
    },
    { type: 'separator' },

    {
      label: trayMenuLabel('trayChooseSkin'),
      click: () => {
        deps.openSkinSelector();
      },
    },
    {
      label: deps.getIsPaused() ? trayMenuLabel('trayResumeWalk') : trayMenuLabel('trayPauseWalk'),
      enabled: !deps.getPomodoroPetHidden(),
      click: () => {
        const newPaused = !deps.getIsPaused();
        deps.setIsPaused(newPaused);

        refreshTrayMenu();
      },
    },
    {
      label: deps.isPetCurrentlyHidden() ? trayMenuLabel('trayShowPet') : trayMenuLabel('trayHidePet'),
      enabled: !deps.getPomodoroPetHidden(),
      click: () => {
        if (deps.isPetCurrentlyHidden()) {
          deps.showPetManually();
        } else {
          deps.hidePetManually();
        }
      },
    },
    {
      label: trayMenuLabel('trayResetPos'),
      click: () => {
        if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) windowManager.mainWindow.webContents.send('reset-positions');
      },
    },
    ...(process.platform === 'darwin' && screen.getAllDisplays().length > 1 ? [{
      label: trayMenuLabel('traySwitchScreen'),
      submenu: screen.getAllDisplays().map((display, idx) => ({
        label: `${trayMenuLabel('trayScreen')} ${idx + 1}${deps.getCurrentPetDisplay() && display.id === deps.getCurrentPetDisplay().id ? ' ✓' : ''}`,
        click: () => {
          deps.migrateWindowToDisplay(display);
          refreshTrayMenu();
        },
      })),
    }] : []),
    { type: 'separator' },

    {
      label: trayMenuLabel('traySettings'),
      click: () => {
        deps.openSettingsWindow?.();
      },
    },
    {
      label: updateMenuState.checking ? trayMenuLabel('trayUpdateChecking')
        : updateMenuState.downloading ? trayMenuLabel('trayUpdateDownloading')
          : trayMenuLabel('trayUpdateCheck'),
      enabled: updateMenuState.enabled,
      click: () => {
        void deps.checkForUpdatesFromTray();
      },
    },
    ...(!app.isPackaged ? [
      {
        label: trayMenuLabel('trayDevTools'),
        click: () => {
          if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) windowManager.mainWindow.webContents.openDevTools({ mode: 'detach' });
        },
      },
    ] : []),
    { type: 'separator' },

    {
      label: trayMenuLabel('trayQuit'),
      click: () => {
        app.quit();
      },
    },
    { type: 'separator' },
    {
      label: `${trayMenuLabel('trayVersion', 'Version')} ${appVersion}`,
      enabled: false,
    },
  ]);

  return menu;
}

function createTrayIconBuffer() {
  const size = 16;
  const pixels = Buffer.alloc(size * size * 4);
  const bitmap = [
    '                ',
    '                ',
    '                ',
    '  XXXXX   XXXX  ',
    '      X  X    X ',
    '     X   X    X ',
    '     X    XXXXX ',
    '    X         X ',
    '    X         X ',
    '   X      XXXX  ',
    '                ',
    '                ',
    '                ',
    '                ',
    '                ',
    '                ',
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      if (bitmap[y]?.[x] === 'X') {
        pixels[idx] = 0;
        pixels[idx + 1] = 128;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 255;
      } else {
        pixels[idx + 3] = 0;
      }
    }
  }
  return pixels;
}

function createTray() {
  const icon = nativeImage.createFromBitmap(createTrayIconBuffer(), {
    width: 16,
    height: 16,
  });

  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  const { Tray } = require('electron');
  tray = new Tray(icon);
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (tray) {
    tray.setToolTip(trayT('trayTitle'));
    tray.setContextMenu(buildTrayMenu());
  }
}

function getTray() {
  return tray;
}

module.exports = {
  init,
  createTray,
  refreshTrayMenu,
  trayT,
  trayText,
  getTray,
};
