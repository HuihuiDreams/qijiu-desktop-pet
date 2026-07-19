const fs = require('fs');
const glob = require('glob');
const path = require('path');

const tests = [
  'test/skinSelectorIntegration.test.js',
  'test/updateProgressSecurity.test.js'
];

for (const t of tests) {
  let content = fs.readFileSync(t, 'utf8');
  let changed = false;

  // Replace fs.readFileSync('main.js') without TrayManager/IpcRouter
  const regex1 = /fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'main\.js'\), 'utf8'\)(?! \+ '\\n' \+ fs\.readFileSync)/g;
  if (regex1.test(content)) {
    content = content.replace(regex1, "fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'TrayManager.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'IpcRouter.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'windows', 'WindowManager.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'windows', 'SkinSelectorWindow.js'), 'utf8')");
    changed = true;
  }

  const regex2 = /fs\.readFileSync\(path\.join\(ROOT, 'main\.js'\), 'utf8'\)(?! \+ '\\n' \+ fs\.readFileSync)/g;
  if (regex2.test(content)) {
    content = content.replace(regex2, "fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(ROOT, 'src', 'main', 'TrayManager.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(ROOT, 'src', 'main', 'IpcRouter.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(ROOT, 'src', 'main', 'windows', 'WindowManager.js'), 'utf8')");
    changed = true;
  }

  // Handle skinSelectorIntegration.test.js which might have:
  // fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'windows', 'SkinSelectorWindow.js'), 'utf8')
  // We should just use a dumb string replace for known combinations
  content = content.replace(
    /fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'main\.js'\), 'utf8'\) \+ '\\n' \+ fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'src', 'main', 'windows', 'SkinSelectorWindow\.js'\), 'utf8'\);/g,
    "fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'TrayManager.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'IpcRouter.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'windows', 'SkinSelectorWindow.js'), 'utf8');"
  );
  
  // also check if they use readProjectFile('main.js')
  content = content.replace(
    /const mainSource = readProjectFile\('main\.js'\);/g,
    "const mainSource = readProjectFile('main.js') + '\\n' + readProjectFile('src/main/TrayManager.js') + '\\n' + readProjectFile('src/main/IpcRouter.js') + '\\n' + readProjectFile('src/main/windows/WindowManager.js');"
  );

  fs.writeFileSync(t, content);
  console.log('Patched', t);
}
