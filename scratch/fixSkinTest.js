const fs = require('fs');
let testCode = fs.readFileSync('test/skinSelectorIntegration.test.js', 'utf8');

testCode = testCode.replace(
  "const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');",
  "const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'windows', 'SkinSelectorWindow.js'), 'utf8');"
);

// We need to fix paths like we did for citySetting. 
// assert.match(mainSource, /windowManager.skinSelectorWindow\.loadFile\(path\.join\(__dirname, 'src', 'skin-selector\.html'\)\)/);
testCode = testCode.replace(
  /path\\\\\\.join\\\\\\(__dirname, 'src', 'skin-selector\\\\\\.html'\\\\\\)/g, 
  "path\\\\.join\\\\(__dirname, ('.*?', )*'src', 'skin-selector\\\\.html'\\\\)"
);
testCode = testCode.replace(
  /path\\\\\\.join\\\\\\(__dirname, 'preload', 'skinSelectorPreload\\\\\\.js'\\\\\\)/g, 
  "path\\\\.join\\\\(__dirname, ('.*?', )*'preload', 'skinSelectorPreload\\\\.js'\\\\)"
);


fs.writeFileSync('test/skinSelectorIntegration.test.js', testCode);
console.log('Fixed skin selector test');
