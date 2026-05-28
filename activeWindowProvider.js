const { execFile } = require('child_process');

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

function createWindowsActiveWindowProvider(options = {}) {
  const execFileImpl = options.execFile || execFile;
  const powershellPath = options.powershellPath || 'powershell.exe';
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
}
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
"@
$GW_HWNDNEXT = 2
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
    @{
      active = $true
      source = "active-window"
      id = $handle.ToInt64().ToString()
      title = $titleBuilder.ToString()
      ownerName = $processName
      bounds = @{ x = $rect.Left; y = $rect.Top; width = $width; height = $height }
      isMinimized = [NativeWindow]::IsIconic($handle)
      isMaximized = [NativeWindow]::IsZoomed($handle)
      isFullScreen = $false
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
          { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 64 },
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

function createActiveWindowProvider(platform = process.platform, options = {}) {
  if (platform === 'win32') return createWindowsActiveWindowProvider(options);
  if (platform === 'darwin') return createUnavailableActiveWindowProvider('unsupported-platform');
  return createUnavailableActiveWindowProvider('unsupported-platform');
}

module.exports = {
  createActiveWindowProvider,
  createUnavailableActiveWindowProvider,
  createWindowsActiveWindowProvider,
  normalizeActiveWindowInfo,
  parseWindowsProviderOutput,
  unavailableActiveWindowInfo,
};
