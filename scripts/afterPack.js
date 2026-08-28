const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAC_EXECUTABLE_NAME = 'DeskPet';

exports.default = async function afterPack(context) {
  if (context.electronPlatformName === 'darwin') {
    rewriteMacExecutableName(context);
    return;
  }

  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'src', 'assets', 'icon.ico');
  const scriptPath = path.join(context.packager.projectDir, 'scripts', 'set-win-icon.ps1');
  const powershellPath = resolveWindowsPowerShellPath(process.env);
  const result = spawnSync(powershellPath, [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-ExePath',
    exePath,
    '-IconPath',
    iconPath,
  ], {
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Failed to update Windows executable resources: ${result.status}`);
  }
};

function rewriteMacExecutableName(context) {
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  const macOsDir = path.join(appPath, 'Contents', 'MacOS');
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  const originalExecutablePath = path.join(macOsDir, context.packager.appInfo.productFilename);
  const asciiExecutablePath = path.join(macOsDir, MAC_EXECUTABLE_NAME);

  if (fs.existsSync(originalExecutablePath) && originalExecutablePath !== asciiExecutablePath) {
    if (fs.existsSync(asciiExecutablePath)) {
      fs.rmSync(asciiExecutablePath, { force: true });
    }
    fs.renameSync(originalExecutablePath, asciiExecutablePath);
  }

  if (!fs.existsSync(asciiExecutablePath)) {
    throw new Error(`Failed to find macOS executable: ${asciiExecutablePath}`);
  }

  const result = spawnSync('/usr/bin/plutil', [
    '-replace',
    'CFBundleExecutable',
    '-string',
    MAC_EXECUTABLE_NAME,
    plistPath,
  ], {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    throw new Error(`Failed to update macOS CFBundleExecutable: ${result.stderr || result.stdout}`);
  }

  // Fixing the ad-hoc signature since we modified Info.plist and renamed the executable.
  // Without this, the app will crash on launch with Permission Denied (1100) on macOS ARM64.
  const codesignResult = spawnSync('/usr/bin/codesign', [
    '--force',
    '--deep',
    '--sign',
    '-',
    appPath,
  ], {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (codesignResult.status !== 0) {
    throw new Error(`Failed to ad-hoc sign the app: ${codesignResult.stderr || codesignResult.stdout}`);
  }
}

function resolveWindowsPowerShellPath(env) {
  const systemRoot = env.SystemRoot || env.windir;
  if (!systemRoot || !path.win32.isAbsolute(systemRoot)) {
    throw new Error('Cannot resolve trusted Windows PowerShell path: missing or invalid SystemRoot/windir environment variable.');
  }
  return path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

exports.MAC_EXECUTABLE_NAME = MAC_EXECUTABLE_NAME;
exports.rewriteMacExecutableName = rewriteMacExecutableName;
exports.resolveWindowsPowerShellPath = resolveWindowsPowerShellPath;
