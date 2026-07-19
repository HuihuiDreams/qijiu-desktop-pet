const fs = require('fs');

let test1 = fs.readFileSync('test/skinSelectorIntegration.test.js', 'utf8');

// replace the assert.ok with a regex match which is more resilient to whitespace changes
test1 = test1.replace(
  /assert\.ok\(mainSource\.indexOf\('click: \(\) => \{\\n        deps\.openSkinSelector\(\);', traySkinEntry\) > traySkinEntry\);/g,
  "const clickStart = mainSource.indexOf('click:', traySkinEntry);\n  assert.ok(clickStart > traySkinEntry);\n  const clickContent = mainSource.slice(clickStart, clickStart + 100);\n  assert.match(clickContent, /deps\\.openSkinSelector\\(\\)/);"
);

fs.writeFileSync('test/skinSelectorIntegration.test.js', test1);
console.log('Fixed skinSelectorIntegration.test.js spacing');
