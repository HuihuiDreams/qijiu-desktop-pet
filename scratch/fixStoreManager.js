const fs = require('fs');
let content = fs.readFileSync('src/main/AppLifecycle.js', 'utf8');

content = content.replace(/await initStore\(\)/g, "await StoreManager.initStore()");
content = content.replace(/const store = getStore\(\)/g, "const store = StoreManager.getStore()");

fs.writeFileSync('src/main/AppLifecycle.js', content);
