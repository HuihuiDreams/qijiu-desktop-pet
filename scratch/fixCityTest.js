const fs = require('fs');
let testCode = fs.readFileSync('test/citySettingTray.test.js', 'utf8');

testCode = testCode.replace(
  "const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');",
  "const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'windows', 'CitySettingWindow.js'), 'utf8');"
);

fs.writeFileSync('test/citySettingTray.test.js', testCode);
console.log('Fixed city setting test');
