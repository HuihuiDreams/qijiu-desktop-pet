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

function Sample-DesktopPetActiveWindow {
  $shellWindow = [NativeWindow]::GetShellWindow()
  $sawIgnoredWindow = $false
  $handle = [NativeWindow]::GetForegroundWindow()
  if ($handle -eq [IntPtr]::Zero) {
    return (@{ active = $false; reason = "no-active-window" } | ConvertTo-Json -Compress)
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

      return (@{
        active = $true
        source = "active-window"
        id = $handle.ToInt64().ToString()
        title = $titleBuilder.ToString()
        ownerName = $processName
        bounds = @{ x = $rect.Left; y = $rect.Top; width = $width; height = $height }
        isMinimized = [NativeWindow]::IsIconic($handle)
        isMaximized = [NativeWindow]::IsZoomed($handle)
        isFullScreen = $isFullScreen
      } | ConvertTo-Json -Compress)
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

    rl = readline.createInterface({ input: child.stdout, terminal: false });

    rl.on('line', (line) => {
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

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderrBuffer = (stderrBuffer + chunk.toString()).slice(-4096);
      });
    }

    child.on('error', (err) => {
      if (err && !stderrBuffer) {
        stderrBuffer = err.message || String(err);
      }
      cleanupChild('provider-failed');
    });

    child.on('exit', () => {
      cleanupChild('provider-failed');
    });

    return child;
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
