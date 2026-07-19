const fs = require('fs');
const main = fs.readFileSync('main.js', 'utf8');

// I will just use regex to extract the whole buildTrayMenu function
const buildTrayMenuMatch = main.match(/function buildTrayMenu\(\) \{[\s\S]*?return Menu\.buildFromTemplate\(template\);\n\}/);
if (buildTrayMenuMatch) {
  fs.writeFileSync('scratch/buildTrayMenu.txt', buildTrayMenuMatch[0]);
}

const createTrayMatch = main.match(/function createTray\(\) \{[\s\S]*?refreshTrayMenu\(\);\n\}/);
if (createTrayMatch) {
  fs.writeFileSync('scratch/createTray.txt', createTrayMatch[0]);
}
