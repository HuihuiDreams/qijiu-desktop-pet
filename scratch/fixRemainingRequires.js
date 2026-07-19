const fs = require('fs');
let content = fs.readFileSync('src/main/AppLifecycle.js', 'utf8');

content = content.replace(/require\('\.\/protectedAssetLoader'\)/g, "require('../../protectedAssetLoader')");
content = content.replace(/require\('\.\/protectedAssetProtocol'\)/g, "require('../../protectedAssetProtocol')");
content = content.replace(/require\('\.\/src\/data\/i18n'\)/g, "require('../../src/data/i18n')");
content = content.replace(/require\('\.\/src\/main\/windows\/StatusWindow'\)/g, "require('./windows/StatusWindow')");
content = content.replace(/require\('\.\/src\/main\/windows\/CitySettingWindow'\)/g, "require('./windows/CitySettingWindow')");
content = content.replace(/require\('\.\/src\/main\/windows\/SkinSelectorWindow'\)/g, "require('./windows/SkinSelectorWindow')");
content = content.replace(/require\('\.\/src\/main\/windows\/PomodoroWindow'\)/g, "require('./windows/PomodoroWindow')");

fs.writeFileSync('src/main/AppLifecycle.js', content);
