const fs = require('fs');
const glob = require('glob');
const path = require('path');

const testFiles = glob.sync('test/**/*.js');

for (const t of testFiles) {
  let content = fs.readFileSync(t, 'utf8');
  let changed = false;

  // Add IpcRouter.js
  const regex1 = /fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'src', 'main', 'TrayManager\.js'\), 'utf8'\)(?! \+ '\\n' \+ fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'src', 'main', 'IpcRouter\.js'\))/g;
  if (regex1.test(content)) {
    content = content.replace(regex1, "fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'TrayManager.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'IpcRouter.js'), 'utf8')");
    changed = true;
  }

  const regex2 = /fs\.readFileSync\(path\.join\(ROOT, 'src', 'main', 'TrayManager\.js'\), 'utf8'\)(?! \+ '\\n' \+ fs\.readFileSync\(path\.join\(ROOT, 'src', 'main', 'IpcRouter\.js'\))/g;
  if (regex2.test(content)) {
    content = content.replace(regex2, "fs.readFileSync(path.join(ROOT, 'src', 'main', 'TrayManager.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(ROOT, 'src', 'main', 'IpcRouter.js'), 'utf8')");
    changed = true;
  }

  // Also replace any standalone fs.readFileSync('main.js') that don't have TrayManager yet just in case.
  const regex3 = /fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'main\.js'\), 'utf8'\)(?! \+ '\\n' \+ fs\.readFileSync)/g;
  if (regex3.test(content)) {
    content = content.replace(regex3, "fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'IpcRouter.js'), 'utf8')");
    changed = true;
  }

  const regex4 = /fs\.readFileSync\(path\.join\(ROOT, 'main\.js'\), 'utf8'\)(?! \+ '\\n' \+ fs\.readFileSync)/g;
  if (regex4.test(content)) {
    content = content.replace(regex4, "fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(ROOT, 'src', 'main', 'IpcRouter.js'), 'utf8')");
    changed = true;
  }
  
  if (changed) {
    fs.writeFileSync(t, content);
    console.log('Patched IpcRouter in', t);
  }
}
