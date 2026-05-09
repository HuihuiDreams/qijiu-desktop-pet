const { spawnSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
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
