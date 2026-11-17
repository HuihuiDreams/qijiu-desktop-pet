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
    append(...items) {
      for (const item of items) {
        if (typeof item === 'string') continue;
        this.children.push(item);
      }
    },
    replaceChildren(...items) {
      this.children.length = 0;
      this.children.push(...items);
    },
    focus() {
      if (this.disabled) return;
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

  Object.assign(electronAPI, options.api);

  let customLocaleCallback = null;
  const sandbox = {
    document: {
      getElementById: (id) => elements.get(id) || null,
      ...(options.withCreateElement ? { createElement: (tag) => createFakeElement(tag) } : {}),
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
    emitWindowEvent: (type, event = {}) => {
      for (const fn of windowListeners[type] || []) fn(event);
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
  assert.match(html, /class="settings-title-group"[\s\S]*id="weather-sync-label"[\s\S]*class="settings-city-current"/);
  assert.doesNotMatch(html, /<main id="settings-panel"[^>]*aria-live=/);
  assert.match(html, /id="auto-launch-switch"[\s\S]*aria-describedby="auto-launch-hint"/);
  assert.equal(js.includes('innerHTML'), false);

  assert.match(css, /\.settings-tabpanel\s*\{[\s\S]*flex:\s*1;[\s\S]*min-height:\s*0;[\s\S]*overflow-y:\s*auto;[\s\S]*scrollbar-gutter:\s*stable;/);
  assert.match(css, /\.settings-segment-group\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:/);
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
  cityInput.focused = false;
  cityInput.dispatch('keydown', { key: 'Enter', isComposing: true, preventDefault() {} });
  assert.equal(cityStatus.textContent, 'settingsWeatherCityPrompt');

  const submitPromises = cityInput.dispatch('keydown', { key: 'Enter', isComposing: false, preventDefault() {} });
  assert.equal(cityStatus.textContent, 'citySettingSearching');
  assert.equal(cityConfirm.disabled, true);
  assert.equal(cityInput.disabled, true);

  // Escape is blocked while loading
  env.emitWindowKeydown({ key: 'Escape', preventDefault() {} });
  assert.equal(env.calls.some(([name]) => name === 'closeSettingsWindow'), false);

  // Resolve failure first: input must be re-enabled BEFORE focus() is restored
  resolveGeocode({ success: false });
  await Promise.all(submitPromises);
  await new Promise((r) => setImmediate(r));
  assert.equal(cityConfirm.disabled, false);
  assert.equal(cityInput.disabled, false);
  assert.equal(cityInput.focused, true);
  assert.equal(cityInput.getAttribute('aria-invalid'), 'true');
  assert.equal(cityStatus.textContent, 'citySettingError');

  // Resolve success on retry
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
    changeAutoLaunch: async (enabled) => {
      const next = Boolean(enabled);
      if (next) {
        return {
          success: true,
          data: {
            enabled: false,
            pendingApproval: true,
            snapshot: makeSnapshot({
              autoLaunch: { enabled: false, preference: true, pendingApproval: true },
            }),
          },
        };
      }
      return {
        success: true,
        data: {
          enabled: false,
          pendingApproval: false,
          snapshot: makeSnapshot({
            autoLaunch: { enabled: false, preference: false, pendingApproval: false },
          }),
        },
      };
    },
  });
  await new Promise((r) => setImmediate(r));
  const pendingSwitch = pendingEnv.elements.get('auto-launch-switch');
  await Promise.all(pendingSwitch.dispatch('click'));
  assert.equal(pendingSwitch.getAttribute('aria-checked'), 'true');
  assert.equal(pendingEnv.elements.get('auto-launch-status').textContent, 'settingsAutoLaunchPendingApproval');

  // Clicking again while pendingApproval must request false and clear the pending notice
  await Promise.all(pendingSwitch.dispatch('click'));
  assert.equal(pendingSwitch.getAttribute('aria-checked'), 'false');
  assert.equal(pendingEnv.elements.get('auto-launch-status').textContent, '');
});

test('autoLaunch opened in macOS pendingApproval state renders on and can be toggled off', async () => {
  const sentValues = [];
  const env = loadSettingsRenderer({
    snapshot: { autoLaunch: { enabled: false, preference: true, pendingApproval: true } },
    changeAutoLaunch: async (enabled) => {
      sentValues.push(enabled);
      return {
        success: true,
        data: {
          enabled: false,
          pendingApproval: false,
          snapshot: makeSnapshot({
            autoLaunch: { enabled: false, preference: false, pendingApproval: false },
          }),
        },
      };
    },
  });
  await new Promise((r) => setImmediate(r));

  const sw = env.elements.get('auto-launch-switch');
  assert.equal(sw.getAttribute('aria-checked'), 'true');
  assert.equal(env.elements.get('auto-launch-status').textContent, 'settingsAutoLaunchPendingApproval');

  await Promise.all(sw.dispatch('click'));
  assert.deepEqual(sentValues, [false]);
  assert.equal(sw.getAttribute('aria-checked'), 'false');
  assert.equal(env.elements.get('auto-launch-status').textContent, '');
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

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('a rejected settings IPC does not leak an unhandled rejection and resyncs the switch from main', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args);
    let env;
    try {
      env = loadSettingsRenderer({
        api: { setWindowAwareness: async () => { throw new Error('ipc down'); } },
      });
      await flush();
      const awareness = env.elements.get('window-awareness-switch');
      assert.equal(awareness.getAttribute('aria-checked'), 'true');

      const getSnapshotBefore = env.calls.filter(([name]) => name === 'getSnapshot').length;
      env.setMockSnapshot({ windowAwareness: { enabled: false, supported: true } });
      await Promise.all(awareness.dispatch('click'));
      await flush();

      assert.equal(errors.length, 1);
      assert.equal(env.calls.filter(([name]) => name === 'getSnapshot').length, getSnapshotBefore + 1);
      assert.equal(awareness.getAttribute('aria-checked'), 'false', 'switch follows the main process snapshot');
    } finally {
      console.error = originalError;
    }
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(unhandled, []);
});

test('rapid clicks on one switch are serialized and each reads the latest state', async () => {
  const env = loadSettingsRenderer({ snapshot: { weather: { enabled: false, city: 'Tokyo' } } });
  await flush();
  const weatherSwitch = env.elements.get('weather-sync-switch');

  const first = weatherSwitch.dispatch('click');
  const second = weatherSwitch.dispatch('click');
  await Promise.all([...first, ...second]);

  assert.deepEqual(
    env.calls.filter(([name]) => name === 'setWeatherEnabled'),
    [['setWeatherEnabled', true], ['setWeatherEnabled', false]],
  );
  assert.equal(weatherSwitch.getAttribute('aria-checked'), 'false');
});

test('rapid segment clicks are queued in click order without being dropped', async () => {
  const env = loadSettingsRenderer();
  await flush();
  const [b30, b45] = env.elements.get('break-reminder-intervals').children;

  await Promise.all([...b30.dispatch('click'), ...b45.dispatch('click')]);

  assert.deepEqual(
    JSON.parse(JSON.stringify(env.calls.filter(([name]) => name === 'setBreakReminder'))),
    [['setBreakReminder', { intervalMinutes: 30 }], ['setBreakReminder', { intervalMinutes: 45 }]],
  );
  assert.equal(b45.getAttribute('aria-pressed'), 'true');
  assert.equal(b30.getAttribute('aria-pressed'), 'false');
});

test('slider ignores pushed snapshots while dragging and releases on pointerup even without a change event', async () => {
  const env = loadSettingsRenderer();
  await flush();
  const slider = env.elements.get('scale-slider');
  const valueEl = env.elements.get('scale-current-value');

  slider.dispatch('pointerdown', {});
  slider.dispatch('input', { target: { value: '140' } });
  assert.equal(valueEl.textContent, '140%');

  env.callbacks.onSettingsUpdated(makeSnapshot({
    petScale: { ...makeSnapshot().petScale, currentPercent: 80 },
  }));
  assert.equal(valueEl.textContent, '140%', 'stale snapshot must not move the slider mid-drag');
  assert.equal(slider.value, '140');

  // drag back to the original value and release: browsers may skip `change`
  slider.dispatch('input', { target: { value: '100' } });
  env.emitWindowEvent('pointerup');
  env.callbacks.onSettingsUpdated(makeSnapshot({
    petScale: { ...makeSnapshot().petScale, currentPercent: 90 },
  }));
  assert.equal(valueEl.textContent, '90%', 'drag flag must be cleared by pointerup');
});

test('slider drag flag is also cleared by pointercancel, blur and change', async () => {
  const env = loadSettingsRenderer();
  await flush();
  const slider = env.elements.get('scale-slider');
  const valueEl = env.elements.get('scale-current-value');

  const push = (percent) => env.callbacks.onSettingsUpdated(makeSnapshot({
    petScale: { ...makeSnapshot().petScale, currentPercent: percent },
  }));

  slider.dispatch('pointerdown', {});
  env.emitWindowEvent('pointercancel');
  push(70);
  assert.equal(valueEl.textContent, '70%');

  slider.dispatch('pointerdown', {});
  slider.dispatch('blur', {});
  push(75);
  assert.equal(valueEl.textContent, '75%');

  slider.dispatch('pointerdown', {});
  await Promise.all(slider.dispatch('change', { target: { value: '120' } }));
  push(120);
  assert.equal(valueEl.textContent, '120%');
});

test('pet scale reset failure rolls the optimistic 100% back to the main process value', async () => {
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    const env = loadSettingsRenderer({
      snapshot: { petScale: { ...makeSnapshot().petScale, currentPercent: 130, committedPercent: 130 } },
      api: { resetPetScale: async () => { throw new Error('ipc down'); } },
    });
    await flush();
    const valueEl = env.elements.get('scale-current-value');
    assert.equal(valueEl.textContent, '130%');

    await Promise.all(env.elements.get('scale-reset').dispatch('click'));
    await flush();
    assert.equal(valueEl.textContent, '130%');
    assert.equal(errors.length, 1);
  } finally {
    console.error = originalError;
  }
});

test('auto launch IPC rejection shows the error notice instead of an unhandled rejection', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const env = loadSettingsRenderer({
      api: { changeAutoLaunch: async () => { throw new Error('ipc down'); } },
    });
    await flush();
    await Promise.all(env.elements.get('auto-launch-switch').dispatch('click'));
    assert.equal(env.elements.get('auto-launch-status').textContent, 'settingsAutoLaunchError');
    assert.equal(env.elements.get('auto-launch-switch').getAttribute('aria-checked'), 'false');
  } finally {
    console.error = originalError;
  }
});

test('city confirm rejection re-enables the input before restoring focus', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const env = loadSettingsRenderer({
      setCityName: async () => { throw new Error('network error'); },
    });
    await flush();

    const cityInput = env.elements.get('city-input');
    cityInput.value = 'Beijing';
    cityInput.focused = false;
    await Promise.all(env.elements.get('city-confirm').dispatch('click'));

    assert.equal(cityInput.disabled, false);
    assert.equal(cityInput.focused, true);
    assert.equal(cityInput.getAttribute('aria-invalid'), 'true');
    assert.equal(env.elements.get('city-status').textContent, 'citySettingError');
  } finally {
    console.error = originalError;
  }
});

test('rapid auto-launch clicks where the first fails and the second succeeds clear the error notice', async () => {
  let attempt = 0;
  let resolveFirst;
  const env = loadSettingsRenderer({
    changeAutoLaunch: async (enabled) => {
      attempt += 1;
      if (attempt === 1) {
        return new Promise((resolve) => { resolveFirst = resolve; });
      }
      return {
        success: true,
        data: {
          enabled,
          pendingApproval: false,
          snapshot: makeSnapshot({ autoLaunch: { enabled, preference: enabled, pendingApproval: false } }),
        },
      };
    },
  });
  await flush();

  const sw = env.elements.get('auto-launch-switch');
  const firstClick = sw.dispatch('click');
  const secondClick = sw.dispatch('click');
  await flush();

  resolveFirst({
    success: false,
    snapshot: makeSnapshot({ autoLaunch: { enabled: false, preference: false, pendingApproval: false } }),
  });

  await Promise.all([...firstClick, ...secondClick]);
  assert.equal(sw.getAttribute('aria-checked'), 'true');
  assert.equal(env.elements.get('auto-launch-status').textContent, '');
});

test('segment buttons rebuild from snapshot allowedIntervals/allowedThresholds and static HTML matches backend lists', async () => {
  const html = readSource('src/settings.html');
  const { SCREENSAVER_ALLOWED_IDLE_MINUTES } = require('../src/main/services/screensaverAllowedMinutes');
  const htmlIntervals = Array.from(html.matchAll(/data-interval="(\d+)"/g), (m) => Number(m[1]));
  const htmlThresholds = Array.from(html.matchAll(/data-threshold="(\d+)"/g), (m) => Number(m[1]));
  assert.deepEqual(htmlIntervals, [30, 45, 60, 90, 120]);
  assert.deepEqual(htmlThresholds, [...SCREENSAVER_ALLOWED_IDLE_MINUTES]);

  const env = loadSettingsRenderer({
    withCreateElement: true,
    snapshot: {
      breakReminder: { enabled: true, intervalMinutes: 45, allowedIntervals: [15, 45, 75] },
      screensaver: { enabled: true, idleThresholdMinutes: 10, allowedThresholds: [2, 10] },
    },
  });
  await flush();

  const breakButtons = env.elements.get('break-reminder-intervals').children;
  const thresholdButtons = env.elements.get('screensaver-thresholds').children;
  assert.deepEqual(breakButtons.map((b) => Number(b.dataset.interval)), [15, 45, 75]);
  assert.deepEqual(thresholdButtons.map((b) => Number(b.dataset.threshold)), [2, 10]);
  assert.equal(breakButtons[1].getAttribute('aria-pressed'), 'true');
  assert.equal(thresholdButtons[1].getAttribute('aria-pressed'), 'true');

  await Promise.all(breakButtons[0].dispatch('click'));
  await Promise.all(thresholdButtons[0].dispatch('click'));
  assert.deepEqual(
    JSON.parse(JSON.stringify(env.calls.filter(([name]) => name === 'setBreakReminder'))),
    [['setBreakReminder', { intervalMinutes: 15 }]],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(env.calls.filter(([name]) => name === 'setScreensaver'))),
    [['setScreensaver', { idleThresholdMinutes: 2 }]],
  );
  assert.equal(breakButtons[0].getAttribute('aria-pressed'), 'true');
  assert.equal(thresholdButtons[0].getAttribute('aria-pressed'), 'true');
});
