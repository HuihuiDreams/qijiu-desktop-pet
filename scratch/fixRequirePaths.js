const fs = require('fs');
let content = fs.readFileSync('src/main/AppLifecycle.js', 'utf8');

// List of modules that are at the root level that were required from main.js
const rootModules = [
  './displayBounds',
  './displayFit',
  './activeWindowProvider',
  './activeWindowAwareness',
  './ipcContracts',
  './breakReminderService',
  './presentationGuard',
  './meetingDetector',
  './weatherSyncService',
  './updateManager',
  './skinGallery'
];

rootModules.forEach(mod => {
  const newMod = mod.replace('./', '../../');
  // Use regex to replace exact string inside require('')
  const regex = new RegExp(`require\\('${mod}'\\)`, 'g');
  content = content.replace(regex, `require('${newMod}')`);
});

// Also fix local requires that were in root, if any.
// E.g. require('./src/main/IpcRouter') should now be require('./IpcRouter')
content = content.replace(/require\('\.\/src\/main\/IpcRouter'\)/g, "require('./IpcRouter')");
content = content.replace(/require\('\.\/src\/main\/TrayManager'\)/g, "require('./TrayManager')");
content = content.replace(/require\('\.\/src\/main\/windows\/WindowManager'\)/g, "require('./windows/WindowManager')");
content = content.replace(/require\('\.\/src\/main\/services\/AutoLaunchService'\)/g, "require('./services/AutoLaunchService')");
content = content.replace(/require\('\.\/src\/main\/services\/StoreManager'\)/g, "require('./services/StoreManager')");
content = content.replace(/require\('\.\/src\/main\/config\/weatherSyncSettings'\)/g, "require('./config/weatherSyncSettings')");
content = content.replace(/require\('\.\/src\/assets\/locales\//g, "require('../../src/assets/locales/");
content = content.replace(/require\('path'\)\.join\(__dirname, 'src', /g, "require('path').join(__dirname, '..', '..', 'src', ");
content = content.replace(/path\.join\(__dirname, 'preload\.js'\)/g, "path.join(__dirname, '..', '..', 'preload.js')");
content = content.replace(/path\.join\(__dirname, 'skinSelectorPreload\.js'\)/g, "path.join(__dirname, '..', '..', 'skinSelectorPreload.js')");
content = content.replace(/path\.join\(__dirname, 'updateProgressPreload\.js'\)/g, "path.join(__dirname, '..', '..', 'updateProgressPreload.js')");
content = content.replace(/path\.join\(__dirname, 'src'/g, "path.join(__dirname, '..', '..', 'src'");
content = content.replace(/path\.join\(__dirname, 'build'/g, "path.join(__dirname, '..', '..', 'build'");

fs.writeFileSync('src/main/AppLifecycle.js', content);
