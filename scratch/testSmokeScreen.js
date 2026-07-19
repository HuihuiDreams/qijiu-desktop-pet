const { _electron: electron } = require('playwright');
const path = require('path');
async function run() {
  const electronApp = await electron.launch({
    executablePath: path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
    args: ['--enable-logging', '--disable-gpu', '--no-sandbox', '.'],
    cwd: '/Users/huihui/Documents/qijiu-desktop-pet',
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
  });
  
  electronApp.process().stdout.on('data', d => process.stdout.write(d));
  electronApp.process().stderr.on('data', d => process.stderr.write(d));

  const [selectorWindow] = await Promise.all([
    electronApp.waitForEvent('window', { predicate: async (page) => {
        const url = await page.evaluate(() => window.location.href);
        return url.includes('skin-selector.html');
    }}),
    electronApp.evaluate(async ({ app }) => {
      app.openSkinSelectorForQA();
    })
  ]);
  
  console.log("SUCCESS!");
  process.exit(0);
}
run();
