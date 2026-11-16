'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function createFakeElement(id, dataset = {}) {
  const classes = new Set();
  return {
    id,
    dataset: { ...dataset },
    attributes: {},
    listeners: {},
    children: [],
    disabled: false,
    hidden: false,
    focused: false,
    value: '',
    textContent: '',
    className: '',
    classList: {
      add: (...items) => items.forEach((item) => classes.add(item)),
      remove: (...items) => items.forEach((item) => classes.delete(item)),
      contains: (item) => classes.has(item),
      toggle: (item, force) => {
        if (force === undefined) {
          if (classes.has(item)) classes.delete(item);
          else classes.add(item);
        } else if (force) {
          classes.add(item);
        } else {
          classes.delete(item);
        }
      },
    },
    addEventListener(type, fn) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(fn);
    },
    dispatch(type, event = {}) {
      const results = [];
      for (const fn of this.listeners[type] || []) {
        results.push(fn(event));
      }
      return results;
    },
    setAttribute(k, v) {
      this.attributes[k] = String(v);
    },
    getAttribute(k) {
      return this.attributes[k];
    },
    removeAttribute(k) {
      delete this.attributes[k];
    },
    querySelectorAll() {
      return this.children;
    },
    focus() {
      this.focused = true;
    },
  };
}

function makeSnapshot(overrides = {}) {
  return {
    locale: 'zh',
    petScale: {
      currentPercent: 100,
      committedPercent: 100,
      defaultPercent: 100,
      minPercent: 50,
      maxPercent: 150,
      stepPercent: 5,
    },
    skin: { id: 'default', displayName: '默认皮肤·凉拌仓鼠' },
    windowAwareness: { enabled: true, supported: true },
    weather: { enabled: false, city: '' },
    breakReminder: { enabled: true, intervalMinutes: 60, allowedIntervals: [30, 45, 60, 90, 120] },
    screensaver: { enabled: false, idleThresholdMinutes: 3, allowedThresholds: [1, 3, 5, 10, 15, 30] },
    autoLaunch: { enabled: false, preference: false, pendingApproval: false },
    windowAwarenessSupported: true,
    autoLaunchPendingApproval: false,
    ...overrides,
  };
}

function loadSettingsRenderer(options = {}) {
  let snapshot = makeSnapshot(options.snapshot);
  const calls = [];
  const windowListeners = {};
  const callbacks = {};
  const elements = new Map();

  const register = (id, dataset = {}) => {
    const el = createFakeElement(id, dataset);
    elements.set(id, el);
    return el;
  };

  register('settings-close');
  register('settings-tablist');
  register('tab-appearance', { tab: 'appearance' });
  register('tab-companion', { tab: 'companion' });
  register('tab-system', { tab: 'system' });
  register('panel-appearance', { panel: 'appearance' });
  register('panel-companion', { panel: 'companion' });
  register('panel-system', { panel: 'system' });
  register('scale-slider');
  register('scale-current-value');
  register('scale-reset');
  register('settings-current-skin-name');
  register('settings-open-skin-button');
  register('window-awareness-switch');
  register('window-awareness-hint');
  register('weather-sync-switch');
  register('city-current-value');
  register('city-input');
  register('city-confirm');
  register('city-status');
  register('break-reminder-switch');
  register('break-reminder-intervals-group');
  const breakIntervalsEl = register('break-reminder-intervals');
  for (const interval of [30, 45, 60, 90, 120]) {
    breakIntervalsEl.children.push(createFakeElement(`break-${interval}`, { interval: String(interval) }));
  }
  register('screensaver-switch');
  register('screensaver-thresholds-group');
  const screensaverThresholdsEl = register('screensaver-thresholds');
  for (const threshold of [1, 3, 5, 10, 15, 30]) {
    screensaverThresholdsEl.children.push(createFakeElement(`ss-${threshold}`, { threshold: String(threshold) }));
  }
  const localeButtonsEl = register('locale-buttons');
  for (const locale of ['zh', 'en', 'ja']) {
    localeButtonsEl.children.push(createFakeElement(`loc-${locale}`, { locale }));
  }
  register('auto-launch-switch');
  register('auto-launch-status');

  const electronAPI = {
    getSnapshot: async () => {
      calls.push(['getSnapshot']);
      return snapshot;
    },
    previewPetScale: async (percent) => {
      calls.push(['previewPetScale', percent]);
      snapshot = { ...snapshot, petScale: { ...snapshot.petScale, currentPercent: percent } };
      return { success: true, data: { percent } };
    },
    commitPetScale: async (percent) => {
      calls.push(['commitPetScale', percent]);
      snapshot = { ...snapshot, petScale: { ...snapshot.petScale, currentPercent: percent, committedPercent: percent } };
      return { success: true, data: { percent, snapshot } };
    },
    resetPetScale: async () => {
      calls.push(['resetPetScale']);
      snapshot = { ...snapshot, petScale: { ...snapshot.petScale, currentPercent: 100, committedPercent: 100 } };
      return { success: true, data: { percent: 100, snapshot } };
    },
    openSkinSelector: async () => {
      calls.push(['openSkinSelector']);
      return { success: true };
    },
    setWindowAwareness: async (enabled) => {
      calls.push(['setWindowAwareness', enabled]);
      snapshot = { ...snapshot, windowAwareness: { ...snapshot.windowAwareness, enabled } };
      return { success: true, data: { enabled, snapshot } };
    },
    setWeatherEnabled: async (enabled) => {
      calls.push(['setWeatherEnabled', enabled]);
      snapshot = { ...snapshot, weather: { ...snapshot.weather, enabled } };
      const needsCityPrompt = Boolean(enabled && !snapshot.weather.city);
      return { success: true, data: { enabled, needsCityPrompt, snapshot } };
    },
    setCityName: options.setCityName || (async (city) => {
      calls.push(['setCityName', city]);
      snapshot = { ...snapshot, weather: { ...snapshot.weather, city } };
      return { success: true, data: { city, snapshot } };
    }),
    setBreakReminder: async (patch) => {
      calls.push(['setBreakReminder', patch]);
      snapshot = { ...snapshot, breakReminder: { ...snapshot.breakReminder, ...patch } };
      return { success: true, data: { breakReminder: snapshot.breakReminder, snapshot } };
    },
    setScreensaver: async (patch) => {
      calls.push(['setScreensaver', patch]);
      snapshot = { ...snapshot, screensaver: { ...snapshot.screensaver, ...patch } };
      return { success: true, data: { screensaver: snapshot.screensaver, snapshot } };
    },
    changeSettingsLocale: async (lang) => {
      calls.push(['changeSettingsLocale', lang]);
      snapshot = { ...snapshot, locale: lang, skin: { id: snapshot.skin.id, displayName: `Skin(${lang})` } };
      return { success: true, data: { locale: lang, snapshot } };
    },
    changeAutoLaunch: options.changeAutoLaunch || (async (enabled) => {
      calls.push(['changeAutoLaunch', enabled]);
      snapshot = { ...snapshot, autoLaunch: { enabled, preference: enabled, pendingApproval: false } };
      return { success: true, data: { enabled, pendingApproval: false, snapshot } };
    }),
    closeSettingsWindow: () => {
      calls.push(['closeSettingsWindow']);
    },
    onSettingsUpdated: (cb) => { callbacks.onSettingsUpdated = cb; return () => {}; },
    onSwitchTab: (cb) => { callbacks.onSwitchTab = cb; return () => {}; },
    onRestoreSkinFocus: (cb) => { callbacks.onRestoreSkinFocus = cb; return () => {}; },
  };

  let customLocaleCallback = null;
  const sandbox = {
    document: {
      getElementById: (id) => elements.get(id) || null,
    },
    window: {
      electronAPI,
      t: (key) => key,
      addEventListener: (type, fn) => {
        windowListeners[type] = windowListeners[type] || [];
        windowListeners[type].push(fn);
      },
    },
    WindowI18n: {
      init: (cb) => { customLocaleCallback = cb; },
    },
    requestAnimationFrame: (cb) => cb(),
    console,
  };

  vm.runInNewContext(readSource('src/settingsWindow.js'), sandbox);

  return {
    elements,
    calls,
    callbacks,
    triggerLocaleRefresh: () => customLocaleCallback?.(),
    emitWindowKeydown: (event) => {
      for (const fn of windowListeners.keydown || []) fn(event);
    },
    setMockSnapshot: (next) => {
      snapshot = makeSnapshot(next);
    },
  };
}

test('settings.html and settings.css enforce CSP, calligraphy title, scrollable tabpanel, and reduced-motion', () => {
  const html = readSource('src/settings.html');
  const css = readSource('src/settings.css');
  const js = readSource('src/settingsWindow.js');

  assert.match(html, /font-src 'self'/);
  assert.match(html, /settings-calligraphy\.css/);
  assert.match(html, /class="settings-calligraphy-title" data-i18n="settingsTitle"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="switch"/);
  assert.equal(js.includes('innerHTML'), false);

  assert.match(css, /\.settings-tabpanel\s*\{[\s\S]*flex:\s*1;[\s\S]*min-height:\s*0;[\s\S]*overflow-y:\s*auto;[\s\S]*scrollbar-gutter:\s*stable;/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.settings-panel[\s\S]*animation:\s*none;/);
  assert.match(css, /\.settings-segment-button\[aria-pressed="true"\]\s*\{[\s\S]*font-weight:\s*700;/);
});

test('3-tab roving tabindex keyboard navigation and initial/external tab focus', async () => {
  const env = loadSettingsRenderer();
  await new Promise((r) => setImmediate(r));

  const tabApp = env.elements.get('tab-appearance');
  const tabComp = env.elements.get('tab-companion');
  const tabSys = env.elements.get('tab-system');
  const panelApp = env.elements.get('panel-appearance');
  const panelComp = env.elements.get('panel-companion');
  const panelSys = env.elements.get('panel-system');

  assert.equal(tabApp.focused, true, 'initial active tab should receive focus');
  assert.equal(tabApp.getAttribute('tabindex'), '0');
  assert.equal(tabComp.getAttribute('tabindex'), '-1');
  assert.equal(panelApp.hidden, false);
  assert.equal(panelComp.hidden, true);

  tabApp.dispatch('keydown', { key: 'ArrowRight', preventDefault() {} });
  assert.equal(tabComp.getAttribute('aria-selected'), 'true');
  assert.equal(tabComp.getAttribute('tabindex'), '0');
  assert.equal(tabApp.getAttribute('tabindex'), '-1');
  assert.equal(tabComp.focused, true);
  assert.equal(panelComp.hidden, false);
  assert.equal(panelApp.hidden, true);

  tabComp.dispatch('keydown', { key: 'End', preventDefault() {} });
  assert.equal(tabSys.getAttribute('aria-selected'), 'true');
  assert.equal(tabSys.focused, true);
  assert.equal(panelSys.hidden, false);

  tabSys.dispatch('keydown', { key: 'ArrowRight', preventDefault() {} });
  assert.equal(tabApp.getAttribute('aria-selected'), 'true');

  env.callbacks.onSwitchTab('companion');
  assert.equal(tabComp.getAttribute('aria-selected'), 'true');
  assert.equal(tabComp.focused, true);
});

test('Esc closes window with IME composition guard (isComposing / keyCode 229)', async () => {
  const env = loadSettingsRenderer();
  await new Promise((r) => setImmediate(r));

  env.emitWindowKeydown({ key: 'Escape', isComposing: true, preventDefault() {} });
  env.emitWindowKeydown({ key: 'Escape', keyCode: 229, preventDefault() {} });
  assert.equal(env.calls.some(([name]) => name === 'closeSettingsWindow'), false);

  env.emitWindowKeydown({ key: 'Escape', isComposing: false, keyCode: 27, preventDefault() {} });
  assert.equal(env.calls.filter(([name]) => name === 'closeSettingsWindow').length, 1);
});

test('pet scale slider previews on input, commits on change, and resets to 100%', async () => {
  const env = loadSettingsRenderer();
  await new Promise((r) => setImmediate(r));

  const slider = env.elements.get('scale-slider');
  const valueEl = env.elements.get('scale-current-value');
  const resetBtn = env.elements.get('scale-reset');

  slider.dispatch('input', { target: { value: '130' } });
  assert.equal(valueEl.textContent, '130%');
  assert.equal(slider.getAttribute('aria-valuetext'), '130%');
  assert.deepEqual(env.calls.at(-1), ['previewPetScale', 130]);

  await Promise.all(slider.dispatch('change', { target: { value: '130' } }));
  assert.deepEqual(env.calls.at(-1), ['commitPetScale', 130]);

  await Promise.all(resetBtn.dispatch('click'));
  assert.equal(valueEl.textContent, '100%');
  assert.deepEqual(env.calls.at(-1), ['resetPetScale']);
});

test('weather toggle on with empty city keeps switch enabled, focuses city input, and flows through validation', async () => {
  let resolveGeocode;
  const env = loadSettingsRenderer({
    snapshot: { weather: { enabled: false, city: '' } },
    setCityName: () => new Promise((resolve) => { resolveGeocode = resolve; }),
  });
  await new Promise((r) => setImmediate(r));

  const weatherSwitch = env.elements.get('weather-sync-switch');
  const cityInput = env.elements.get('city-input');
  const cityConfirm = env.elements.get('city-confirm');
  const cityStatus = env.elements.get('city-status');
  const cityCurrent = env.elements.get('city-current-value');

  // Enable weather when city is empty
  await Promise.all(weatherSwitch.dispatch('click'));
  assert.equal(weatherSwitch.getAttribute('aria-checked'), 'true');
  assert.equal(cityInput.focused, true);
  assert.equal(cityStatus.textContent, 'settingsWeatherCityPrompt');

  // Enter city and press Enter (while IME composing should ignore, non-composing submits)
  cityInput.value = 'Beijing';
  cityInput.dispatch('keydown', { key: 'Enter', isComposing: true, preventDefault() {} });
  assert.equal(cityStatus.textContent, 'settingsWeatherCityPrompt');

  const submitPromises = cityInput.dispatch('keydown', { key: 'Enter', isComposing: false, preventDefault() {} });
  assert.equal(cityStatus.textContent, 'citySettingSearching');
  assert.equal(cityConfirm.disabled, true);

  // Escape is blocked while loading
  env.emitWindowKeydown({ key: 'Escape', preventDefault() {} });
  assert.equal(env.calls.some(([name]) => name === 'closeSettingsWindow'), false);

  // Resolve failure first
  resolveGeocode({ success: false });
  await Promise.all(submitPromises);
  await new Promise((r) => setImmediate(r));
  assert.equal(cityConfirm.disabled, false);
  assert.equal(cityInput.getAttribute('aria-invalid'), 'true');
  assert.equal(cityStatus.textContent, 'citySettingError');

  // Resolve success on retry
  let resolveRetry;
  const retryEnv = loadSettingsRenderer({
    snapshot: { weather: { enabled: true, city: '' } },
    setCityName: async (city) => ({
      success: true,
      data: {
        city,
        snapshot: makeSnapshot({ weather: { enabled: true, city } }),
      },
    }),
  });
  await new Promise((r) => setImmediate(r));
  retryEnv.elements.get('city-input').value = 'Tokyo';
  await Promise.all(retryEnv.elements.get('city-confirm').dispatch('click'));
  assert.equal(retryEnv.elements.get('city-current-value').textContent, 'Tokyo');
  assert.equal(retryEnv.elements.get('city-input').value, '');
  assert.equal(retryEnv.elements.get('city-status').textContent, 'citySettingSuccess');
  assert.notEqual(cityCurrent, null);
});

test('break reminder and screensaver switches disable child segment buttons and set aria-disabled', async () => {
  const env = loadSettingsRenderer({
    snapshot: {
      breakReminder: { enabled: false, intervalMinutes: 45, allowedIntervals: [30, 45, 60, 90, 120] },
      screensaver: { enabled: false, idleThresholdMinutes: 5, allowedThresholds: [1, 3, 5, 10, 15, 30] },
    },
  });
  await new Promise((r) => setImmediate(r));

  const brSwitch = env.elements.get('break-reminder-switch');
  const brGroup = env.elements.get('break-reminder-intervals-group');
  const brBtns = env.elements.get('break-reminder-intervals').children;
  const ssSwitch = env.elements.get('screensaver-switch');
  const ssGroup = env.elements.get('screensaver-thresholds-group');
  const ssBtns = env.elements.get('screensaver-thresholds').children;

  assert.equal(brGroup.getAttribute('aria-disabled'), 'true');
  assert.equal(brBtns.every((b) => b.disabled === true), true);
  assert.equal(ssGroup.getAttribute('aria-disabled'), 'true');
  assert.equal(ssBtns.every((b) => b.disabled === true), true);

  await Promise.all(brSwitch.dispatch('click'));
  assert.equal(brSwitch.getAttribute('aria-checked'), 'true');
  assert.equal(brGroup.getAttribute('aria-disabled'), 'false');
  assert.equal(brBtns.every((b) => b.disabled === false), true);

  await Promise.all(ssSwitch.dispatch('click'));
  assert.equal(ssSwitch.getAttribute('aria-checked'), 'true');
  assert.equal(ssBtns.every((b) => b.disabled === false), true);
});

test('autoLaunch reverts on failure and displays pendingApproval notice', async () => {
  const failingEnv = loadSettingsRenderer({
    snapshot: { autoLaunch: { enabled: false, preference: false, pendingApproval: false } },
    changeAutoLaunch: async () => ({
      success: false,
      snapshot: makeSnapshot({ autoLaunch: { enabled: false, preference: false, pendingApproval: false } }),
    }),
  });
  await new Promise((r) => setImmediate(r));

  const failSwitch = failingEnv.elements.get('auto-launch-switch');
  await Promise.all(failSwitch.dispatch('click'));
  assert.equal(failSwitch.getAttribute('aria-checked'), 'false');
  assert.equal(failingEnv.elements.get('auto-launch-status').textContent, 'settingsAutoLaunchError');

  const pendingEnv = loadSettingsRenderer({
    changeAutoLaunch: async () => ({
      success: true,
      data: {
        enabled: false,
        pendingApproval: true,
        snapshot: makeSnapshot({
          autoLaunch: { enabled: false, preference: true, pendingApproval: true },
          autoLaunchPendingApproval: true,
        }),
      },
    }),
  });
  await new Promise((r) => setImmediate(r));
  await Promise.all(pendingEnv.elements.get('auto-launch-switch').dispatch('click'));
  assert.equal(pendingEnv.elements.get('auto-launch-status').textContent, 'settingsAutoLaunchPendingApproval');
});

test('locale switch, external push updates, and skin selector focus restoration', async () => {
  const env = loadSettingsRenderer();
  await new Promise((r) => setImmediate(r));

  const enBtn = env.elements.get('locale-buttons').children.find((b) => b.dataset.locale === 'en');
  await Promise.all(enBtn.dispatch('click'));
  assert.equal(enBtn.getAttribute('aria-pressed'), 'true');
  assert.equal(env.elements.get('settings-current-skin-name').textContent, 'Skin(en)');

  // External push updates confirmed skin name
  env.callbacks.onSettingsUpdated(makeSnapshot({
    skin: { id: 'birds', displayName: '鸟塑七九·凉拌仓鼠' },
  }));
  assert.equal(env.elements.get('settings-current-skin-name').textContent, '鸟塑七九·凉拌仓鼠');

  // Switch to system tab, then trigger restore skin focus -> jumps back to appearance and focuses button
  env.callbacks.onSwitchTab('system');
  env.callbacks.onRestoreSkinFocus();
  assert.equal(env.elements.get('tab-appearance').getAttribute('aria-selected'), 'true');
  assert.equal(env.elements.get('settings-open-skin-button').focused, true);

  // Language refresh callback reloads snapshot
  env.setMockSnapshot({ skin: { id: 'school_au', displayName: 'School AU' } });
  env.triggerLocaleRefresh();
  await new Promise((r) => setImmediate(r));
  assert.equal(env.elements.get('settings-current-skin-name').textContent, 'School AU');
});
