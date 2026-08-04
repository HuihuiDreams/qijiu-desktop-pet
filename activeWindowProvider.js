const { execFile } = require('child_process');
const path = require('path');
const { getSafeChildProcessEnv } = require('./meetingDetector');

const UNAVAILABLE_SOURCE = 'unavailable';

function unavailableActiveWindowInfo(reason = 'unavailable', sampledAt = Date.now(), details = null) {
  return {
    active: false,
    sampledAt,
    source: UNAVAILABLE_SOURCE,
    reason,
    ...(details ? { details } : {}),
    window: null,
  };
}

function normalizeRect(bounds) {
  if (!bounds) return null;
  const rect = {
    x: Number(bounds.x),
    y: Number(bounds.y),
    width: Number(bounds.width),
    height: Number(bounds.height),
  };

  if (!Number.isFinite(rect.x)
    || !Number.isFinite(rect.y)
    || !Number.isFinite(rect.width)
    || !Number.isFinite(rect.height)
    || rect.width <= 0
    || rect.height <= 0) {
    return null;
  }

  return rect;
}

function normalizeActiveWindowInfo(raw, sampledAt = Date.now()) {
  const bounds = normalizeRect(raw?.bounds);
  if (!raw || !bounds) {
    return unavailableActiveWindowInfo('missing-bounds', sampledAt);
  }

  return {
    active: true,
    sampledAt: Number.isFinite(Number(raw.sampledAt)) ? Number(raw.sampledAt) : sampledAt,
    source: raw.source || 'active-window',
    window: {
      id: raw.id == null ? null : String(raw.id),
      title: raw.title == null ? '' : String(raw.title),
      ownerName: raw.ownerName == null ? '' : String(raw.ownerName),
      bounds,
      isMinimized: Boolean(raw.isMinimized),
      isMaximized: Boolean(raw.isMaximized),
      isFullScreen: Boolean(raw.isFullScreen),
    },
  };
}

function createUnavailableActiveWindowProvider(reason = 'unsupported-platform') {
  return {
    async getActiveWindowInfo() {
      return unavailableActiveWindowInfo(reason);
    },
  };
}

function parseWindowsProviderOutput(stdout, sampledAt) {
  try {
    const raw = JSON.parse(stdout);
    if (!raw || raw.active === false) {
      return unavailableActiveWindowInfo(raw?.reason || 'unavailable', sampledAt);
    }
    return normalizeActiveWindowInfo(raw, sampledAt);
  } catch {
    return unavailableActiveWindowInfo('parse-failed', sampledAt);
  }
}

function getSystemPowerShellPath(execFileImpl) {
  if (execFileImpl && execFileImpl !== execFile) {
    return 'powershell.exe';
  }
  if (process.platform !== 'win32') {
    return 'powershell.exe';
  }
  const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return path.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function createWindowsActiveWindowProvider(options = {}) {
  const execFileImpl = options.execFile || execFile;
  const powershellPath = options.powershellPath || getSystemPowerShellPath(execFileImpl);
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 5000;
  const currentPid = Number.isFinite(options.currentPid) ? options.currentPid : process.pid;

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class NativeWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", SetLastError=true)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", SetLastError=true)] public static extern int GetClassName(IntPtr hWnd, StringBuilder className, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint dwFlags);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO info);
}
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
[StructLayout(LayoutKind.Sequential)]
public struct MONITORINFO { public uint cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
"@
$GW_HWNDNEXT = 2
$MONITOR_DEFAULTTONEAREST = 2
$ignoredClasses = @("Progman", "WorkerW", "Shell_TrayWnd")
$shellWindow = [NativeWindow]::GetShellWindow()
$sawIgnoredWindow = $false
$handle = [NativeWindow]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero) {
  @{ active = $false; reason = "no-active-window" } | ConvertTo-Json -Compress
  exit 0
}

while ($handle -ne [IntPtr]::Zero) {
  $classBuilder = New-Object System.Text.StringBuilder 256
  [void][NativeWindow]::GetClassName($handle, $classBuilder, $classBuilder.Capacity)
  $className = $classBuilder.ToString()
  $rect = New-Object RECT
  $hasBounds = [NativeWindow]::GetWindowRect($handle, [ref]$rect)
  $pidValue = [uint32]0
  [void][NativeWindow]::GetWindowThreadProcessId($handle, [ref]$pidValue)
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  $shouldSkip = $false

  if ($handle -eq $shellWindow) { $shouldSkip = $true }
  if (-not [NativeWindow]::IsWindowVisible($handle)) { $shouldSkip = $true }
  if (-not $hasBounds -or $width -le 0 -or $height -le 0) { $shouldSkip = $true }
  if ($ignoredClasses -contains $className) { $shouldSkip = $true }
  if ($pidValue -eq ${currentPid}) {
    $shouldSkip = $true
    $sawIgnoredWindow = $true
  }

  if (-not $shouldSkip) {
    $processName = ""
    try { $processName = (Get-Process -Id $pidValue -ErrorAction Stop).ProcessName } catch {}
    $titleBuilder = New-Object System.Text.StringBuilder 512
    [void][NativeWindow]::GetWindowText($handle, $titleBuilder, $titleBuilder.Capacity)

    $isFullScreen = $false
    $monitor = [NativeWindow]::MonitorFromWindow($handle, $MONITOR_DEFAULTTONEAREST)
    if ($monitor -ne [IntPtr]::Zero) {
      $mi = New-Object MONITORINFO
      $mi.cbSize = [uint32][System.Runtime.InteropServices.Marshal]::SizeOf($mi)
      if ([NativeWindow]::GetMonitorInfo($monitor, [ref]$mi)) {
        $mLeft = $mi.rcMonitor.Left
        $mTop = $mi.rcMonitor.Top
        $mRight = $mi.rcMonitor.Right
        $mBottom = $mi.rcMonitor.Bottom
        $tolerance = 8
        $coversMonitor = ($rect.Left -le $mLeft + $tolerance) -and ($rect.Top -le $mTop + $tolerance) -and ($rect.Right -ge $mRight - $tolerance) -and ($rect.Bottom -ge $mBottom - $tolerance)
        $isMaximized = [NativeWindow]::IsZoomed($handle)
        $isFullScreen = (-not $isMaximized) -and $coversMonitor
      }
    }

    @{
      active = $true
      source = "active-window"
      id = $handle.ToInt64().ToString()
      title = $titleBuilder.ToString()
      ownerName = $processName
      bounds = @{ x = $rect.Left; y = $rect.Top; width = $width; height = $height }
      isMinimized = [NativeWindow]::IsIconic($handle)
      isMaximized = [NativeWindow]::IsZoomed($handle)
      isFullScreen = $isFullScreen
    } | ConvertTo-Json -Compress
    exit 0
  }

  $handle = [NativeWindow]::GetWindow($handle, $GW_HWNDNEXT)
}

$reason = "no-active-window"
if ($sawIgnoredWindow) { $reason = "ignored-window" }
@{ active = $false; reason = $reason } | ConvertTo-Json -Compress
`;

  return {
    async getActiveWindowInfo() {
      const sampledAt = Date.now();
      return new Promise((resolve) => {
        execFileImpl(
          powershellPath,
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
          { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 64, env: getSafeChildProcessEnv() },
          (error, stdout, stderr) => {
            if (error) {
              resolve(unavailableActiveWindowInfo('provider-failed', sampledAt, {
                code: error.code || null,
                signal: error.signal || null,
                message: error.message || String(error),
                stderr: stderr || '',
              }));
              return;
            }
            resolve(parseWindowsProviderOutput(stdout, sampledAt));
          },
        );
      });
    },
  };
}

function createMacActiveWindowProvider(options = {}) {
  const execFileImpl = options.execFile || execFile;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 5000;

  return {
    async getActiveWindowInfo() {
      const sampledAt = Date.now();
      return new Promise((resolve) => {
        execFileImpl(
          'pmset',
          ['-g', 'assertions'],
          { timeout: timeoutMs, env: getSafeChildProcessEnv() },
          (error, stdout, stderr) => {
            if (error) {
              resolve(unavailableActiveWindowInfo('provider-failed', sampledAt, {
                code: error.code || null,
                signal: error.signal || null,
                message: error.message || String(error),
                stderr: stderr || '',
              }));
              return;
            }
            const preventSleepMatch = stdout.match(/PreventUserIdleDisplaySleep\s+(\d+)/);
            const isPrevented = Boolean(preventSleepMatch && preventSleepMatch[1] !== '0');

            resolve({
              active: true,
              sampledAt,
              source: 'pmset-assertions',
              window: {
                id: null,
                title: '',
                ownerName: '',
                bounds: { x: 0, y: 0, width: 0, height: 0 },
                isMinimized: false,
                isMaximized: false,
                isFullScreen: isPrevented,
              },
            });
          }
        );
      });
    },
  };
}

function createActiveWindowProvider(platform = process.platform, options = {}) {
  if (platform === 'win32') return createWindowsActiveWindowProvider(options);
  if (platform === 'darwin') return createMacActiveWindowProvider(options);
  return createUnavailableActiveWindowProvider('unsupported-platform');
}

module.exports = {
  createActiveWindowProvider,
  createMacActiveWindowProvider,
  createUnavailableActiveWindowProvider,
  createWindowsActiveWindowProvider,
  getSafeChildProcessEnv,
  getSystemPowerShellPath,
  normalizeActiveWindowInfo,
  parseWindowsProviderOutput,
  unavailableActiveWindowInfo,
};
