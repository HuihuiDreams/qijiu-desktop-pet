const fs = require('fs');
let main = fs.readFileSync('main.js', 'utf8');

main = main.replace(/let skinSelectorSelectionInProgress = false;\n/, '');
main = main.replace(/let skinSelectorOriginalSkinId = null;\n/, '');

main = main.replace(/function getInitialSkinSelectorWindowBounds\(\) \{[\s\S]*?return \{\s*width,[\s\S]*?\};\s*\}/, '');
main = main.replace(/function sendSkinSelectorData\([^)]*\) \{[\s\S]*?windowManager\.skinSelectorWindow\.webContents\.send\('skin-selector-data'[\s\S]*?\);\s*\}/, '');
main = main.replace(/function isValidSkinSelectorSender\([^)]*\) \{[\s\S]*?event\?\.sender\?\.id === windowManager\.skinSelectorWindow\.webContents\.id\s*\);\s*\}/, '');
main = main.replace(/function createSkinSelectorWindow\(\) \{[\s\S]*?return windowManager\.skinSelectorWindow;\s*\}/, '');
main = main.replace(/function openSkinSelectorWindow\(\) \{[\s\S]*?return win;\s*\}/, '');
main = main.replace(/function cancelSkinSelection\(\) \{[\s\S]*?skinSelectorOriginalSkinId = null;\s*\}/, '');
main = main.replace(/function closeSkinSelectorWindow\(\) \{[\s\S]*?\}\s*\}/, '');

main = main.replace(/ipcMain\.handle\('skin-preview'[\s\S]*?\}\);\s*/, '');
main = main.replace(/ipcMain\.handle\('skin-select'[\s\S]*?\}\);\s*/, '');
main = main.replace(/ipcMain\.handle\('skin-cancel'[\s\S]*?\}\);\s*/, '');

main = main.replace(
  "const citySettingWindowModule = require('./src/main/windows/CitySettingWindow');",
  "const citySettingWindowModule = require('./src/main/windows/CitySettingWindow');\nconst skinSelectorWindowModule = require('./src/main/windows/SkinSelectorWindow');"
);

main = main.replace(
  "citySettingWindowModule.init();",
  "citySettingWindowModule.init();\n  skinSelectorWindowModule.init({\n    selectSkin,\n    getCurrentSkinId: () => currentSkinId,\n    getSkinGalleryItems: () => skinGallery.getGalleryItems(currentLocale)\n  });"
);

// We must be careful to replace usages of skinSelectorOriginalSkinId and skinSelectorSelectionInProgress if they are accessed directly!
main = main.replace(/skinSelectorOriginalSkinId/g, "skinSelectorWindowModule.getSkinSelectorOriginalSkinId()");
main = main.replace(/skinSelectorSelectionInProgress/g, "skinSelectorWindowModule.isSkinSelectorSelectionInProgress()");

main = main.replace(/openSkinSelectorWindow\(/g, "skinSelectorWindowModule.openSkinSelectorWindow(");
main = main.replace(/closeSkinSelectorWindow\(/g, "skinSelectorWindowModule.closeSkinSelectorWindow(");

// In main.js, we also have:
// windowManager.skinSelectorWindow.webContents.send('locale-changed', lang);
// sendSkinSelectorData({ isInitialLoad: false }); -> skinSelectorWindowModule.sendSkinSelectorData({ isInitialLoad: false });
main = main.replace(/sendSkinSelectorData\(/g, "skinSelectorWindowModule.sendSkinSelectorData(");

fs.writeFileSync('main.js', main);
console.log('Removed Skin Selector logic from main.js');
