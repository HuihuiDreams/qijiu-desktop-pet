const fs = require('fs');
let content = fs.readFileSync('main.js', 'utf8');

// Remove variable declarations
content = content.replace(/let mainWindow = null;\n/g, '');
content = content.replace(/let statusWindow = null;\n/g, '');
content = content.replace(/let skinSelectorWindow = null;\n/g, '');
content = content.replace(/let pomodoroWindow = null;\n/g, '');
content = content.replace(/let citySettingWindow = null;\n/g, '');
content = content.replace(/let updateProgressWindow = null;\n/g, '');

// Replace variable usages
content = content.replace(/\bmainWindow\b/g, 'windowManager.mainWindow');
content = content.replace(/\bstatusWindow\b/g, 'windowManager.statusWindow');
content = content.replace(/\bskinSelectorWindow\b/g, 'windowManager.skinSelectorWindow');
content = content.replace(/\bpomodoroWindow\b/g, 'windowManager.pomodoroWindow');
content = content.replace(/\bcitySettingWindow\b/g, 'windowManager.citySettingWindow');
content = content.replace(/\bupdateProgressWindow\b/g, 'windowManager.updateProgressWindow');

// Add require if not present
if (!content.includes('const windowManager = require')) {
  content = content.replace(
    /const AutoLaunchService = require\('\.\/src\/main\/services\/AutoLaunchService'\);\n/,
    "const AutoLaunchService = require('./src/main/services/AutoLaunchService');\nconst windowManager = require('./src/main/windows/WindowManager');\n"
  );
}

fs.writeFileSync('main.js', content, 'utf8');
console.log('Done refactoring main.js');
