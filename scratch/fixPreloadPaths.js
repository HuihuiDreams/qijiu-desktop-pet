const fs = require('fs');

const windows = [
  'src/main/windows/SkinSelectorWindow.js',
  'src/main/windows/PomodoroWindow.js',
  'src/main/windows/CitySettingWindow.js',
  'src/main/windows/StatusWindow.js',
  'src/main/windows/WindowManager.js'
];

for (const win of windows) {
  if (fs.existsSync(win)) {
    let content = fs.readFileSync(win, 'utf8');
    // For skinSelectorPreload.js
    content = content.replace(/path\.join\(__dirname[^)]*'skinSelectorPreload\.js'\)/g, "path.join(__dirname, '..', '..', '..', 'skinSelectorPreload.js')");
    // For preload.js
    content = content.replace(/path\.join\(__dirname[^)]*'preload\.js'\)/g, "path.join(__dirname, '..', '..', '..', 'preload.js')");
    fs.writeFileSync(win, content);
  }
}
