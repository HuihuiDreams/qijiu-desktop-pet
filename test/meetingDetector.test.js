const assert = require('node:assert/strict');
const test = require('node:test');

const {
  collectMeetingUdpSnapshot,
  createMeetingDetector,
  getSafeChildProcessEnv,
  getSystemBinaryPath,
} = require('../meetingDetector');

function createExecFileStub(outputsByCommand) {
  return (command, args, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const key = [command, ...(args || [])].join(' ');
    const outputs = outputsByCommand[key];
    if (!outputs || outputs.length === 0) {
      cb(new Error(`unexpected command: ${key}`));
      return;
    }
    const next = outputs.shift();
    if (next instanceof Error) {
      cb(next);
      return;
    }
    cb(null, next, '');
  };
}

test('Windows snapshot counts UDP endpoints for current Teams PIDs only', async () => {
  const execFile = createExecFileStub({
    'tasklist /fo csv /nh': [
      [
        '"ms-teams.exe","8604","Console","1","10,000 K"',
        '"ms-teams.exe","27000","Console","1","20,000 K"',
        '"notepad.exe","1234","Console","1","5,000 K"',
      ].join('\r\n'),
    ],
    'netstat -ano -p udp': [
      [
        '  UDP    0.0.0.0:50000          *:*                                    27000',
        '  UDP    0.0.0.0:50001          *:*                                    27000',
        '  UDP    0.0.0.0:50002          *:*                                    27000',
        '  UDP    0.0.0.0:50003          *:*                                    27000',
        '  UDP    0.0.0.0:50004          *:*                                    27000',
        '  UDP    0.0.0.0:50005          *:*                                    27000',
        '  UDP    0.0.0.0:60000          *:*                                    1234',
      ].join('\r\n'),
    ],
  });

  const snapshot = await collectMeetingUdpSnapshot({
    platform: 'win32',
    execFile,
    udpThreshold: 5,
  });

  assert.equal(snapshot.isActive, true);
  assert.deepEqual(snapshot.detectedApps, ['Teams']);
  assert.deepEqual(
    snapshot.apps.find((app) => app.name === 'Teams').processes.map((processInfo) => processInfo.udpCount),
    [0, 6],
  );
});

test('Windows snapshot skips netstat when no known meeting process is running', async () => {
  const execFile = createExecFileStub({
    'tasklist /fo csv /nh': [
      '"notepad.exe","1234","Console","1","5,000 K"',
    ],
  });

  const snapshot = await collectMeetingUdpSnapshot({
    platform: 'win32',
    execFile,
    udpThreshold: 5,
  });

  assert.equal(snapshot.isActive, false);
  assert.deepEqual(snapshot.detectedApps, []);
  assert.deepEqual(snapshot.apps, []);
});

test('Windows snapshot treats known processes without enough UDP endpoints as inactive', async () => {
  const execFile = createExecFileStub({
    'tasklist /fo csv /nh': [
      '"Zoom.exe","8800","Console","1","10,000 K"',
    ],
    'netstat -ano -p udp': [
      [
        '  UDP    0.0.0.0:50000          *:*                                    8800',
        '  UDP    0.0.0.0:60000          *:*                                    1234',
      ].join('\r\n'),
    ],
  });

  const snapshot = await collectMeetingUdpSnapshot({
    platform: 'win32',
    execFile,
    udpThreshold: 5,
  });

  assert.equal(snapshot.isActive, false);
  assert.deepEqual(snapshot.detectedApps, []);
  assert.deepEqual(
    snapshot.apps.find((app) => app.name === 'Zoom').processes.map((processInfo) => processInfo.udpCount),
    [1],
  );
});

test('Windows snapshot falls back to PowerShell process lookup when tasklist is denied', async () => {
  const execFile = (command, args, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const key = [command, ...(args || [])].join(' ');
    if (key === 'tasklist /fo csv /nh') {
      cb(new Error('Command failed: tasklist /fo csv /nh'));
      return;
    }
    if (command === 'powershell.exe') {
      cb(null, [
        '"ImageName","PID"',
        '"ms-teams.exe","7712"',
      ].join('\r\n'), '');
      return;
    }
    if (key === 'netstat -ano -p udp') {
      cb(null, [
        '  UDP    0.0.0.0:50000          *:*                                    7712',
        '  UDP    0.0.0.0:50001          *:*                                    7712',
        '  UDP    0.0.0.0:50002          *:*                                    7712',
        '  UDP    0.0.0.0:50003          *:*                                    7712',
        '  UDP    0.0.0.0:50004          *:*                                    7712',
      ].join('\r\n'), '');
      return;
    }
    cb(new Error(`unexpected command: ${key}`));
  };

  const snapshot = await collectMeetingUdpSnapshot({
    platform: 'win32',
    execFile,
    udpThreshold: 5,
  });

  assert.equal(snapshot.isActive, true);
  assert.deepEqual(snapshot.detectedApps, ['Teams']);
  assert.equal(snapshot.apps.find((app) => app.name === 'Teams').processes[0].pid, '7712');
});

test('Windows snapshot returns inactive when process lookup commands are denied', async () => {
  let netstatCalled = false;
  const execFile = (command, args, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const key = [command, ...(args || [])].join(' ');
    if (key === 'tasklist /fo csv /nh') {
      cb(new Error('Command failed: tasklist /fo csv /nh'));
      return;
    }
    if (command === 'powershell.exe') {
      cb(new Error('Command failed: powershell.exe'));
      return;
    }
    if (key === 'netstat -ano -p udp') {
      netstatCalled = true;
    }
    cb(new Error(`unexpected command: ${key}`));
  };

  const snapshot = await collectMeetingUdpSnapshot({
    platform: 'win32',
    execFile,
    udpThreshold: 5,
  });

  assert.equal(netstatCalled, false);
  assert.deepEqual(snapshot, {
    platform: 'win32',
    isActive: false,
    isUnknown: true,
    detectedApps: [],
    apps: [],
  });
});

test('Windows snapshot marks UDP state unknown when netstat is denied', async () => {
  const execFile = createExecFileStub({
    'tasklist /fo csv /nh': [
      '"ms-teams.exe","7712","Console","1","10,000 K"',
    ],
    'netstat -ano -p udp': [
      new Error('Command failed: netstat -ano -p udp'),
    ],
  });

  const snapshot = await collectMeetingUdpSnapshot({
    platform: 'win32',
    execFile,
    udpThreshold: 5,
  });

  assert.deepEqual(snapshot, {
    platform: 'win32',
    isActive: false,
    isUnknown: true,
    detectedApps: [],
    apps: [
      {
        name: 'Teams',
        processNames: ['ms-teams.exe', 'Teams.exe'],
        active: false,
        processes: [
          {
            processName: 'ms-teams.exe',
            pid: '7712',
            udpCount: 0,
            udpEndpoints: [],
          },
        ],
      },
    ],
  });
});

test('meeting detector keeps current state when a snapshot is unknown', async () => {
  let now = 0;
  const starts = [];
  const ends = [];
  const errors = [];
  const samples = [
    { isActive: true, detectedApps: ['Teams'], apps: [] },
    { isActive: true, detectedApps: ['Teams'], apps: [] },
    { isActive: false, isUnknown: true, detectedApps: [], apps: [] },
    { isActive: false, detectedApps: [], apps: [] },
  ];

  const detector = createMeetingDetector({
    getSnapshot: async () => samples.shift(),
    now: () => now,
    startConfirmations: 2,
    endGraceMs: 15000,
    onMeetingStart: (payload) => starts.push(payload),
    onMeetingEnd: (payload) => ends.push(payload),
    onError: (error) => errors.push(error),
  });

  await detector.sampleOnce();
  now = 5000;
  await detector.sampleOnce();
  assert.equal(detector.getState().isInMeeting, true);
  assert.equal(starts.length, 1);

  now = 20000;
  await detector.sampleOnce();
  assert.equal(detector.getState().isInMeeting, true);
  assert.equal(errors.length, 0);
  assert.equal(ends.length, 0);

  await detector.sampleOnce();
  assert.equal(detector.getState().isInMeeting, false);
  assert.equal(ends.length, 1);
});

test('macOS snapshot counts UDP endpoints from pgrep and lsof', async () => {
  const execFile = createExecFileStub({
    'pgrep -x zoom.us': ['4242\n'],
    'lsof -nP -i UDP -p 4242 -Fn': [
      [
        'n*:50000',
        'n*:50001',
        'n*:50002',
        'n*:50003',
        'n*:50004',
      ].join('\n'),
    ],
  });

  const snapshot = await collectMeetingUdpSnapshot({
    platform: 'darwin',
    execFile,
    udpThreshold: 5,
  });

  assert.equal(snapshot.isActive, true);
  assert.deepEqual(snapshot.detectedApps, ['Zoom']);
  assert.deepEqual(
    snapshot.apps.find((app) => app.name === 'Zoom').processes.map((processInfo) => processInfo.udpCount),
    [5],
  );
});

test('unsupported platforms return an inactive snapshot without executing commands', async () => {
  let execCalled = false;
  const snapshot = await collectMeetingUdpSnapshot({
    platform: 'linux',
    execFile: () => {
      execCalled = true;
    },
  });

  assert.equal(execCalled, false);
  assert.deepEqual(snapshot, {
    platform: 'linux',
    isActive: false,
    detectedApps: [],
    apps: [],
  });
});

test('meeting detector starts after two hits and ends after the grace window', async () => {
  let now = 0;
  const starts = [];
  const ends = [];
  const samples = [
    { isActive: true, detectedApps: ['Teams'], apps: [] },
    { isActive: true, detectedApps: ['Teams'], apps: [] },
    { isActive: false, detectedApps: [], apps: [] },
    { isActive: false, detectedApps: [], apps: [] },
  ];

  const detector = createMeetingDetector({
    getSnapshot: async () => samples.shift(),
    now: () => now,
    startConfirmations: 2,
    endGraceMs: 15000,
    onMeetingStart: (payload) => starts.push(payload),
    onMeetingEnd: (payload) => ends.push(payload),
  });

  await detector.sampleOnce();
  assert.equal(detector.getState().isInMeeting, false);
  assert.equal(starts.length, 0);

  now = 5000;
  await detector.sampleOnce();
  assert.equal(detector.getState().isInMeeting, true);
  assert.equal(starts.length, 1);
  assert.deepEqual(starts[0].detectedApps, ['Teams']);

  now = 10000;
  await detector.sampleOnce();
  assert.equal(detector.getState().isInMeeting, true);
  assert.equal(ends.length, 0);

  now = 20000;
  await detector.sampleOnce();
  assert.equal(detector.getState().isInMeeting, false);
  assert.equal(ends.length, 1);
});

test('meeting detector does not emit duplicate starts while still inside the grace window', async () => {
  let now = 0;
  const starts = [];
  const samples = [
    { isActive: true, detectedApps: ['Teams'], apps: [] },
    { isActive: true, detectedApps: ['Teams'], apps: [] },
    { isActive: false, detectedApps: [], apps: [] },
    { isActive: true, detectedApps: ['Teams'], apps: [] },
    { isActive: true, detectedApps: ['Teams'], apps: [] },
  ];

  const detector = createMeetingDetector({
    getSnapshot: async () => samples.shift(),
    now: () => now,
    startConfirmations: 2,
    endGraceMs: 15000,
    onMeetingStart: (payload) => starts.push(payload),
  });

  await detector.sampleOnce();
  now = 5000;
  await detector.sampleOnce();
  now = 10000;
  await detector.sampleOnce();
  now = 12000;
  await detector.sampleOnce();
  now = 17000;
  await detector.sampleOnce();

  assert.equal(detector.getState().isInMeeting, true);
  assert.equal(starts.length, 1);
});

test('meeting detector keeps current state when a scan fails', async () => {
  let now = 0;
  const starts = [];
  const ends = [];
  const errors = [];
  const samples = [
    { isActive: true, detectedApps: ['Teams'], apps: [] },
    { isActive: true, detectedApps: ['Teams'], apps: [] },
    new Error('scan timed out'),
    { isActive: false, detectedApps: [], apps: [] },
  ];

  const detector = createMeetingDetector({
    getSnapshot: async () => {
      const next = samples.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    now: () => now,
    startConfirmations: 2,
    endGraceMs: 15000,
    onMeetingStart: (payload) => starts.push(payload),
    onMeetingEnd: (payload) => ends.push(payload),
    onError: (error) => errors.push(error),
  });

  await detector.sampleOnce();
  now = 5000;
  await detector.sampleOnce();
  assert.equal(detector.getState().isInMeeting, true);
  assert.equal(starts.length, 1);

  now = 20000;
  await detector.sampleOnce();
  assert.equal(detector.getState().isInMeeting, true);
  assert.equal(errors.length, 1);
  assert.equal(ends.length, 0);

  await detector.sampleOnce();
  assert.equal(detector.getState().isInMeeting, false);
  assert.equal(ends.length, 1);
});

test('getSystemBinaryPath resolves absolute paths to protect against PATH hijacking (TH-03)', () => {
  if (process.platform === 'win32') {
    const p1 = getSystemBinaryPath('tasklist');
    assert.match(p1, /System32[/\\]tasklist\.exe$/i);
    const p2 = getSystemBinaryPath('powershell.exe');
    assert.match(p2, /WindowsPowerShell[/\\]v1\.0[/\\]powershell\.exe$/i);
  } else if (process.platform === 'darwin') {
    const p1 = getSystemBinaryPath('pgrep');
    assert.match(p1, /^[/\\](usr[/\\]bin|bin)[/\\]pgrep$/);
  }
});

test('getSafeChildProcessEnv returns restricted PATH whitelist (SBP-003)', () => {
  const env = getSafeChildProcessEnv();
  if (process.platform === 'win32') {
    assert.match(env.PATH, /System32/i);
    assert.match(env.Path, /System32/i);
  } else {
    assert.equal(env.PATH, '/usr/bin:/bin:/usr/sbin');
  }
});

test('macOS snapshot treats process as having 0 UDP endpoints if lsof fails', async () => {
  const execFile = (command, args, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const key = [command, ...(args || [])].join(' ');
    if (key === 'pgrep -x zoom.us') {
      cb(null, '4242\n', '');
      return;
    }
    if (command === 'lsof') {
      cb(new Error('lsof failed'));
      return;
    }
    cb(new Error(`unexpected command: ${key}`));
  };

  const snapshot = await collectMeetingUdpSnapshot({
    platform: 'darwin',
    execFile,
    udpThreshold: 5,
  });

  assert.equal(snapshot.isActive, false);
  assert.deepEqual(
    snapshot.apps.find((app) => app.name === 'Zoom').processes.map((processInfo) => processInfo.udpCount),
    [0],
  );
});

test('meeting detector start and stop control polling interval', async () => {
  let intervalCb = null;
  let cleared = false;
  
  const detector = createMeetingDetector({
    getSnapshot: async () => ({ isActive: false }),
    setIntervalImpl: (cb) => {
      intervalCb = cb;
      return 123;
    },
    clearIntervalImpl: (id) => {
      if (id === 123) cleared = true;
    }
  });

  detector.start();
  detector.start(); // second start does nothing
  assert.ok(intervalCb !== null);
  
  // manually trigger interval
  intervalCb();
  
  detector.stop();
  detector.stop(); // second stop does nothing
  assert.equal(cleared, true);
});
