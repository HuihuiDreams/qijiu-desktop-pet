const fs = require('fs');

let content = fs.readFileSync('src/main/AppLifecycle.js', 'utf8');

// Replace the end of file
content = content.replace(/  app\.on\('window-all-closed', \(\) => \{\n    app\.quit\(\);\n  \}\);\n\}\n*/g, "  app.on('window-all-closed', () => {\n    app.quit();\n  });\n  }\n}\nmodule.exports = AppLifecycle;\n");

fs.writeFileSync('src/main/AppLifecycle.js', content);
