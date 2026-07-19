const fs = require('fs');
let content = fs.readFileSync('src/main/AppLifecycle.js', 'utf8');

content = content.replace("console.error('STARTING WHENREADY');", "");
content = content.replace("console.error('ABOUT TO CREATE WINDOW'); ", "");
content = content.replace("console.error('ABOUT TO INIT STORE'); ", "");
content = content.replace("console.error('ABOUT TO SYNC AUTOLAUNCH'); ", "");

fs.writeFileSync('src/main/AppLifecycle.js', content);
