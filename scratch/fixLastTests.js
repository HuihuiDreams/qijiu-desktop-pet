const fs = require('fs');

let test1 = fs.readFileSync('test/skinSelectorIntegration.test.js', 'utf8');
test1 = test1.replace(/openSkinSelector\(\);/g, 'deps.openSkinSelector();');
fs.writeFileSync('test/skinSelectorIntegration.test.js', test1);

let test2 = fs.readFileSync('test/updateProgressSecurity.test.js', 'utf8');
test2 = test2.replace(
  /const mainSource = fs\.readFileSync\(path\.join\(__dirname, '\.\.', 'main\.js'\), 'utf8'\)(.*);/g,
  "const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'windows', 'WindowManager.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'windows', 'StatusWindow.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'windows', 'SkinSelectorWindow.js'), 'utf8');"
);
fs.writeFileSync('test/updateProgressSecurity.test.js', test2);

console.log('Fixed last 2 tests');
