const fs = require('fs');
let content = fs.readFileSync('src/main/AppLifecycle.js', 'utf8');

content = content.replace(/require\('\.\/src\/systems\/PomodoroSystem'\)/g, "require('../../src/systems/PomodoroSystem')");

fs.writeFileSync('src/main/AppLifecycle.js', content);
