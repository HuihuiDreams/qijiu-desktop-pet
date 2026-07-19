const fs = require('fs');

let content = fs.readFileSync('test/updateProgressSecurity.test.js', 'utf8');

content = content.replace(
  "test('primary BrowserWindows explicitly enable renderer sandboxing', () => {\\n  const mainSource = readSource('main.js');",
  "test('primary BrowserWindows explicitly enable renderer sandboxing', () => {\\n  const mainSource = readSource('main.js') + '\\n' + readSource('src/main/windows/WindowManager.js') + '\\n' + readSource('src/main/windows/StatusWindow.js') + '\\n' + readSource('src/main/windows/SkinSelectorWindow.js') + '\\n' + readSource('src/main/windows/PomodoroWindow.js') + '\\n' + readSource('src/main/windows/CitySettingWindow.js');"
);

fs.writeFileSync('test/updateProgressSecurity.test.js', content);
console.log('Fixed test 3');
