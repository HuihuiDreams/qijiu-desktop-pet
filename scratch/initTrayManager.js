const fs = require('fs');
let content = fs.readFileSync('src/main/AppLifecycle.js', 'utf8');

const initTray = `
    const { I18N } = require('../../i18n');
    trayManager.init({
      getPomodoroSnapshot,
      getUpdateMenuState,
      getCurrentLocale: () => currentLocale,
      setCurrentLocale: (val) => currentLocale = val,
      initStore: () => StoreManager.initStore(),
      getStore: () => store,
      LOCALE_KEY,
      sendSkinSelectorData: () => skinSelectorWindowModule.sendSkinSelectorData(),
      openPomodoroWindow: () => pomodoroWindowModule.openPomodoroWindow(),
      openSkinSelector: () => skinSelectorWindowModule.openSkinSelectorWindow(),
      getIsPaused: () => isPaused,
      getPomodoroPetHidden: () => pomodoroPetHidden,
      setIsPaused: (val) => { isPaused = val; applyPauseState(); },
      isPetCurrentlyHidden,
      showPetManually,
      hidePetManually,
      getCurrentPetDisplay: () => currentPetDisplay,
      migrateWindowToDisplay,
      getBreakReminderEnabled: () => breakReminderEnabled,
      setBreakReminderEnabled: (val) => breakReminderEnabled = val,
      getBreakReminderIntervalMinutes: () => breakReminderIntervalMinutes,
      setBreakReminderIntervalMinutes: (val) => breakReminderIntervalMinutes = val,
      getBreakReminderService: () => breakReminderService,
      BREAK_REMINDER_STORE_KEY,
      BREAK_REMINDER_TRAY_INTERVALS: [20, 30, 45, 60],
      getWeatherSyncSettings: () => weatherSyncSettings,
      getStoredWeatherSyncSettings,
      updateWeatherSyncSettings,
      openCitySettingWindow: () => citySettingWindowModule.openCitySettingWindow(),
      getWindowAwarenessEnabled: () => windowAwarenessEnabled,
      setWindowAwarenessEnabled: (val) => setWindowAwarenessEnabled(val),
      AutoLaunchService,
      checkForUpdatesFromTray,
      I18N: require('../../i18n')
    });
    trayManager.createTray();
`;

content = content.replace(/    trayManager\.createTray\(\);/g, initTray);

fs.writeFileSync('src/main/AppLifecycle.js', content);
