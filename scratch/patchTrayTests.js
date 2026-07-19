const fs = require('fs');
const path = require('path');

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
    // If it reads main.js without reading TrayManager.js, we add it.
    // Also we might need to be careful not to duplicate if it already has it.
    if (content.includes('main.js') && !content.includes('TrayManager.js')) {
       // Look for fs.readFileSync(path.join(__dirname, '..', 'main.js')
       content = content.replace(
         /const mainSource = fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'main\.js'\), 'utf8'\)( \+ '\\n' \+ fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'src', 'main', 'windows', '[a-zA-Z]+\.js'\), 'utf8'\))?;/g,
         "$& + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'TrayManager.js'), 'utf8');"
       );
       
       // Handle readProjectFile('main.js') in skinTray.test.js and others
       content = content.replace(
         /const mainSource = readProjectFile\('main\.js'\);/g,
         "const mainSource = readProjectFile('main.js') + '\\n' + readProjectFile('src/main/TrayManager.js');"
       );
       fs.writeFileSync(t, content);
       console.log('Patched', t);
    }
  }
}
