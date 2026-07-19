const fs = require('fs');
let main = fs.readFileSync('main.js', 'utf8');

// I will just use regex to remove tray logic
main = main.replace(/let tray = null;\n/, '');

main = main.replace(/function trayT\([^)]*\) \{[\s\S]*?\} ??key;\s*\}/, '');
main = main.replace(/function trayText\([^)]*\) \{[\s\S]*?return value === key \? fallback : value;\s*\}/, '');
main = main.replace(/function escapeElectronMenuLabel\([^)]*\) \{[\s\S]*?return String\(label\)\.replaceAll\('&', '&&'\);\s*\}/, '');
main = main.replace(/function trayMenuLabel\([^)]*\) \{[\s\S]*?return escapeElectronMenuLabel\(value\);\s*\}/, '');

main = main.replace(/function getPomodoroTrayLabel\(\) \{[\s\S]*?return trayMenuLabel\('trayPomodoroOpen'\);\s*\}/, '');
main = main.replace(/function buildTrayMenu\(\) \{[\s\S]*?return Menu\.buildFromTemplate\([\s\S]*?\);\n\}/, '');

main = main.replace(/function createTrayIconBuffer\(\) \{[\s\S]*?return pixels;\s*\}/, '');
main = main.replace(/function createTray\(\) \{[\s\S]*?refreshTrayMenu\(\);\n\}/, '');
main = main.replace(/function refreshTrayMenu\(\) \{[\s\S]*?\}\s*\}/, '');

// Now replace function calls
main = main.replace(/refreshTrayMenu\(\)/g, "trayManager.refreshTrayMenu()");
main = main.replace(/createTray\(\)/g, "trayManager.createTray()");
main = main.replace(/trayT\(/g, "trayManager.trayT("); // used in initUpdateManager
main = main.replace(/trayT,/g, "trayManager.trayT,"); // used in initUpdateManager

main = main.replace(
  "const pomodoroWindowModule = require('./src/main/windows/PomodoroWindow');",
  "const pomodoroWindowModule = require('./src/main/windows/PomodoroWindow');\nconst trayManager = require('./src/main/TrayManager');"
);

main = main.replace(
  "pomodoroWindowModule.init({",
  "trayManager.init({\n    I18N,\n    getCurrentLocale: () => currentLocale,\n    setCurrentLocale: (lang) => { currentLocale = lang; },\n    initStore,\n    getStore: () => store,\n    LOCALE_KEY,\n    windowManager,\n    sendSkinSelectorData: skinSelectorWindowModule.sendSkinSelectorData,\n    openPomodoroWindow: pomodoroWindowModule.openPomodoroWindow,\n    openSkinSelector: skinSelectorWindowModule.openSkinSelectorWindow,\n    getPomodoroSnapshot,\n    getIsPaused: () => isPaused,\n    setIsPaused: (p) => { isPaused = p; },\n    getPomodoroPetHidden: () => pomodoroPetHidden,\n    isPetCurrentlyHidden,\n    showPetManually,\n    hidePetManually,\n    getCurrentPetDisplay: () => currentPetDisplay,\n    migrateWindowToDisplay,\n    getBreakReminderEnabled: () => breakReminderEnabled,\n    setBreakReminderEnabled: (v) => { breakReminderEnabled = v; },\n    getBreakReminderIntervalMinutes: () => breakReminderIntervalMinutes,\n    setBreakReminderIntervalMinutes: (v) => { breakReminderIntervalMinutes = v; },\n    getBreakReminderService: () => breakReminderService,\n    BREAK_REMINDER_STORE_KEY,\n    BREAK_REMINDER_TRAY_INTERVALS,\n    getWeatherSyncSettings: () => weatherSyncSettings,\n    getStoredWeatherSyncSettings,\n    updateWeatherSyncSettings,\n    openCitySettingWindow: citySettingWindowModule.openCitySettingWindow,\n    getWindowAwarenessEnabled: () => windowAwarenessEnabled,\n    setWindowAwarenessEnabled,\n    AutoLaunchService,\n    getUpdateMenuState,\n    checkForUpdatesFromTray\n  });\n  pomodoroWindowModule.init({"
);

fs.writeFileSync('main.js', main);
console.log('Removed Tray logic from main.js');
