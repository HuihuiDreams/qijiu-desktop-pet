const { app, Menu, nativeImage, screen } = require('electron');
const { SCREENSAVER_ALLOWED_IDLE_MINUTES } = require('./services/screensaverAllowedMinutes');
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
  const currentLocale = deps.getCurrentLocale();
  const { windowManager } = deps;

  const langSubmenu = [
    { lang: 'zh', key: 'langZh' },
    { lang: 'en', key: 'langEn' },
    { lang: 'ja', key: 'langJa' },
  ].map(({ lang, key }) => ({
    label: trayMenuLabel(key),
    type: 'radio',
    checked: lang === currentLocale,
    click: async () => {
      deps.setCurrentLocale(lang);
      await deps.initStore();
      if (deps.getStore()) deps.getStore().set(deps.LOCALE_KEY, lang);
      refreshTrayMenu();
      if (windowManager.mainWindow) windowManager.mainWindow.webContents.send('locale-changed', lang);
      if (windowManager.statusWindow && !windowManager.statusWindow.isDestroyed()) {
        windowManager.statusWindow.webContents.send('locale-changed', lang);
      }
      if (windowManager.pomodoroWindow && !windowManager.pomodoroWindow.isDestroyed()) {
        windowManager.pomodoroWindow.webContents.send('locale-changed', lang);
      }
      if (windowManager.citySettingWindow && !windowManager.citySettingWindow.isDestroyed()) {
        windowManager.citySettingWindow.webContents.send('locale-changed', lang);
      }
      if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {
        windowManager.skinSelectorWindow.webContents.send('locale-changed', lang);
        deps.sendSkinSelectorData({ resetSelection: false });
      }
    },
  }));

  return Menu.buildFromTemplate([
    {
      label: trayMenuLabel('trayTitle'),
      enabled: false,
    },
    { type: 'separator' },

    {
      label: (windowManager.statusWindow && !windowManager.statusWindow.isDestroyed() && windowManager.statusWindow.isVisible()) ? trayMenuLabel('trayHideStatusPanel') : trayMenuLabel('trayShowStatusPanel'),
      click: () => {
        if (windowManager.mainWindow) windowManager.mainWindow.webContents.send('toggle-status-panel');
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
        if (windowManager.mainWindow) windowManager.mainWindow.webContents.send('reset-positions');
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
      label: deps.getBreakReminderEnabled() ? trayMenuLabel('trayBreakReminderOn') : trayMenuLabel('trayBreakReminderOff'),
      click: async () => {
        const newEnabled = !deps.getBreakReminderEnabled();
        deps.setBreakReminderEnabled(newEnabled);
        const newSettings = { enabled: newEnabled, intervalMinutes: deps.getBreakReminderIntervalMinutes(), idleResetMinutes: 5 };
        if (deps.getBreakReminderService()) deps.getBreakReminderService().updateSettings(newSettings);
        await deps.initStore();
        if (deps.getStore()) deps.getStore().set(deps.BREAK_REMINDER_STORE_KEY, newSettings);
        refreshTrayMenu();
      },
    },
    {
      label: trayMenuLabel('trayBreakReminderInterval'),
      submenu: deps.BREAK_REMINDER_TRAY_INTERVALS.map(minutes => ({
        label: `${minutes} ${trayMenuLabel('trayMinuteUnit')}`,
        type: 'radio',
        checked: deps.getBreakReminderIntervalMinutes() === minutes,
        click: async () => {
          deps.setBreakReminderIntervalMinutes(minutes);
          const newSettings = { enabled: deps.getBreakReminderEnabled(), intervalMinutes: minutes, idleResetMinutes: 5 };
          if (deps.getBreakReminderService()) deps.getBreakReminderService().updateSettings(newSettings);
          await deps.initStore();
          if (deps.getStore()) deps.getStore().set(deps.BREAK_REMINDER_STORE_KEY, newSettings);
          refreshTrayMenu();
        },
      })),
    },
    {
      label: (deps.getScreensaverSettings ? deps.getScreensaverSettings() : { enabled: false }).enabled
        ? trayMenuLabel('trayScreensaverOn')
        : trayMenuLabel('trayScreensaverOff'),
      click: async () => {
        if (!deps.getScreensaverSettings || !deps.updateScreensaverSettings) return;
        const current = deps.getScreensaverSettings();
        deps.updateScreensaverSettings({ ...current, enabled: !current.enabled });
        refreshTrayMenu();
      },
    },
    {
      label: trayMenuLabel('trayScreensaverThreshold'),
      submenu: SCREENSAVER_ALLOWED_IDLE_MINUTES.map((minutes) => ({
        label: `${minutes} ${trayMenuLabel('trayMinuteUnit')}`,
        type: 'radio',
        checked: (deps.getScreensaverSettings ? deps.getScreensaverSettings() : { idleThresholdMinutes: 5 }).idleThresholdMinutes === minutes,
        click: async () => {
          if (!deps.getScreensaverSettings || !deps.updateScreensaverSettings) return;
          const current = deps.getScreensaverSettings();
          deps.updateScreensaverSettings({ ...current, idleThresholdMinutes: minutes });
          refreshTrayMenu();
        },
      })),
    },
    {
      label: deps.getWeatherSyncSettings().enabled ? trayMenuLabel('trayWeatherSyncOn') : trayMenuLabel('trayWeatherSyncOff'),
      click: () => {
        const currentStored = deps.getStoredWeatherSyncSettings();
        const newSettings = { ...currentStored, enabled: !deps.getWeatherSyncSettings().enabled };
        deps.updateWeatherSyncSettings(newSettings);
      },
    },
    {
      label: trayMenuLabel('trayWeatherSyncConfig'),
      click: () => {
        deps.openCitySettingWindow();
      },
    },
    {
      label: (process.platform === 'win32' || process.platform === 'darwin')
        ? (deps.getWindowAwarenessEnabled() ? trayMenuLabel('trayWindowAwarenessOff') : trayMenuLabel('trayWindowAwarenessOn'))
        : trayMenuLabel('trayWindowAwarenessUnavailable'),
      enabled: process.platform === 'win32' || process.platform === 'darwin',
      click: () => deps.setWindowAwarenessEnabled(!deps.getWindowAwarenessEnabled()),
    },
    { type: 'separator' },

    {
      label: trayMenuLabel('trayLanguage'),
      submenu: langSubmenu,
    },
    {
      label: deps.AutoLaunchService.isAutoLaunchEnabled() ? trayMenuLabel('trayAutoLaunchOn') : trayMenuLabel('trayAutoLaunchOff'),
      click: async () => {
        await deps.AutoLaunchService.setAutoLaunchPreference(!deps.AutoLaunchService.isAutoLaunchEnabled());
        refreshTrayMenu();
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
          if (windowManager.mainWindow) windowManager.mainWindow.webContents.openDevTools({ mode: 'detach' });
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
  
  if (process.platform === 'win32') {
    tray.on('click', () => {
      // reserved
    });
  }
  
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
  getTray
};
