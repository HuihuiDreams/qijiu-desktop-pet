const fs = require('fs');
let content = fs.readFileSync('src/main/AppLifecycle.js', 'utf8');
content = content.replace(/    createWindow\(\);\n    trayManager\.createTray\(\);\n  \}\);/g, "    createWindow();\n    trayManager.createTray();\n  }).catch(err => { console.error('WHEN READY ERROR:', err); });");
fs.writeFileSync('src/main/AppLifecycle.js', content);
