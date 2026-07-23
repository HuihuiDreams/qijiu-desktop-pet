const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { _electron: electron } = require('playwright');

const mockAppScript = `
const { app, protocol, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

class Store {
  constructor() {
    this.path = path.join(app.getPath('userData'), 'mock-store.json');
    this.data = fs.existsSync(this.path) ? JSON.parse(fs.readFileSync(this.path)) : {};
  }
  get(key) { return this.data[key]; }
  set(key, val) {
    this.data[key] = val;
    fs.writeFileSync(this.path, JSON.stringify(this.data));
  }
}

protocol.registerSchemesAsPrivileged([{
  scheme: 'mock-asset',
  privileges: { standard: true, secure: true, supportFetchAPI: true }
}]);

let requestCount = 0;

app.whenReady().then(() => {
  protocol.handle('mock-asset', (request) => {
    requestCount++;
    return new Response(Buffer.from('asset_content_' + requestCount), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  });

  const store = new Store();
  const currentVersion = process.env.MOCK_VERSION || '1.0.0';
  const lastCacheVersion = store.get('lastCacheVersion');
  const forceClear = process.argv.includes('--clear-cache');

  // Same logic as PetWindow.js
  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });

  const doLoad = () => {
    win.loadURL('data:text/html,<body><script>fetch("mock-asset://test").then(r=>r.text()).then(t=>require("electron").ipcRenderer.send("asset-loaded", t))</script></body>');
  };

  if (forceClear || lastCacheVersion !== currentVersion) {
    win.webContents.session.clearCache().finally(() => {
      store.set('lastCacheVersion', currentVersion);
      doLoad();
    });
  } else {
    doLoad();
  }

  ipcMain.on('asset-loaded', (e, content) => {
    console.log('TEST_RESULT:' + JSON.stringify({ content, requestCount }));
    app.quit();
  });
});
`;

test('Cache upgrade integration: clears cache on version change and persists on hot start', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-pet-cache-test-'));
  const appPath = path.join(userDataDir, 'main.js');
  fs.writeFileSync(appPath, mockAppScript);

  const runPhase = async (version, extraArgs = []) => {
    const electronApp = await electron.launch({
      args: [appPath, ...extraArgs],
      env: { ...process.env, MOCK_VERSION: version },
      userDataDir
    });

    return new Promise((resolve) => {
      electronApp.process().stdout.on('data', (data) => {
        const text = data.toString();
        const match = text.match(/TEST_RESULT:(.+)/);
        if (match) {
          resolve(JSON.parse(match[1]));
        }
      });
    });
  };

  try {
    // Phase 1: First launch (version 1.0.0). Cache should be empty, so requestCount=1.
    const res1 = await runPhase('1.0.0');
    assert.equal(res1.requestCount, 1);
    assert.equal(res1.content, 'asset_content_1');

    // Phase 2: Hot start (version 1.0.0). Cache should be hit, so requestCount remains 0 in the new app instance!
    const res2 = await runPhase('1.0.0');
    assert.equal(res2.requestCount, 0, 'Should not fetch from protocol handler on hot start');
    assert.equal(res2.content, 'asset_content_1', 'Should load cached content');

    // Phase 3: Version upgrade (version 1.1.0). Cache should be cleared, so requestCount=1.
    const res3 = await runPhase('1.1.0');
    assert.equal(res3.requestCount, 1, 'Should fetch from protocol handler after version upgrade');
    assert.equal(res3.content, 'asset_content_1', 'Counter is local to the new instance');

    // Phase 4: CLI flag force clear (version 1.1.0). Cache should be cleared despite version match.
    const res4 = await runPhase('1.1.0', ['--clear-cache']);
    assert.equal(res4.requestCount, 1, 'Should fetch from protocol handler when --clear-cache is passed');

  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
