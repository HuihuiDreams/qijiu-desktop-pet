const fs = require('fs');
const path = require('path');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'TrayManager.js'), 'utf8');
console.log((mainSource.match(/label:\s*updateMenuState\.checking/g) || []).length);
console.log(mainSource.includes('label: updateMenuState.checking'));
