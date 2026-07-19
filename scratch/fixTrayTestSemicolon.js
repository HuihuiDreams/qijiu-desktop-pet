const fs = require('fs');

const tests = [
  'test/citySettingTray.test.js',
  'test/breakReminder.integration.test.js',
  'test/pomodoroTray.test.js',
  'test/windowAwarenessControls.test.js',
  'test/mainApplicationMenu.test.js',
  'test/skinTray.test.js',
  'test/weatherSyncStartup.test.js',
  'test/mainMemoryBudget.test.js',
  'test/mainMousePassthrough.test.js'
];

for (const t of tests) {
  if (fs.existsSync(t)) {
    let content = fs.readFileSync(t, 'utf8');
    content = content.replace(/, 'utf8'\); \+ '\\n' \+/g, ", 'utf8') + '\\n' +");
    fs.writeFileSync(t, content);
  }
}
