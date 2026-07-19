const fs = require('fs');
const path = require('path');
const glob = require('glob');

const mainContent = fs.readFileSync('main.js', 'utf8');

// We want to keep the single instance lock in main.js, and require AppLifecycle.
const newMainContent = `const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// 配置 QA 环境的 User Data 目录 (需在 app.whenReady 之前执行)
function configureQaUserDataPath() {
  const qaUserDataDir = process.env.DESKTOP_PET_USER_DATA_DIR;
  if (!qaUserDataDir) return;

  const resolvedDir = path.resolve(qaUserDataDir);
  fs.mkdirSync(resolvedDir, { recursive: true });
  app.setPath('userData', resolvedDir);
}

configureQaUserDataPath();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  const AppLifecycle = require('./src/main/AppLifecycle');
  AppLifecycle.init(app);
}
`;

// AppLifecycle.js gets everything else
let appLifecycleContent = mainContent;

// Remove the single instance lock and QA config from appLifecycleContent
appLifecycleContent = appLifecycleContent.replace(/function configureQaUserDataPath\(\) \{[\s\S]*?configureQaUserDataPath\(\);/g, '');
appLifecycleContent = appLifecycleContent.replace(/const hasSingleInstanceLock = app\.requestSingleInstanceLock\(\);\n\n\n\n/g, '');
appLifecycleContent = appLifecycleContent.replace(/if \(!hasSingleInstanceLock\) \{\n  app\.quit\(\);\n\} else \{\n/g, '');
appLifecycleContent = appLifecycleContent.replace(/const { app, /g, 'const { ');
// Need to add `app` as a parameter to init, or just require it at the top. Actually we can just require `app` at the top of AppLifecycle.js
appLifecycleContent = `const { app } = require('electron');\n` + appLifecycleContent;

// Wrap the app events in an init function
appLifecycleContent = appLifecycleContent.replace(/  app\.setAppUserModelId/g, `class AppLifecycle {\n  static init() {\n    app.setAppUserModelId`);

// Close the class at the end
const lastBracketRegex = /app\.on\('window-all-closed', \(\) => \{[\s\S]*?\}\);\n\n\}/g;
appLifecycleContent = appLifecycleContent.replace(lastBracketRegex, match => {
  return match.replace(/}$/, '  }\n}\nmodule.exports = AppLifecycle;');
});

fs.writeFileSync('src/main/AppLifecycle.js', appLifecycleContent);
fs.writeFileSync('main.js', newMainContent);
console.log('Created AppLifecycle.js and trimmed main.js');

// Now update all tests
const testFiles = glob.sync('test/**/*.js');
for (const t of testFiles) {
  let content = fs.readFileSync(t, 'utf8');
  let changed = false;

  // Add AppLifecycle.js to mainSource
  const regex1 = /fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'main\.js'\), 'utf8'\)(?! \+ '\\n' \+ fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'src', 'main', 'AppLifecycle\.js'\))/g;
  if (regex1.test(content)) {
    content = content.replace(regex1, "fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'AppLifecycle.js'), 'utf8')");
    changed = true;
  }

  const regex2 = /fs\.readFileSync\(path\.join\(ROOT, 'main\.js'\), 'utf8'\)(?! \+ '\\n' \+ fs\.readFileSync\(path\.join\(ROOT, 'src', 'main', 'AppLifecycle\.js'\))/g;
  if (regex2.test(content)) {
    content = content.replace(regex2, "fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(ROOT, 'src', 'main', 'AppLifecycle.js'), 'utf8')");
    changed = true;
  }
  
  const regex3 = /readSource\('main\.js'\)(?! \+ '\\n' \+ readSource\('src\/main\/AppLifecycle\.js'\))/g;
  if (regex3.test(content)) {
    content = content.replace(regex3, "readSource('main.js') + '\\n' + readSource('src/main/AppLifecycle.js')");
    changed = true;
  }

  const regex4 = /readProjectFile\('main\.js'\)(?! \+ '\\n' \+ readProjectFile\('src\/main\/AppLifecycle\.js'\))/g;
  if (regex4.test(content)) {
    content = content.replace(regex4, "readProjectFile('main.js') + '\\n' + readProjectFile('src/main/AppLifecycle.js')");
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(t, content);
    console.log('Patched AppLifecycle in', t);
  }
}
