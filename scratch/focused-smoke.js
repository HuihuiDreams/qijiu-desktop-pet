const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-pet-playwright-'));
  const electronApp = await electron.launch({
    executablePath: path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
    args: [
      `--user-data-dir=${userDataDir}`,
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--enable-logging',
      '.'
    ],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
  });

  electronApp.process().stdout.on('data', data => process.stdout.write(data));
  electronApp.process().stderr.on('data', data => process.stderr.write(data));

  electronApp.process().on('exit', (code, signal) => {
    console.error(`ELECTRON PROCESS EXITED WITH CODE ${code} SIGNAL ${signal}`);
  });

  try {
    const appWindow = await electronApp.firstWindow({ timeout: 15000 });
    console.log("FIRST WINDOW DETECTED:", await appWindow.evaluate(() => window.location.href));
    
    const [selectorWindow] = await Promise.all([
      electronApp.waitForEvent('window', { predicate: async (page) => {
          const url = await page.evaluate(() => window.location.href);
          console.log("Found window with url:", url);
          return url.includes('skin-selector.html');
      }}),
      electronApp.evaluate(async ({ app }) => {
        app.openSkinSelectorForQA();
      })
    ]);
    
    console.log("SELECTOR WINDOW DETECTED:", await selectorWindow.evaluate(() => window.location.href));
    
    await selectorWindow.waitForLoadState('domcontentloaded');
    console.log("SELECTOR WINDOW LOADED");
    
    const title = await selectorWindow.evaluate(() => document.title);
    console.log("TITLE IS:", title);
  } catch (err) {
    console.error("TEST FAILED:", err);
  } finally {
    console.log("WAITING 2 SECONDS BEFORE CLOSING");
    await new Promise(r => setTimeout(r, 2000));
    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}
main();
