const fs = require('fs');
const glob = require('glob');
const path = require('path');

const testFiles = glob.sync('test/**/*.js');

for (const t of testFiles) {
  let content = fs.readFileSync(t, 'utf8');
  let changed = false;

  // normalize utf-8
  if (content.includes('utf-8')) {
    content = content.replace(/utf-8/g, 'utf8');
    changed = true;
  }

  // replace fs.readFileSync('main.js') without TrayManager
  const regex1 = /fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'main\.js'\), 'utf8'\)(?! \+ '\\n' \+ fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'src', 'main', 'TrayManager\.js'\))/g;
  if (regex1.test(content)) {
    content = content.replace(regex1, "fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'TrayManager.js'), 'utf8')");
    changed = true;
  }

  const regex2 = /fs\.readFileSync\(path\.join\(ROOT, 'main\.js'\), 'utf8'\)(?! \+ '\\n' \+ fs\.readFileSync\(path\.join\(ROOT, 'src', 'main', 'TrayManager\.js'\))/g;
  if (regex2.test(content)) {
    content = content.replace(regex2, "fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(ROOT, 'src', 'main', 'TrayManager.js'), 'utf8')");
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(t, content);
    console.log('Patched', t);
  }
}
