'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');

const projectRoot = path.resolve(__dirname, '../../..');

/**
 * Launch the Electron app with an isolated userData directory.
 * Returns { electronApp, userDataDir }.
 * Always call closeApp() in an afterEach/finally to clean up.
 */
async function launchApp() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-pet-e2e-'));

  const launchEnv = {
    ...process.env,
    DESKTOP_PET_USER_DATA_DIR: userDataDir,
    ELECTRON_ENABLE_LOGGING: '0',
  };
  // Prevent Electron from running as Node when launched by Playwright
  delete launchEnv.ELECTRON_RUN_AS_NODE;

  const executablePath = getElectronExecutable();

  const electronApp = await electron.launch({
    executablePath,
    args: [
      `--user-data-dir=${userDataDir}`,
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '.',
    ],
    cwd: projectRoot,
    env: launchEnv,
    timeout: 30000,
  });

  return { electronApp, userDataDir };
}

/**
 * Close the Electron app and remove the temporary userData directory.
 */
async function closeApp(electronApp, userDataDir) {
  if (electronApp) {
    await electronApp.close().catch(() => {});
  }
  if (userDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

function getElectronExecutable() {
  if (process.platform === 'win32') {
    return path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  }
  if (process.platform === 'darwin') {
    return path.join(
      projectRoot,
      'node_modules',
      'electron',
      'dist',
      'Electron.app',
      'Contents',
      'MacOS',
      'Electron',
    );
  }
  return path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron');
}

module.exports = { launchApp, closeApp };
