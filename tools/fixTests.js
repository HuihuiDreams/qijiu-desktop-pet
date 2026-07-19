const fs = require('fs');
const path = require('path');

const testDir = path.join(__dirname, '..', 'test');
const files = fs.readdirSync(testDir).filter(f => f.endsWith('.js'));

for (const file of files) {
  const filePath = path.join(testDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  content = content.replace(/ \+ '\\n' \+ fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'src', 'main', 'IpcRouter\.js'\), 'utf8'\)/g, '');
  content = content.replace(/ \+ '\\n' \+ fs\.readFileSync\(path\.join\(ROOT, 'src', 'main', 'IpcRouter\.js'\), 'utf8'\)/g, '');
  content = content.replace(/ \+ '\\n' \+ readProjectFile\('src\/main\/IpcRouter\.js'\)/g, '');
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Patched ${file}`);
  }
}
