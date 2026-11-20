const { execFile, spawn } = require('child_process');
const readline = require('readline');
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
    dispose() {},
    stop() {},
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

function getSystemPowerShellPath(customImpl) {
  if (customImpl && customImpl !== execFile && customImpl !== spawn) {
    return 'powershell.exe';
  }
  if (process.platform !== 'win32') {
    return 'powershell.exe';
  }
  const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return path.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function createWindowsActiveWindowProvider(options = {}) {
  const isOneShot = Boolean(options.execFile && !options.spawn);
  const execFileImpl = options.execFile || execFile;
  const spawnImpl = options.spawn || spawn;
  const powershellPath = options.powershellPath || getSystemPowerShellPath(options.execFile || options.spawn);
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 5000;
  const currentPid = Number.isFinite(options.currentPid) ? options.currentPid : process.pid;

  const baseScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class NativeWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", SetLastError=true)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", SetLastError=true)] public static extern int GetClassName(IntPtr hWnd, StringBuilder className, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
  [DllImport("user32.dll", SetLastError=true)] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint dwFlags);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO info);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, uint dwAttribute, out int pvAttribute, uint cbAttribute);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool QueryFullProcessImageName(IntPtr hProcess, uint dwFlags, StringBuilder lpExeName, ref uint lpdwSize);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr hObject);
}
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
[StructLayout(LayoutKind.Sequential)]
public struct MONITORINFO { public uint cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
"@
# Normalize thread awareness to PER_MONITOR_AWARE_V2 (-4) so GetWindowRect and
# GetMonitorInfo always return physical screen pixels across mixed-DPI displays.
$DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = [IntPtr](-4)
$DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE = [IntPtr](-3)
try {
  $previousDpiContext = [NativeWindow]::SetThreadDpiAwarenessContext($DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)
  if ($previousDpiContext -eq [IntPtr]::Zero) {
    [void][NativeWindow]::SetThreadDpiAwarenessContext($DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE)
  }
} catch {}
$GW_HWNDNEXT = 2
$GA_ROOTOWNER = 3
$GWL_STYLE = -16
$GWL_EXSTYLE = -20
$WS_CAPTION = 0x00C00000
$WS_EX_TOOLWINDOW = 0x00000080
$WS_EX_NOACTIVATE = 0x08000000
$DWMWA_CLOAKED = [uint32]14
$PROCESS_QUERY_LIMITED_INFORMATION = [uint32]0x1000
$MONITOR_DEFAULTTONEAREST = 2
$MAX_WINDOW_WALK = 512
$ignoredClasses = @("Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "tooltips_class32", "MSCTFIME UI", "IME", "CiceroUIWndFrame")

function Test-IsWindowCloaked([IntPtr]$hWnd) {
  if ($hWnd -eq [IntPtr]::Zero) { return $false }
  $cloaked = 0
  try {
    $hr = [NativeWindow]::DwmGetWindowAttribute($hWnd, $DWMWA_CLOAKED, [ref]$cloaked, [uint32]4)
    return ($hr -eq 0) -and ($cloaked -ne 0)
  } catch {
    return $false
  }
}

function Get-WindowClassName([IntPtr]$hWnd) {
  if ($hWnd -eq [IntPtr]::Zero) { return "" }
  $classBuilder = New-Object System.Text.StringBuilder 256
  [void][NativeWindow]::GetClassName($hWnd, $classBuilder, $classBuilder.Capacity)
  return $classBuilder.ToString()
}

function Get-ProcessNameSafe([uint32]$pidValue) {
  if ($pidValue -eq 0) { return "" }
  $procHandle = [NativeWindow]::OpenProcess($PROCESS_QUERY_LIMITED_INFORMATION, $false, $pidValue)
  if ($procHandle -ne [IntPtr]::Zero) {
    try {
      $pathBuilder = New-Object System.Text.StringBuilder 1024
      $size = [uint32]$pathBuilder.Capacity
      if ([NativeWindow]::QueryFullProcessImageName($procHandle, [uint32]0, $pathBuilder, [ref]$size) -and $size -gt 0) {
        return [System.IO.Path]::GetFileNameWithoutExtension($pathBuilder.ToString())
      }
    } catch {
    } finally {
      [void][NativeWindow]::CloseHandle($procHandle)
    }
  }
  try {
    return (Get-Process -Id $pidValue -ErrorAction Stop).ProcessName
  } catch {
    return ""
  }
}

function Test-IsRdpProcessName([string]$name) {
  if ([string]::IsNullOrWhiteSpace($name)) { return $false }
  return $name -match '^(mstsc|msrdc)(?:\\.exe)?$'
}

function Test-WindowCoversMonitor([IntPtr]$hWnd, $rect) {
  if ($hWnd -eq [IntPtr]::Zero -or $null -eq $rect) { return $false }
  $monitor = [NativeWindow]::MonitorFromWindow($hWnd, $MONITOR_DEFAULTTONEAREST)
  if ($monitor -eq [IntPtr]::Zero) { return $false }
  $mi = New-Object MONITORINFO
  $mi.cbSize = [uint32][System.Runtime.InteropServices.Marshal]::SizeOf($mi)
  if (-not [NativeWindow]::GetMonitorInfo($monitor, [ref]$mi)) { return $false }
  $mLeft = $mi.rcMonitor.Left
  $mTop = $mi.rcMonitor.Top
  $mRight = $mi.rcMonitor.Right
  $mBottom = $mi.rcMonitor.Bottom
  $tolerance = 8
  return ($rect.Left -le $mLeft + $tolerance) -and ($rect.Top -le $mTop + $tolerance) -and ($rect.Right -ge $mRight - $tolerance) -and ($rect.Bottom -ge $mBottom - $tolerance)
}

function Test-IsFullscreenRdpWindow([IntPtr]$hWnd, [string]$processName) {
  if ($hWnd -eq [IntPtr]::Zero) { return $false }
  if (-not (Test-IsRdpProcessName $processName)) { return $false }
  if (-not [NativeWindow]::IsWindowVisible($hWnd)) { return $false }
  if ([NativeWindow]::IsIconic($hWnd)) { return $false }
  if (Test-IsWindowCloaked $hWnd) { return $false }
  $rect = New-Object RECT
  if (-not [NativeWindow]::GetWindowRect($hWnd, [ref]$rect)) { return $false }
  if (($rect.Right - $rect.Left) -le 0 -or ($rect.Bottom - $rect.Top) -le 0) { return $false }
  if (-not (Test-WindowCoversMonitor $hWnd $rect)) { return $false }
  $isMaximized = [NativeWindow]::IsZoomed($hWnd)
  $style = [NativeWindow]::GetWindowLong($hWnd, $GWL_STYLE)
  $hasCaption = (($style -band $WS_CAPTION) -eq $WS_CAPTION)
  return (-not $isMaximized) -or (-not $hasCaption)
}

function Find-FullscreenRdpWindowForPid([uint32]$targetPid, [IntPtr]$excludeHandle, [string]$processName) {
  if ($targetPid -eq 0 -or (-not (Test-IsRdpProcessName $processName))) { return [IntPtr]::Zero }
  $walk = [NativeWindow]::GetTopWindow([IntPtr]::Zero)
  $steps = 0
  while ($walk -ne [IntPtr]::Zero -and $steps -lt $MAX_WINDOW_WALK) {
    $steps++
    if ($walk -ne $excludeHandle) {
      $walkPid = [uint32]0
      [void][NativeWindow]::GetWindowThreadProcessId($walk, [ref]$walkPid)
      if ($walkPid -eq $targetPid -and (Test-IsFullscreenRdpWindow $walk $processName)) {
        return $walk
      }
    }
    $walk = [NativeWindow]::GetWindow($walk, $GW_HWNDNEXT)
  }
  return [IntPtr]::Zero
}

function Format-ActiveWindowJson([IntPtr]$hWnd, [string]$processName, [bool]$forceFullScreen) {
  $rect = New-Object RECT
  if (-not [NativeWindow]::GetWindowRect($hWnd, [ref]$rect)) {
    return (@{ active = $false; reason = "missing-bounds" } | ConvertTo-Json -Compress)
  }
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) {
    return (@{ active = $false; reason = "missing-bounds" } | ConvertTo-Json -Compress)
  }
  $titleBuilder = New-Object System.Text.StringBuilder 512
  [void][NativeWindow]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity)
  $coversMonitor = Test-WindowCoversMonitor $hWnd $rect
  $isMaximized = [NativeWindow]::IsZoomed($hWnd)
  $isFullScreen = (-not $isMaximized) -and $coversMonitor
  if ($forceFullScreen) { $isFullScreen = $true }
  return (@{
    active = $true
    source = "active-window"
    id = $hWnd.ToInt64().ToString()
    title = $titleBuilder.ToString()
    ownerName = $processName
    bounds = @{ x = $rect.Left; y = $rect.Top; width = $width; height = $height }
    isMinimized = [NativeWindow]::IsIconic($hWnd)
    isMaximized = $isMaximized
    isFullScreen = $isFullScreen
  } | ConvertTo-Json -Compress)
}

function Sample-DesktopPetActiveWindow {
  $shellWindow = [NativeWindow]::GetShellWindow()
  $sawIgnoredWindow = $false
  $fgHandle = [NativeWindow]::GetForegroundWindow()
  if ($fgHandle -eq [IntPtr]::Zero) {
    $topHandle = [NativeWindow]::GetTopWindow([IntPtr]::Zero)
    $topSteps = 0
    while ($topHandle -ne [IntPtr]::Zero -and $topSteps -lt $MAX_WINDOW_WALK) {
      $topSteps++
      $topClass = Get-WindowClassName $topHandle
      $topRect = New-Object RECT
      $topHasBounds = [NativeWindow]::GetWindowRect($topHandle, [ref]$topRect)
      $topPid = [uint32]0
      [void][NativeWindow]::GetWindowThreadProcessId($topHandle, [ref]$topPid)
      $topWidth = $topRect.Right - $topRect.Left
      $topHeight = $topRect.Bottom - $topRect.Top
      $topExStyle = [NativeWindow]::GetWindowLong($topHandle, $GWL_EXSTYLE)
      $topSkip = $false

      if ($topHandle -eq $shellWindow) { $topSkip = $true }
      if (-not [NativeWindow]::IsWindowVisible($topHandle)) { $topSkip = $true }
      if (-not $topHasBounds -or $topWidth -le 0 -or $topHeight -le 0) { $topSkip = $true }
      if ($ignoredClasses -contains $topClass) { $topSkip = $true }
      if ($topClass -eq "BBarWindowClass") { $topSkip = $true }
      if ($topPid -eq ${currentPid}) { $topSkip = $true }
      if (($topExStyle -band $WS_EX_NOACTIVATE) -ne 0 -or ($topExStyle -band $WS_EX_TOOLWINDOW) -ne 0) { $topSkip = $true }
      if (-not $topSkip -and (Test-IsWindowCloaked $topHandle)) { $topSkip = $true }

      if (-not $topSkip) {
        $topProcessName = Get-ProcessNameSafe $topPid
        if (Test-IsFullscreenRdpWindow $topHandle $topProcessName) {
          return (Format-ActiveWindowJson $topHandle $topProcessName $true)
        }
        break
      }
      $topHandle = [NativeWindow]::GetWindow($topHandle, $GW_HWNDNEXT)
    }
    return (@{ active = $false; reason = "no-active-window" } | ConvertTo-Json -Compress)
  }

  $handle = $fgHandle
  $steps = 0
  while ($handle -ne [IntPtr]::Zero -and $steps -lt $MAX_WINDOW_WALK) {
    $steps++
    $className = Get-WindowClassName $handle
    $rect = New-Object RECT
    $hasBounds = [NativeWindow]::GetWindowRect($handle, [ref]$rect)
    $pidValue = [uint32]0
    [void][NativeWindow]::GetWindowThreadProcessId($handle, [ref]$pidValue)
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    $exStyle = [NativeWindow]::GetWindowLong($handle, $GWL_EXSTYLE)
    $shouldSkip = $false

    if ($handle -eq $shellWindow) { $shouldSkip = $true }
    if (-not [NativeWindow]::IsWindowVisible($handle)) { $shouldSkip = $true }
    if (-not $hasBounds -or $width -le 0 -or $height -le 0) { $shouldSkip = $true }
    if ($ignoredClasses -contains $className) { $shouldSkip = $true }
    if ($pidValue -eq ${currentPid}) {
      $shouldSkip = $true
      $sawIgnoredWindow = $true
    }
    if ($handle -ne $fgHandle -and $className -ne "BBarWindowClass") {
      if (($exStyle -band $WS_EX_NOACTIVATE) -ne 0 -or ($exStyle -band $WS_EX_TOOLWINDOW) -ne 0) {
        $shouldSkip = $true
      }
    }
    if (-not $shouldSkip -and (Test-IsWindowCloaked $handle)) { $shouldSkip = $true }

    if (-not $shouldSkip) {
      $processName = Get-ProcessNameSafe $pidValue
      if ((Test-IsRdpProcessName $processName) -and (Test-IsFullscreenRdpWindow $handle $processName)) {
        return (Format-ActiveWindowJson $handle $processName $true)
      }

      $rootOwner = [NativeWindow]::GetAncestor($handle, $GA_ROOTOWNER)
      if ($rootOwner -ne [IntPtr]::Zero -and $rootOwner -ne $handle) {
        $ownerPid = [uint32]0
        [void][NativeWindow]::GetWindowThreadProcessId($rootOwner, [ref]$ownerPid)
        $ownerProcessName = Get-ProcessNameSafe $ownerPid
        if (Test-IsFullscreenRdpWindow $rootOwner $ownerProcessName) {
          return (Format-ActiveWindowJson $rootOwner $ownerProcessName $true)
        }
      }

      if (Test-IsRdpProcessName $processName) {
        $style = [NativeWindow]::GetWindowLong($handle, $GWL_STYLE)
        $hasCaption = (($style -band $WS_CAPTION) -eq $WS_CAPTION)
        if (($className -eq "BBarWindowClass") -or (-not $hasCaption) -or ($className -ne "TscShellContainerClass")) {
          $rdpHandle = Find-FullscreenRdpWindowForPid $pidValue $handle $processName
          if ($rdpHandle -ne [IntPtr]::Zero) {
            return (Format-ActiveWindowJson $rdpHandle $processName $true)
          }
        }
      }

      return (Format-ActiveWindowJson $handle $processName $false)
    }

    $handle = [NativeWindow]::GetWindow($handle, $GW_HWNDNEXT)
  }

  $reason = "no-active-window"
  if ($sawIgnoredWindow) { $reason = "ignored-window" }
  return (@{ active = $false; reason = $reason } | ConvertTo-Json -Compress)
}
`;

  const oneShotScript = `${baseScript}\nSample-DesktopPetActiveWindow\n`;
  const persistentScript = `${baseScript}
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line -or $line -eq "exit") { break }
  try {
    $res = Sample-DesktopPetActiveWindow
    [Console]::Out.WriteLine($res)
  } catch {
    [Console]::Out.WriteLine('{"active":false,"reason":"provider-failed"}')
  }
}
`;

  let child = null;
  let rl = null;
  let pendingQueue = [];
  let stderrBuffer = '';

  function cleanupChild(reason = 'cleanup') {
    if (child) {
      const proc = child;
      child = null;
      try { proc.stdin.end(); } catch {}
      try { proc.kill(); } catch {}
    }
    if (rl) {
      try { rl.close(); } catch {}
      rl = null;
    }
    const errorDetails = stderrBuffer ? { stderr: stderrBuffer } : null;
    stderrBuffer = '';
    const items = pendingQueue;
    pendingQueue = [];
    for (const item of items) {
      if (item.timer) clearTimeout(item.timer);
      item.resolve(unavailableActiveWindowInfo(reason, item.sampledAt, errorDetails));
    }
  }

  function ensureChild() {
    if (child && !child.killed && child.exitCode === null && (child.signalCode === null || child.signalCode === undefined)) {
      return child;
    }
    stderrBuffer = '';
    child = spawnImpl(
      powershellPath,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', persistentScript],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: getSafeChildProcessEnv(),
      }
    );

    const proc = child;
    rl = readline.createInterface({ input: proc.stdout, terminal: false });

    rl.on('line', (line) => {
      if (child !== proc) return;
      const text = line.trim();
      if (!text) return;
      const item = pendingQueue.shift();
      if (item) {
        if (item.timer) clearTimeout(item.timer);
        const parsed = parseWindowsProviderOutput(text, item.sampledAt);
        if (parsed.reason === 'parse-failed') {
          cleanupChild('parse-failed');
        }
        item.resolve(parsed);
      }
    });

    if (proc.stderr) {
      proc.stderr.on('data', (chunk) => {
        if (child !== proc) return;
        stderrBuffer = (stderrBuffer + chunk.toString()).slice(-4096);
      });
    }

    const handleProcessError = (err) => {
      if (child !== proc) return;
      if (err && !stderrBuffer) {
        stderrBuffer = err.message || String(err);
      }
      cleanupChild('provider-failed');
    };
    proc.on('error', handleProcessError);
    proc.stdin.on('error', handleProcessError);

    proc.on('exit', () => {
      if (child === proc) cleanupChild('provider-failed');
    });

    return proc;
  }

  async function samplePersistent() {
    const sampledAt = Date.now();
    return new Promise((resolve) => {
      let proc;
      try {
        proc = ensureChild();
      } catch (err) {
        resolve(unavailableActiveWindowInfo('provider-failed', sampledAt, { message: err?.message || String(err) }));
        return;
      }

      const item = {
        resolve,
        sampledAt,
        timer: null,
      };

      if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
        item.timer = setTimeout(() => {
          const idx = pendingQueue.indexOf(item);
          if (idx !== -1) {
            pendingQueue.splice(idx, 1);
            cleanupChild('timeout');
            resolve(unavailableActiveWindowInfo('timeout', sampledAt));
          }
        }, timeoutMs);
      }

      pendingQueue.push(item);

      try {
        proc.stdin.write('sample\n');
      } catch (writeErr) {
        const idx = pendingQueue.indexOf(item);
        if (idx !== -1) pendingQueue.splice(idx, 1);
        if (item.timer) clearTimeout(item.timer);
        cleanupChild('provider-failed');
        resolve(unavailableActiveWindowInfo('provider-failed', sampledAt, { message: writeErr?.message || String(writeErr) }));
      }
    });
  }

  function sampleOneShot() {
    const sampledAt = Date.now();
    return new Promise((resolve) => {
      execFileImpl(
        powershellPath,
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', oneShotScript],
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
  }

  function dispose() {
    if (child) {
      try { child.stdin.write('exit\n'); } catch {}
    }
    cleanupChild('disposed');
  }

  return {
    getActiveWindowInfo: isOneShot ? sampleOneShot : samplePersistent,
    dispose,
    stop: dispose,
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
    dispose() {},
    stop() {},
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
