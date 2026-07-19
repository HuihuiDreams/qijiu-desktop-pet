const fs = require('fs');

const fixPreloadPath = (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/path\.join\(__dirname, '\.\.', '\.\.', 'preload'/g, "path.join(__dirname, '..', '..', '..', 'preload'");
  content = content.replace(/path\.join\(__dirname, '\.\.', '\.\.', 'src'/g, "path.join(__dirname, '..', '..', '..', 'src'");
  content = content.replace(/path\.join\(__dirname, '\.\.', '\.\.', 'preload\.js'/g, "path.join(__dirname, '..', '..', '..', 'preload.js'");
  fs.writeFileSync(filePath, content);
};

const windows = [
  'src/main/windows/SkinSelectorWindow.js',
  'src/main/windows/PomodoroWindow.js',
  'src/main/windows/CitySettingWindow.js',
  'src/main/windows/StatusWindow.js',
  'src/main/windows/WindowManager.js'
];

for (const win of windows) {
  if (fs.existsSync(win)) fixPreloadPath(win);
}
