const { defineConfig } = require('@playwright/test');
const path = require('node:path');

function getElectronExecutable() {
  if (process.platform === 'win32') {
    return path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
  }
  if (process.platform === 'darwin') {
    return path.join(
      __dirname,
      'node_modules',
      'electron',
      'dist',
      'Electron.app',
      'Contents',
      'MacOS',
      'Electron',
    );
  }
  return path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron');
}

module.exports = defineConfig({
  testDir: 'test/e2e',
  timeout: 40000,
  retries: 0,
  workers: 1, // Electron E2E tests must run serially
  reporter: [['list']],
  use: {
    electronExecutable: getElectronExecutable(),
  },
});
