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
  const result = spawnSync('powershell.exe', [
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
}

exports.MAC_EXECUTABLE_NAME = MAC_EXECUTABLE_NAME;
exports.rewriteMacExecutableName = rewriteMacExecutableName;
