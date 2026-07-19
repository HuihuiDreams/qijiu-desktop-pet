const fs = require('fs');
let content = fs.readFileSync('src/main/AppLifecycle.js', 'utf8');

const replacement = `
    createWindow();
    trayManager.createTray();

    statusWindowModule.init({ sendStatusWindowData });
    citySettingWindowModule.init();
    skinSelectorWindowModule.init({
      selectSkin,
      getCurrentSkinId: () => currentSkinId,
      getSkinGalleryItems
    });
    pomodoroWindowModule.init({
      getPomodoroSystem: () => pomodoroSystem,
      createIpcSuccess,
      startPomodoroSession,
      stopPomodoroSession,
      sendPomodoroState,
      getPomodoroSnapshot
    });
`;

content = content.replace(/    createWindow\(\);\n    trayManager\.createTray\(\);/g, replacement);

fs.writeFileSync('src/main/AppLifecycle.js', content);
