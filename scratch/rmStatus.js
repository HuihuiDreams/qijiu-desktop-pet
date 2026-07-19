const fs = require('fs');
let main = fs.readFileSync('main.js', 'utf8');

// 1. Remove getInitialStatusWindowBounds
main = main.replace(/function getInitialStatusWindowBounds\(\) \{[\s\S]*?return \{\s*width,[\s\S]*?\};\s*\}/, '');

// 2. Remove createStatusWindow
main = main.replace(/function createStatusWindow\(\) \{[\s\S]*?return windowManager\.statusWindow;\s*\}/, '');

// 3. Remove openStatusWindow
main = main.replace(/function openStatusWindow\(\) \{[\s\S]*?return win;\s*\}/, '');

// 4. Remove closeStatusWindow
main = main.replace(/function closeStatusWindow\(\) \{[\s\S]*?\}\s*\}/, '');

// 5. Remove ipcMain.handle('status-close-window' ...
main = main.replace(/ipcMain\.handle\('status-close-window'[\s\S]*?\}\);\s*/, '');

// 6. Insert require and init
main = main.replace(
  "const windowManager = require('./src/main/windows/WindowManager');",
  "const windowManager = require('./src/main/windows/WindowManager');\nconst statusWindowModule = require('./src/main/windows/StatusWindow');"
);

main = main.replace(
  "function registerIpcHandlers() {",
  "function registerIpcHandlers() {\n  statusWindowModule.init({ sendStatusWindowData });"
);

// 7. Replace usage of openStatusWindow and closeStatusWindow with statusWindowModule.openStatusWindow
main = main.replace(/openStatusWindow\(/g, "statusWindowModule.openStatusWindow(");
main = main.replace(/closeStatusWindow\(/g, "statusWindowModule.closeStatusWindow(");

fs.writeFileSync('main.js', main);
console.log('Removed Status window logic from main.js');
