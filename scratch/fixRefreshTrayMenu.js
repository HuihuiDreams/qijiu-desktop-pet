const fs = require('fs');
let content = fs.readFileSync('src/main/AppLifecycle.js', 'utf8');

content = content.replace(/refreshTrayMenu,/g, "refreshTrayMenu: () => trayManager.refreshTrayMenu(),");

fs.writeFileSync('src/main/AppLifecycle.js', content);
