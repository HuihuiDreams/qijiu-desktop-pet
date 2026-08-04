const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createActiveWindowProvider,
  createMacActiveWindowProvider,
  createUnavailableActiveWindowProvider,
  createWindowsActiveWindowProvider,
  getSystemPowerShellPath,
  normalizeActiveWindowInfo,
} = require('../activeWindowProvider');

test('normalizes active window provider records', () => {
  const info = normalizeActiveWindowInfo({
    id: 123,
    title: 'Visual Studio Code',
    ownerName: 'Code',
    bounds: { x: 120, y: 80, width: 1400, height: 900 },
    isMinimized: false,
    isMaximized: false,
    isFullScreen: false,
  }, 1770000000000);

  assert.deepEqual(info, {
    active: true,
    sampledAt: 1770000000000,
    source: 'active-window',
    window: {
      id: '123',
      title: 'Visual Studio Code',
      ownerName: 'Code',
      bounds: { x: 120, y: 80, width: 1400, height: 900 },
      isMinimized: false,
      isMaximized: false,
      isFullScreen: false,
    },
  });
});

test('missing active window bounds become unavailable instead of throwing', () => {
  const info = normalizeActiveWindowInfo({ title: 'No bounds' }, 1770000000000);

  assert.equal(info.active, false);
  assert.equal(info.source, 'unavailable');
  assert.equal(info.reason, 'missing-bounds');
  assert.equal(info.window, null);
});

test('unavailable provider returns stable fallback shape', async () => {
  const provider = createUnavailableActiveWindowProvider('unsupported-platform');
  const info = await provider.getActiveWindowInfo();

  assert.equal(info.active, false);
  assert.equal(info.source, 'unavailable');
  assert.equal(info.reason, 'unsupported-platform');
  assert.equal(info.window, null);
  assert.equal(Number.isFinite(info.sampledAt), true);
});

test('provider selection creates specific implementations based on platform', async () => {
  const winProvider = createActiveWindowProvider('win32', {
    execFile: (_file, _args, _options, callback) => {
      callback(null, JSON.stringify({
        active: true,
        id: '1',
        title: 'Explorer',
        ownerName: 'explorer',
        bounds: { x: 0, y: 0, width: 800, height: 600 },
      }));
    },
  });
  const macProvider = createActiveWindowProvider('darwin', {
    execFile: (_file, _args, _options, callback) => {
      callback(null, 'PreventUserIdleDisplaySleep    0');
    }
  });
  const linuxProvider = createActiveWindowProvider('linux');

  assert.equal((await winProvider.getActiveWindowInfo()).active, true);
  assert.equal((await macProvider.getActiveWindowInfo()).active, true);
  assert.equal((await linuxProvider.getActiveWindowInfo()).reason, 'unsupported-platform');
});

test('Windows provider failure returns unavailable fallback', async () => {
  const provider = createWindowsActiveWindowProvider({
    execFile: (_file, _args, _options, callback) => {
      callback(new Error('boom'), '', 'bad things');
    },
  });

  const info = await provider.getActiveWindowInfo();

  assert.equal(info.active, false);
  assert.equal(info.reason, 'provider-failed');
  assert.equal(info.details.message, 'boom');
  assert.equal(info.details.stderr, 'bad things');
});

test('Windows provider can skip the app window and continue down z-order', async () => {
  let script = '';
  const provider = createWindowsActiveWindowProvider({
    currentPid: 1234,
    execFile: (_file, args, _options, callback) => {
      script = args[args.length - 1];
      callback(null, JSON.stringify({
        active: false,
        reason: 'ignored-window',
      }));
    },
  });

  await provider.getActiveWindowInfo();

  assert.match(script, /GetWindow\(IntPtr hWnd, uint uCmd\)/);
  assert.match(script, /\$GW_HWNDNEXT = 2/);
  assert.match(script, /\$sawIgnoredWindow = \$false/);
  assert.match(script, /\$handle = \[NativeWindow\]::GetWindow\(\$handle, \$GW_HWNDNEXT\)/);
});

test('Windows provider script samples true full-screen signal via monitor bounds', async () => {
  let script = '';
  const provider = createWindowsActiveWindowProvider({
    currentPid: 1234,
    execFile: (_file, args, _options, callback) => {
      script = args[args.length - 1];
      callback(null, JSON.stringify({
        active: true,
        id: '5',
        title: 'PowerPoint Slide Show',
        ownerName: 'POWERPNT',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        isMaximized: false,
        isFullScreen: true,
      }));
    },
  });

  const info = await provider.getActiveWindowInfo();

  assert.match(script, /MonitorFromWindow/);
  assert.match(script, /GetMonitorInfo/);
  assert.match(script, /\$isFullScreen = \(-not \$isMaximized\) -and \$coversMonitor/);
  assert.equal(info.window.isFullScreen, true);
  assert.equal(info.window.isMaximized, false);
});

test('Windows provider reports maximized office window as not full-screen', async () => {
  const provider = createWindowsActiveWindowProvider({
    execFile: (_file, _args, _options, callback) => {
      callback(null, JSON.stringify({
        active: true,
        id: '7',
        title: 'Visual Studio Code',
        ownerName: 'Code',
        bounds: { x: 0, y: 0, width: 1920, height: 1040 },
        isMinimized: false,
        isMaximized: true,
        isFullScreen: false,
      }));
    },
  });

  const info = await provider.getActiveWindowInfo();

  assert.equal(info.window.isMaximized, true);
  assert.equal(info.window.isFullScreen, false);
});

test('Windows provider parse failure still returns unavailable', async () => {
  const provider = createWindowsActiveWindowProvider({
    execFile: (_file, _args, _options, callback) => {
      callback(null, 'not-json');
    },
  });

  const info = await provider.getActiveWindowInfo();

  assert.equal(info.active, false);
  assert.equal(info.source, 'unavailable');
  assert.equal(info.reason, 'parse-failed');
  assert.equal(info.window, null);
});

test('getSystemPowerShellPath resolves absolute path on win32 (TH-03)', () => {
  const p = getSystemPowerShellPath();
  if (process.platform === 'win32') {
    assert.match(p, /WindowsPowerShell[/\\]v1\.0[/\\]powershell\.exe$/i);
  } else {
    assert.equal(p, 'powershell.exe');
  }
});

test('mac provider uses pmset and parses prevented sleep', async () => {
  const provider = createMacActiveWindowProvider({
    execFile: (_file, _args, _options, callback) => {
      callback(null, 'PreventUserIdleDisplaySleep    1');
    },
  });

  const info = await provider.getActiveWindowInfo();
  assert.equal(info.active, true);
  assert.equal(info.source, 'pmset-assertions');
  assert.equal(info.window.isFullScreen, true);
});

test('mac provider uses pmset and parses no prevented sleep', async () => {
  const provider = createMacActiveWindowProvider({
    execFile: (_file, _args, _options, callback) => {
      callback(null, 'PreventUserIdleDisplaySleep    0');
    },
  });

  const info = await provider.getActiveWindowInfo();
  assert.equal(info.active, true);
  assert.equal(info.source, 'pmset-assertions');
  assert.equal(info.window.isFullScreen, false);
});

test('mac provider returns unavailable fallback on pmset failure', async () => {
  const provider = createMacActiveWindowProvider({
    execFile: (_file, _args, _options, callback) => {
      callback(new Error('pmset missing'), '', 'not found');
    },
  });

  const info = await provider.getActiveWindowInfo();
  assert.equal(info.active, false);
  assert.equal(info.reason, 'provider-failed');
});
