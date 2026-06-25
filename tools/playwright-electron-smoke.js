const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-pet-playwright-'));

function getElectronExecutable() {
  if (process.platform === 'win32') {
    return path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  }
  if (process.platform === 'darwin') {
    return path.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');
  }
  return path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron');
}

async function main() {
  let electronApp;
  try {
    electronApp = await electron.launch({
      executablePath: getElectronExecutable(),
      args: [
        `--user-data-dir=${userDataDir}`,
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '.',
      ],
      cwd: projectRoot,
      env: {
        ...process.env,
        DESKTOP_PET_USER_DATA_DIR: userDataDir,
        ELECTRON_ENABLE_LOGGING: '1',
      },
      timeout: 30000,
    });

    const appUserDataDir = await electronApp.evaluate(({ app }) => app.getPath('userData'));
    if (path.resolve(appUserDataDir) !== path.resolve(userDataDir)) {
      throw new Error(`Electron userData was not isolated: ${appUserDataDir}`);
    }

    const appWindow = await electronApp.firstWindow({ timeout: 15000 });
    await appWindow.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await appWindow.waitForTimeout(500);

    const diagnostics = await appWindow.evaluate(() => ({
      title: document.title,
      url: location.href,
      readyState: document.readyState,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      canScrollY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      petCount: document.querySelectorAll('.pet').length,
      visibility: window.__DEBUG_VISIBILITY || null,
    }));

    if (diagnostics.title !== '岳七 & 沈九 桌面宠物') {
      throw new Error(`Unexpected main window title: ${diagnostics.title}`);
    }
    if (diagnostics.readyState !== 'complete' && diagnostics.readyState !== 'interactive') {
      throw new Error(`Renderer did not become ready: ${diagnostics.readyState}`);
    }

    console.log(JSON.stringify({
      ok: true,
      userDataDir,
      appUserDataDir,
      diagnostics,
    }, null, 2));
  } finally {
    if (electronApp) {
      await electronApp.close().catch(() => {});
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  fs.rmSync(userDataDir, { recursive: true, force: true });
  process.exit(1);
});
