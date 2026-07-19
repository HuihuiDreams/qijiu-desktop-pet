const fs = require('fs');

const tests = [
  'test/breakReminder.integration.test.js',
  'test/petVisibilityDiagnostics.test.js'
];

for (const t of tests) {
  if (fs.existsSync(t)) {
    let content = fs.readFileSync(t, 'utf8');
    content = content.replace(
      /const mainSource = fs\.readFileSync\(path\.join\(ROOT, 'main\.js'\), 'utf8'\);/g,
      "const mainSource = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(ROOT, 'src', 'main', 'TrayManager.js'), 'utf8');"
    );
    fs.writeFileSync(t, content);
  }
}
