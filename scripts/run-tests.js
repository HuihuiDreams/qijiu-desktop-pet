const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const testDir = path.join(projectRoot, 'test');
const integrationTestDir = path.join(testDir, 'integration');

const unitTestFiles = fs.readdirSync(testDir)
  .filter((file) => file.endsWith('.test.js'))
  .map((file) => path.join('test', file));

const integrationTestFiles = fs.existsSync(integrationTestDir)
  ? fs.readdirSync(integrationTestDir)
      .filter((file) => file.endsWith('.test.js'))
      .map((file) => path.join('test', 'integration', file))
  : [];

const testFiles = [...unitTestFiles, ...integrationTestFiles];

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: projectRoot,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
