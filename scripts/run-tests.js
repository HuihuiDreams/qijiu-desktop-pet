const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const testDir = path.join(projectRoot, 'test');

const testFiles = fs.readdirSync(testDir)
  .filter((file) => file.endsWith('.test.js'))
  .map((file) => path.join('test', file));

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: projectRoot,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
