const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════
//  Phase 3 单元测试：久坐提醒 IPC 与集成验证
// ═══════════════════════════════════════════════════════════════════

const ROOT = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf-8');
const preloadSource = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf-8');
const appSource = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf-8');
const debugSource = fs.readFileSync(path.join(ROOT, 'src', 'debug.js'), 'utf-8');

// --- main.js 集成 ---

test('main.js imports breakReminderService', () => {
  assert.ok(mainSource.includes("require('./breakReminderService')"), 'should import breakReminderService');
});

test('main.js imports presentationGuard', () => {
  assert.ok(mainSource.includes("require('./presentationGuard')"), 'should import presentationGuard');
});

test('main.js registers break-reminder-dismissed IPC listener', () => {
  assert.ok(mainSource.includes("ipcMain.on('break-reminder-dismissed'"), 'should handle dismiss IPC');
});

test('main.js sends break-reminder-triggered to renderer', () => {
  assert.ok(mainSource.includes("send('break-reminder-triggered'"), 'should send trigger event');
});

test('main.js adds breakReminderSettings to store whitelist', () => {
  assert.ok(mainSource.includes('BREAK_REMINDER_STORE_KEY'), 'should define BREAK_REMINDER_STORE_KEY');
  assert.ok(mainSource.includes("breakReminderSettings"), 'should include store key value');
});

test('main.js listens to powerMonitor lock/suspend/unlock/resume', () => {
  assert.ok(mainSource.includes("powerMonitor.on('lock-screen'"), 'should listen to lock-screen');
  assert.ok(mainSource.includes("powerMonitor.on('suspend'"), 'should listen to suspend');
  assert.ok(mainSource.includes("powerMonitor.on('unlock-screen'"), 'should listen to unlock-screen');
  assert.ok(mainSource.includes("powerMonitor.on('resume'"), 'should listen to resume');
});

test('main.js tray menu includes break reminder toggle', () => {
  assert.ok(mainSource.includes("trayBreakReminderOn"), 'should have trayBreakReminderOn label');
  assert.ok(mainSource.includes("trayBreakReminderOff"), 'should have trayBreakReminderOff label');
});

test('main.js tray menu includes break reminder interval submenu', () => {
  assert.ok(mainSource.includes("trayBreakReminderInterval"), 'should have interval label');
  assert.ok(mainSource.includes("trayMinuteUnit"), 'should have minute unit label');
  assert.ok(mainSource.includes("BREAK_REMINDER_TRAY_INTERVALS"), 'should use intervals array');
});

test('main.js marks the primary display walk area for renderer screen info', () => {
  assert.ok(mainSource.includes('screen.getPrimaryDisplay()'), 'should read the primary display');
  assert.ok(mainSource.includes('primaryDisplayId'), 'should pass primary display id into walk area conversion');
});

// --- preload.js ---

test('preload.js exposes onBreakReminder API', () => {
  assert.ok(preloadSource.includes('onBreakReminder'), 'should expose onBreakReminder');
});

test('preload.js exposes dismissBreakReminder API', () => {
  assert.ok(preloadSource.includes('dismissBreakReminder'), 'should expose dismissBreakReminder');
});

test('preload.js listens to break-reminder-triggered channel', () => {
  assert.ok(preloadSource.includes("'break-reminder-triggered'"), 'should listen to trigger channel');
});

test('preload.js sends break-reminder-dismissed channel', () => {
  assert.ok(preloadSource.includes("'break-reminder-dismissed'"), 'should send dismiss channel');
});

// --- app.js renderer ---

test('app.js handles onBreakReminder event', () => {
  assert.ok(appSource.includes('handleBreakReminderTriggered'), 'should define handler function');
  assert.ok(appSource.includes('onBreakReminder(handleBreakReminderTriggered)'), 'should register handler');
});

test('app.js has break reminder dismiss function', () => {
  assert.ok(appSource.includes('dismissBreakReminder'), 'should define dismiss function');
  assert.ok(appSource.includes('dismissBreakReminder()'), 'should call dismiss');
});

test('app.js pauses game loop during break reminder', () => {
  assert.ok(appSource.includes('breakReminderActive'), 'should track breakReminderActive');
  assert.ok(appSource.includes('!breakReminderActive'), 'should check breakReminderActive in game loop');
});

test('app.js shows dialogues from breakReminder pool', () => {
  assert.ok(appSource.includes('DIALOGUES.breakReminder'), 'should read from breakReminder dialogue pool');
});

test('app.js auto-dismisses after 20 seconds', () => {
  assert.ok(appSource.includes('setTimeout(dismissBreakReminder, 20000)'), 'should auto-dismiss after 20s');
});

test('app.js chooses the primary walk area for break reminder placement', () => {
  assert.ok(appSource.includes('wa.isPrimary'), 'should prefer the primary display walk area');
  assert.ok(!appSource.includes('wa.width * wa.height > area.width * area.height'), 'should not choose the largest area');
});

test('app.js click-to-dismiss during break reminder', () => {
  assert.ok(appSource.includes("if (breakReminderActive)"), 'click handler should check breakReminderActive');
});

// --- debug.js ---

test('debug.js includes testBreakReminder function', () => {
  assert.ok(debugSource.includes('testBreakReminder'), 'should define testBreakReminder');
  assert.ok(debugSource.includes('__DEBUG_BREAK_REMINDER'), 'should reference debug trigger');
});

test('app.js exposes __DEBUG_BREAK_REMINDER', () => {
  assert.ok(appSource.includes('__DEBUG_BREAK_REMINDER'), 'should expose debug trigger');
  assert.ok(appSource.includes('handleBreakReminderTriggered({'), 'trigger should call handler directly');
});

// --- i18n 文案池验证 ---

test('breakReminder dialogues exist in all three languages', () => {
  const i18nSource = fs.readFileSync(path.join(ROOT, 'src', 'data', 'i18n.js'), 'utf-8');
  const breakReminderCount = (i18nSource.match(/breakReminder:/g) || []).length;
  assert.ok(breakReminderCount >= 3, `should have breakReminder in zh, en, ja (found ${breakReminderCount})`);
});

test('breakReminder fallback dialogues exist in dialogues.js', () => {
  const dialoguesSource = fs.readFileSync(path.join(ROOT, 'src', 'data', 'dialogues.js'), 'utf-8');
  assert.ok(dialoguesSource.includes('breakReminder'), 'fallback should include breakReminder');
});

// --- normalizeSettings 功能测试 ---

test('normalizeSettings rejects values below MIN_INTERVAL_MINUTES', () => {
  const { normalizeSettings, MIN_INTERVAL_MINUTES, DEFAULT_SETTINGS } = require('../breakReminderService');
  const result = normalizeSettings({ intervalMinutes: MIN_INTERVAL_MINUTES - 1 });
  assert.equal(result.intervalMinutes, DEFAULT_SETTINGS.intervalMinutes);
});

test('breakReminderService module exports expected functions', () => {
  const mod = require('../breakReminderService');
  assert.equal(typeof mod.createBreakReminderService, 'function');
  assert.equal(typeof mod.normalizeSettings, 'function');
  assert.ok(mod.DEFAULT_SETTINGS);
});

test('presentationGuard module exports expected functions', () => {
  const mod = require('../presentationGuard');
  assert.equal(typeof mod.createPresentationGuard, 'function');
  assert.equal(typeof mod.coversWorkArea, 'function');
});
