const fs = require('fs');
let content = fs.readFileSync('src/main/AppLifecycle.js', 'utf8');

content = content.replace("app.whenReady().then(async () => {", "app.whenReady().then(async () => { console.error('STARTING WHENREADY');");
content = content.replace("createWindow();", "console.error('ABOUT TO CREATE WINDOW'); createWindow();");
content = content.replace("await StoreManager.initStore();", "console.error('ABOUT TO INIT STORE'); await StoreManager.initStore();");
content = content.replace("await AutoLaunchService.syncAutoLaunchPreference();", "console.error('ABOUT TO SYNC AUTOLAUNCH'); await AutoLaunchService.syncAutoLaunchPreference();");

fs.writeFileSync('src/main/AppLifecycle.js', content);
