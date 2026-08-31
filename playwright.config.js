const { defineConfig } = require('@playwright/test');
const electronPath = require('electron');

module.exports = defineConfig({
  testDir: 'test/e2e',
  timeout: 40000,
  retries: 0,
  workers: 1, // Electron E2E tests must run serially
  reporter: [['list']],
  use: {
    electronExecutable: electronPath,
  },
});
