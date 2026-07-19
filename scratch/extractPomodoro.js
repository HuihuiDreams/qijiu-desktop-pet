const fs = require('fs');
let content = fs.readFileSync('main.js', 'utf8');

const startMarker = "let pomodoroAlwaysOnTop = true;";
// Find the start index
const startIndex = content.indexOf(startMarker);

// Find the end index: where ipcMain.handle('pomodoro-command'... ends
// Let's find the end of the pomodoro block.
const endSearch = "ipcMain.handle('pomodoro-command'";
const endMatchStart = content.indexOf(endSearch);
// find the closing of that block: '  });\n' after endMatchStart
const endMatchEnd = content.indexOf('});\n', endMatchStart) + 4;

const pomodoroBlock = content.substring(startIndex, endMatchEnd);

// Write to PomodoroWindow.js
const pomodoroModule = `const { BrowserWindow, ipcMain, app } = require('electron');
const path = require('path');
const windowManager = require('./WindowManager');

${pomodoroBlock}

module.exports = {
  createPomodoroWindow,
  stopPomodoroSession,
  stopPomodoroTicker,
};
`;
fs.writeFileSync('src/main/windows/PomodoroWindow.js', pomodoroModule);

// Remove block from main.js and insert requires
content = content.replace(pomodoroBlock, '');
content = content.replace(
  "const windowManager = require('./src/main/windows/WindowManager');",
  "const windowManager = require('./src/main/windows/WindowManager');\nconst { createPomodoroWindow, stopPomodoroSession, stopPomodoroTicker } = require('./src/main/windows/PomodoroWindow');"
);

fs.writeFileSync('main.js', content);
console.log('Pomodoro extracted');
