const fs = require('fs');
const glob = require('glob');

const tests = [
  'test/citySettingTray.test.js',
  'test/breakReminder.integration.test.js',
  'test/pomodoroTray.test.js',
  'test/windowAwarenessControls.test.js',
  'test/mainApplicationMenu.test.js',
  'test/skinTray.test.js',
  'test/weatherSyncStartup.test.js',
  'test/mainMemoryBudget.test.js',
  'test/mainMousePassthrough.test.js',
  'test/petVisibilityDiagnostics.test.js',
  'test/playwrightElectronSmoke.test.js'
];

for (const t of tests) {
  if (fs.existsSync(t)) {
    let content = fs.readFileSync(t, 'utf8');
    // We want to replace fs.readFileSync(..., 'utf-8') or 'utf8') with reading both main.js and TrayManager.js
    // First, let's normalize everything to utf8
    content = content.replace(/utf-8/g, 'utf8');
    
    // Now if it has fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') without TrayManager
    content = content.replace(
      /fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'main\.js'\), 'utf8'\)(?! \+ '\\n' \+ fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'src', 'main', 'TrayManager\.js'\))/g,
      "fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'TrayManager.js'), 'utf8')"
    );
    
    fs.writeFileSync(t, content);
  }
}
console.log('Done patching tests');
