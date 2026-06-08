#!/usr/bin/env node

const { collectMeetingUdpSnapshot, DEFAULT_UDP_THRESHOLD } = require('../meetingDetector');

const intervalArg = Number(process.argv[2]);
const intervalMs = Number.isFinite(intervalArg) && intervalArg > 0 ? intervalArg : 5000;
const thresholdArg = Number(process.argv[3]);
const udpThreshold = Number.isFinite(thresholdArg) && thresholdArg > 0
  ? thresholdArg
  : DEFAULT_UDP_THRESHOLD;

function formatTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-') + ' ' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join(':');
}

function printSnapshot(snapshot) {
  console.log(`\n[${formatTimestamp()}] threshold=${udpThreshold} active=${snapshot.isActive ? 'yes' : 'no'}`);
  if (!snapshot.apps.length) {
    console.log('no known meeting process');
    return;
  }

  for (const appInfo of snapshot.apps) {
    console.log(`${appInfo.name}: active=${appInfo.active ? 'yes' : 'no'}`);
    for (const processInfo of appInfo.processes) {
      console.log(`  ${processInfo.processName.padEnd(22)} pid=${String(processInfo.pid).padEnd(8)} udp=${processInfo.udpCount}`);
      for (const endpoint of processInfo.udpEndpoints) {
        const detail = endpoint.localAddress
          ? `${endpoint.localAddress} -> ${endpoint.remoteAddress}`
          : endpoint.raw;
        console.log(`    ${detail}`);
      }
    }
  }
}

async function sample() {
  try {
    const snapshot = await collectMeetingUdpSnapshot({ udpThreshold });
    printSnapshot(snapshot);
  } catch (error) {
    console.error(`[${formatTimestamp()}] scan failed: ${error.message}`);
  }
}

console.log(`Measuring meeting UDP endpoints every ${intervalMs}ms. Press Ctrl+C to stop.`);
void sample();
setInterval(() => {
  void sample();
}, intervalMs);

