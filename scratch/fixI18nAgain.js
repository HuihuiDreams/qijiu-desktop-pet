const fs = require('fs');
let content = fs.readFileSync('src/main/AppLifecycle.js', 'utf8');

content = content.replace(/I18N: require\('\.\.\/data\/i18n'\)/g, "I18N: require('../data/i18n').I18N");

fs.writeFileSync('src/main/AppLifecycle.js', content);
