const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_COMMAND_TIMEOUT_MS = 3000;
const DEFAULT_UDP_THRESHOLD = 5;
const DEFAULT_START_CONFIRMATIONS = 2;
const DEFAULT_END_GRACE_MS = 15000;

const MEETING_APPS = [
  {
    name: 'Teams',
    win32: ['ms-teams.exe', 'Teams.exe'],
    darwin: ['Teams'],
  },
  {
    name: 'Zoom',
    win32: ['Zoom.exe'],
    darwin: ['zoom.us'],
  },
  {
    name: 'Webex',
    win32: ['CiscoCollabHost.exe'],
    darwin: ['Cisco Webex Meetings'],
  },
  {
    name: 'Slack',
    win32: ['slack.exe'],
    darwin: ['Slack'],
  },
  {
    name: 'Discord',
    win32: ['Discord.exe'],
    darwin: ['Discord'],
  },
];

function getSystemBinaryPath(command) {
  if (process.platform === 'win32') {
    const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    const system32 = path.join(sysRoot, 'System32');
    const lower = command.toLowerCase();
    if (lower === 'powershell.exe' || lower === 'powershell') {
      return path.join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    }
    const nameWithExe = command.endsWith('.exe') ? command : `${command}.exe`;
    return path.join(system32, nameWithExe);
  }

  if (process.platform === 'darwin') {
    if (command === 'pgrep') {
      return fs.existsSync('/usr/bin/pgrep') ? '/usr/bin/pgrep' : '/bin/pgrep';
    }
    if (command === 'lsof') {
      return fs.existsSync('/usr/sbin/lsof') ? '/usr/sbin/lsof' : '/usr/bin/lsof';
    }
  }

  return command;
}

function resolveSystemCommand(command, execFileImpl) {
  if (execFileImpl && execFileImpl !== execFile) {
    return command;
  }
  return getSystemBinaryPath(command);
}

function getSafeChildProcessEnv() {
  const baseEnv = { ...process.env };
  if (process.platform === 'win32') {
    const sysRoot = baseEnv.SystemRoot || baseEnv.windir || 'C:\\Windows';
    const system32 = path.join(sysRoot, 'System32');
    const safePath = [
      system32,
      sysRoot,
      path.join(system32, 'Wbem'),
      path.join(system32, 'WindowsPowerShell', 'v1.0'),
    ].join(';');
    baseEnv.PATH = safePath;
    baseEnv.Path = safePath;
  } else {
    baseEnv.PATH = '/usr/bin:/bin:/usr/sbin';
  }
  return baseEnv;
}

function runExecFile(execFileImpl, command, args, timeoutMs) {
  const actualCommand = resolveSystemCommand(command, execFileImpl);
  return new Promise((resolve, reject) => {
    execFileImpl(actualCommand, args, { timeout: timeoutMs, env: getSafeChildProcessEnv() }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseTasklistCsv(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvLine)
    .map((row) => ({
      processName: row[0],
      pid: row[1],
    }))
    .filter((processInfo) => processInfo.processName && /^\d+$/.test(processInfo.pid));
}

function parsePowerShellProcessCsv(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvLine)
    .filter((row) => row[0] !== 'ImageName' || row[1] !== 'PID')
    .map((row) => ({
      processName: row[0],
      pid: row[1],
    }))
    .filter((processInfo) => processInfo.processName && /^\d+$/.test(processInfo.pid));
}

function parseWindowsUdpEndpoints(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^UDP\s+/i.test(line))
    .map((line) => {
      const parts = line.split(/\s+/);
      return {
        protocol: parts[0],
        localAddress: parts[1] || '',
        remoteAddress: parts[2] || '',
        pid: parts[parts.length - 1] || '',
        raw: line,
      };
    })
    .filter((endpoint) => /^\d+$/.test(endpoint.pid));
}

function getProcessNamesForPlatform(appInfo, platform) {
  return Array.isArray(appInfo[platform]) ? appInfo[platform] : [];
}

function quotePowerShellString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function collectWindowsProcesses(options) {
  const {
    execFile: execFileImpl = execFile,
    commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
    meetingApps = MEETING_APPS,
  } = options;

  try {
    const { stdout } = await runExecFile(
      execFileImpl,
      'tasklist',
      ['/fo', 'csv', '/nh'],
      commandTimeoutMs,
    );
    return parseTasklistCsv(stdout);
  } catch (tasklistError) {
    const processNames = [...new Set(meetingApps
      .flatMap((appInfo) => getProcessNamesForPlatform(appInfo, 'win32'))
      .map((name) => name.replace(/\.exe$/i, ''))
      .filter(Boolean))];

    if (processNames.length === 0) throw tasklistError;

    const script = [
      "$ErrorActionPreference = 'SilentlyContinue'",
      `$names = @(${processNames.map(quotePowerShellString).join(',')})`,
      'Get-Process -Name $names -ErrorAction SilentlyContinue | Select-Object @{Name=\'ImageName\';Expression={$_.ProcessName + \'.exe\'}},@{Name=\'PID\';Expression={[string]$_.Id}} | ConvertTo-Csv -NoTypeInformation',
      'exit 0',
    ].join('; ');

    try {
      const { stdout } = await runExecFile(
        execFileImpl,
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        commandTimeoutMs,
      );
      return parsePowerShellProcessCsv(stdout);
    } catch {
      return [];
    }
  }
}

async function collectWindowsSnapshot(options) {
  const {
    commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
    meetingApps = MEETING_APPS,
    udpThreshold = DEFAULT_UDP_THRESHOLD,
  } = options;
  const execFileImpl = options.execFile || execFile;
  const processes = await collectWindowsProcesses(options);

  const appsWithProcesses = meetingApps.map((appInfo) => {
    const processNames = getProcessNamesForPlatform(appInfo, 'win32');
    const matchedProcesses = processes
      .filter((processInfo) => processNames.some(
        (name) => name.toLowerCase() === processInfo.processName.toLowerCase(),
      ));
    return {
      name: appInfo.name,
      processNames,
      processes: matchedProcesses,
    };
  }).filter((appInfo) => appInfo.processes.length > 0);

  if (appsWithProcesses.length === 0) {
    return {
      platform: 'win32',
      isActive: false,
      detectedApps: [],
      apps: [],
    };
  }

  let netstatOutput = '';
  let udpStateUnknown = false;
  try {
    const result = await runExecFile(
      execFileImpl,
      'netstat',
      ['-ano', '-p', 'udp'],
      commandTimeoutMs,
    );
    netstatOutput = result.stdout;
  } catch {
    udpStateUnknown = true;
    netstatOutput = '';
  }
  const endpoints = parseWindowsUdpEndpoints(netstatOutput);
  const apps = appsWithProcesses.map((appInfo) => {
    const appProcesses = appInfo.processes.map((processInfo) => {
      const udpEndpoints = endpoints.filter((endpoint) => endpoint.pid === processInfo.pid);
      return {
        processName: processInfo.processName,
        pid: processInfo.pid,
        udpCount: udpEndpoints.length,
        udpEndpoints,
      };
    });
    return {
      ...appInfo,
      active: appProcesses.some((processInfo) => processInfo.udpCount >= udpThreshold),
      processes: appProcesses,
    };
  });

  return {
    platform: 'win32',
    isActive: apps.some((appInfo) => appInfo.active),
    isUnknown: udpStateUnknown,
    detectedApps: apps.filter((appInfo) => appInfo.active).map((appInfo) => appInfo.name),
    apps,
  };
}

async function collectMacProcessInfo(execFileImpl, processName, commandTimeoutMs) {
  const { stdout } = await runExecFile(execFileImpl, 'pgrep', ['-x', processName], commandTimeoutMs);
  const pids = stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^\d+$/.test(line));

  const processes = [];
  for (const pid of pids) {
    try {
      const { stdout: lsofOutput } = await runExecFile(
        execFileImpl,
        'lsof',
        ['-nP', '-i', 'UDP', '-p', pid, '-Fn'],
        commandTimeoutMs,
      );
      const udpEndpoints = lsofOutput
        .split(/\r?\n/)
        .filter((line) => line.startsWith('n'))
        .map((line) => ({ raw: line.slice(1) }));
      processes.push({
        processName,
        pid,
        udpCount: udpEndpoints.length,
        udpEndpoints,
      });
    } catch {
      processes.push({
        processName,
        pid,
        udpCount: 0,
        udpEndpoints: [],
      });
    }
  }

  return processes;
}

async function collectMacSnapshot(options) {
  const {
    execFile: execFileImpl = execFile,
    commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
    meetingApps = MEETING_APPS,
    udpThreshold = DEFAULT_UDP_THRESHOLD,
  } = options;

  const apps = [];
  for (const appInfo of meetingApps) {
    const processNames = getProcessNamesForPlatform(appInfo, 'darwin');
    const processes = [];
    for (const processName of processNames) {
      try {
        processes.push(...await collectMacProcessInfo(execFileImpl, processName, commandTimeoutMs));
      } catch {
        // pgrep returns a non-zero exit code when the process is absent.
      }
    }
    if (processes.length > 0) {
      apps.push({
        name: appInfo.name,
        processNames,
        active: processes.some((processInfo) => processInfo.udpCount >= udpThreshold),
        processes,
      });
    }
  }

  return {
    platform: 'darwin',
    isActive: apps.some((appInfo) => appInfo.active),
    detectedApps: apps.filter((appInfo) => appInfo.active).map((appInfo) => appInfo.name),
    apps,
  };
}

async function collectMeetingUdpSnapshot(options = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'win32') return collectWindowsSnapshot(options);
  if (platform === 'darwin') return collectMacSnapshot(options);
  return {
    platform,
    isActive: false,
    detectedApps: [],
    apps: [],
  };
}

function createMeetingDetector(options = {}) {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const endGraceMs = options.endGraceMs ?? DEFAULT_END_GRACE_MS;
  const startConfirmations = options.startConfirmations ?? DEFAULT_START_CONFIRMATIONS;
  const setIntervalImpl = options.setIntervalImpl || setInterval;
  const clearIntervalImpl = options.clearIntervalImpl || clearInterval;
  const now = options.now || Date.now;
  const getSnapshot = options.getSnapshot || (() => collectMeetingUdpSnapshot(options));
  let timer = null;
  let sampling = false;
  let consecutiveActiveSamples = 0;
  let lastMeetingDetectedAt = 0;
  let state = {
    isInMeeting: false,
    lastMeetingDetectedAt: 0,
    detectedApps: [],
  };

  function getState() {
    return { ...state, detectedApps: [...state.detectedApps] };
  }

  async function sampleOnce() {
    if (sampling) return getState();
    sampling = true;
    try {
      const snapshot = await getSnapshot();
      const currentTime = now();
      if (snapshot?.isUnknown) {
        return getState();
      }
      if (snapshot?.isActive) {
        const wasInMeeting = state.isInMeeting;
        consecutiveActiveSamples += 1;
        lastMeetingDetectedAt = currentTime;
        state = {
          isInMeeting: consecutiveActiveSamples >= startConfirmations || state.isInMeeting,
          lastMeetingDetectedAt,
          detectedApps: snapshot.detectedApps || [],
        };
        if (!wasInMeeting && state.isInMeeting) {
          options.onMeetingStart?.({ ...snapshot, detectedAt: currentTime });
        }
      } else {
        consecutiveActiveSamples = 0;
        if (state.isInMeeting && currentTime - lastMeetingDetectedAt >= endGraceMs) {
          state = {
            isInMeeting: false,
            lastMeetingDetectedAt,
            detectedApps: [],
          };
          options.onMeetingEnd?.({ ...(snapshot || {}), detectedAt: currentTime });
        } else if (!state.isInMeeting) {
          state = {
            isInMeeting: false,
            lastMeetingDetectedAt,
            detectedApps: [],
          };
        }
      }
      return getState();
    } catch (error) {
      options.onError?.(error);
      return getState();
    } finally {
      sampling = false;
    }
  }

  function start() {
    if (timer) return;
    void sampleOnce();
    timer = setIntervalImpl(() => {
      void sampleOnce();
    }, intervalMs);
  }

  function stop() {
    if (!timer) return;
    clearIntervalImpl(timer);
    timer = null;
  }

  return {
    getState,
    sampleOnce,
    start,
    stop,
  };
}

module.exports = {
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_END_GRACE_MS,
  DEFAULT_INTERVAL_MS,
  DEFAULT_START_CONFIRMATIONS,
  DEFAULT_UDP_THRESHOLD,
  MEETING_APPS,
  collectMeetingUdpSnapshot,
  createMeetingDetector,
  getSafeChildProcessEnv,
  getSystemBinaryPath,
  parseTasklistCsv,
  parseWindowsUdpEndpoints,
};
