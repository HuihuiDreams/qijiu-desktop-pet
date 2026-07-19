const fs = require('fs');
let content = fs.readFileSync('src/main/AppLifecycle.js', 'utf8');

content = content.replace(/ipcMain\.handle\('set-locale',/g, "ipcMain.handle('get-locale', () => currentLocale);\nipcMain.handle('set-locale',");

fs.writeFileSync('src/main/AppLifecycle.js', content);
