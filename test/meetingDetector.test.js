const assert = require('node:assert/strict');
const test = require('node:test');

const {
  collectMeetingUdpSnapshot,
  createMeetingDetector,
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
