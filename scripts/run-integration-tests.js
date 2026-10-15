'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const integrationTestDir = path.join(projectRoot, 'test', 'integration');

if (!fs.existsSync(integrationTestDir)) {
  console.error(`Integration test directory not found: ${integrationTestDir}`);
  process.exit(1);
}

const testFiles = fs.readdirSync(integrationTestDir)
  .filter((file) => file.endsWith('.test.js'))
  .map((file) => path.join('test', 'integration', file));

if (testFiles.length === 0) {
  console.log('No integration test files found.');
  process.exit(0);
}

const userArgs = process.argv.slice(2);
const explicitFiles = userArgs.filter((arg) => !arg.startsWith('-') && arg.endsWith('.test.js'));
const flags = userArgs.filter((arg) => arg.startsWith('-'));
const filesToRun = explicitFiles.length > 0 ? explicitFiles : testFiles;

console.log(`Running ${filesToRun.length} integration test suite(s)...`);

const result = spawnSync(process.execPath, ['--test', ...flags, ...filesToRun], {
  cwd: projectRoot,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
