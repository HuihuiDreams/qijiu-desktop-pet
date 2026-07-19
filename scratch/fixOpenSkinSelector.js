const fs = require('fs');
let content = fs.readFileSync('src/main/AppLifecycle.js', 'utf8');

const regex = /function openSkinSelector\(\) \{[\s\S]*?\}\napp\.openSkinSelectorForQA = openSkinSelector;/;
content = content.replace(regex, "app.openSkinSelectorForQA = skinSelectorWindowModule.openSkinSelectorWindow;");

fs.writeFileSync('src/main/AppLifecycle.js', content);
