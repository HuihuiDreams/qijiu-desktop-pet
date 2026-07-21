const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

const originalRequire = Module.prototype.require;
let mockSpawnSyncCall = null;

Module.prototype.require = function(request) {
  if (request === 'child_process') {
    return {
      spawnSync: (command, args, options) => {
        mockSpawnSyncCall = { command, args, options };
        return { status: 0 };
      }
    };
  }
  return originalRequire.apply(this, arguments);
};

const afterPackModule = require('../scripts/afterPack');
const afterPack = afterPackModule.default;
const { resolveWindowsPowerShellPath } = afterPackModule;

Module.prototype.require = originalRequire;

test.beforeEach(() => {
  mockSpawnSyncCall = null;
});

test('resolveWindowsPowerShellPath prefers SystemRoot', () => {
  const env = { SystemRoot: 'C:\\Windows', windir: 'D:\\Windows' };
  const expected = path.win32.join('C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  assert.strictEqual(resolveWindowsPowerShellPath(env), expected);
});

test('resolveWindowsPowerShellPath falls back to windir', () => {
  const env = { windir: 'D:\\Windows' };
  const expected = path.win32.join('D:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  assert.strictEqual(resolveWindowsPowerShellPath(env), expected);
});

test('resolveWindowsPowerShellPath fails if paths are not absolute', () => {
  const env1 = { SystemRoot: 'Windows' };
  assert.throws(() => resolveWindowsPowerShellPath(env1), /Cannot resolve trusted Windows PowerShell path/);
  
  const env2 = {};
  assert.throws(() => resolveWindowsPowerShellPath(env2), /Cannot resolve trusted Windows PowerShell path/);
});

test('afterPack on win32 uses absolute PowerShell path and retains all arguments', async () => {
  const context = {
    electronPlatformName: 'win32',
    appOutDir: 'out',
    packager: {
      appInfo: { productFilename: 'App' },
      projectDir: 'proj'
    }
  };
  
  const originalEnv = process.env;
  process.env = { ...originalEnv, SystemRoot: 'C:\\Windows' };
  
  try {
    await afterPack(context);
  } finally {
    process.env = originalEnv;
  }
  
  assert.ok(mockSpawnSyncCall);
  assert.strictEqual(
    mockSpawnSyncCall.command, 
    path.win32.join('C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  );
  assert.deepStrictEqual(mockSpawnSyncCall.args, [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join('proj', 'scripts', 'set-win-icon.ps1'),
    '-ExePath',
    path.join('out', 'App.exe'),
    '-IconPath',
    path.join('proj', 'src', 'assets', 'icon.ico'),
  ]);
  assert.deepStrictEqual(mockSpawnSyncCall.options, {
    encoding: 'utf8',
    stdio: 'inherit',
  });
});

test('afterPack on non-win32 non-darwin returns early', async () => {
  const context = { electronPlatformName: 'linux' };
  await afterPack(context);
  assert.strictEqual(mockSpawnSyncCall, null);
});
