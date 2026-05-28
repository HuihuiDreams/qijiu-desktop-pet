const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createActiveWindowProvider,
  createUnavailableActiveWindowProvider,
  createWindowsActiveWindowProvider,
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

test('provider selection uses Windows implementation only for win32', async () => {
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
  const macProvider = createActiveWindowProvider('darwin');
  const linuxProvider = createActiveWindowProvider('linux');

  assert.equal((await winProvider.getActiveWindowInfo()).active, true);
  assert.equal((await macProvider.getActiveWindowInfo()).reason, 'unsupported-platform');
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
