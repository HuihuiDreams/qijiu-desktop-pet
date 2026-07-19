const fs = require('fs');
let content = fs.readFileSync('src/main/AppLifecycle.js', 'utf8');

content = content.replace(/require\('\.\.\/\.\.\/i18n'\)/g, "require('../data/i18n')");

fs.writeFileSync('src/main/AppLifecycle.js', content);
