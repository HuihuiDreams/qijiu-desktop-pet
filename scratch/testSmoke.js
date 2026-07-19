const { _electron: electron } = require('playwright');
const path = require('path');
async function run() {
  const electronApp = await electron.launch({
    executablePath: path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
    args: ['--disable-gpu', '--no-sandbox', '.'],
    cwd: '/Users/huihui/Documents/qijiu-desktop-pet',
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
  });
  
  electronApp.process().stdout.on('data', data => process.stdout.write(data));
  electronApp.process().stderr.on('data', data => process.stderr.write(data));

  console.log("Launched");
  const appWindow = await electronApp.firstWindow();
  console.log("Got first window");
  
  setTimeout(() => {
     console.log("Timeout reached, exiting");
     process.exit(1);
  }, 10000);

  const [selectorWindow] = await Promise.all([
    electronApp.waitForEvent('window', { predicate: async (page) => {
        const url = await page.evaluate(() => window.location.href);
        return url.includes('skin-selector.html');
    }}),
    electronApp.evaluate(async ({ app }) => {
      console.log("Evaluating openSkinSelectorForQA");
      app.openSkinSelectorForQA();
      console.log("Evaluated");
    })
  ]);
  console.log("Got selector window!");
  process.exit(0);
}
run();
