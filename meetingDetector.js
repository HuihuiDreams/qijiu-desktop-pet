const { execFile } = require('child_process');

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

function runExecFile(execFileImpl, command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFileImpl(command, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
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

async function collectWindowsSnapshot(options) {
  const {
    execFile: execFileImpl = execFile,
    commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
    meetingApps = MEETING_APPS,
    udpThreshold = DEFAULT_UDP_THRESHOLD,
  } = options;
  const { stdout: tasklistOutput } = await runExecFile(
    execFileImpl,
    'tasklist',
    ['/fo', 'csv', '/nh'],
    commandTimeoutMs,
  );
  const processes = parseTasklistCsv(tasklistOutput);

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

  const { stdout: netstatOutput } = await runExecFile(
    execFileImpl,
    'netstat',
    ['-ano', '-p', 'udp'],
    commandTimeoutMs,
  );
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
  parseTasklistCsv,
  parseWindowsUdpEndpoints,
};
