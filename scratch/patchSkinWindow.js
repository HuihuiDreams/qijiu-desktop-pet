const fs = require('fs');
let content = fs.readFileSync('src/main/windows/SkinSelectorWindow.js', 'utf8');

content = content.replace(/function openSkinSelectorWindow\(\) \{/, 'function openSkinSelectorWindow() { console.error("DEPS IS:", deps);');

fs.writeFileSync('src/main/windows/SkinSelectorWindow.js', content);
