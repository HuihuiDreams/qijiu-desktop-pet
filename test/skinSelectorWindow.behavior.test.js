const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const WINDOW_MODULE_PATH = require.resolve('../src/main/windows/SkinSelectorWindow');

function loadFreshSkinSelectorWindow(extraDeps = {}) {
  const windowManager = { skinSelectorWindow: null };
  const originalLoad = Module._load;
  delete require.cache[WINDOW_MODULE_PATH];

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options || {};
      this.listeners = {};
      this.closeCalls = 0;
      this.destroyed = false;
      this.minimized = false;
      this.webContents = {
        on: () => {},
        setWindowOpenHandler: () => {},
        send: () => {},
      };
    }

    on(channel, listener) {
      this.listeners[channel] = listener;
    }

    loadFile() {}

    isDestroyed() {
      return this.destroyed;
    }

    isVisible() {
      return false;
    }

    isMinimized() { return this.minimized; }

    restore() { this.minimized = false; }

    blur() { this.listeners.blur?.(); }

    show() {}

    moveTop() {}

    focus() {}

    close() {
      this.closeCalls += 1;
      this.listeners.close?.();
      // macOS can emit blur while a focused floating window is closing.
      this.listeners.blur?.();
      this.destroyed = true;
      this.listeners.closed?.();
    }
  }

  Module._load = function loadSkinSelectorDependencies(request, parent, isMain) {
    if (parent?.filename === WINDOW_MODULE_PATH && request === 'electron') {
      return {
        BrowserWindow: FakeBrowserWindow,
        screen: {
          getCursorScreenPoint: () => ({ x: 0, y: 0 }),
          getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1600, height: 900 } }),
        },
      };
    }
    if (parent?.filename === WINDOW_MODULE_PATH && request === './WindowManager') {
      return windowManager;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    // eslint-disable-next-line global-require
    const skinSelectorWindow = require('../src/main/windows/SkinSelectorWindow');
    skinSelectorWindow.init({
      getCurrentSkinId: () => 'default',
      getSkinGalleryItems: () => [],
      selectSkin: () => {},
      ...extraDeps,
    });
    return {
      skinSelectorWindow,
      windowManager,
    };
  } finally {
    Module._load = originalLoad;
  }
}

test('retains preview when focus moves to another app or the Windows tray overflow', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  let rollbackCount = 0;
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow({
    revertSkinPreview: () => { rollbackCount++; },
  });
  const win = skinSelectorWindow.openSkinSelectorWindow();
  skinSelectorWindow.setSkinSelectorSelectionInProgress(true);
  win.blur();
  t.mock.timers.tick(5000);

  assert.equal(win.closeCalls, 0);
  assert.equal(rollbackCount, 0);
  assert.equal(skinSelectorWindow.getSkinSelectorOriginalSkinId(), 'default');
  assert.equal(skinSelectorWindow.isSkinSelectorSelectionInProgress(), true);
  skinSelectorWindow.closeSkinSelectorWindow();
  assert.equal(rollbackCount, 1);
});

test('native close of a skin selector rolls back the preview exactly once', () => {
  let rollbackCount = 0;
  const { skinSelectorWindow, windowManager } = loadFreshSkinSelectorWindow({
    revertSkinPreview: () => { rollbackCount++; },
  });
  const win = skinSelectorWindow.openSkinSelectorWindow();
  win.close();

  assert.equal(rollbackCount, 1);
  assert.equal(windowManager.skinSelectorWindow, null);
});

test('the selector uses ordinary window stacking and can be minimized', () => {
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow();
  const win = skinSelectorWindow.openSkinSelectorWindow();
  assert.equal(win.options.alwaysOnTop, false);
  assert.equal(win.options.minimizable, true);
});

test('closing the skin selector ignores the blur emitted by its own close operation', () => {
  const { skinSelectorWindow, windowManager } = loadFreshSkinSelectorWindow();
  const win = skinSelectorWindow.openSkinSelectorWindow();

  assert.doesNotThrow(() => skinSelectorWindow.closeSkinSelectorWindow());
  assert.equal(win.closeCalls, 1);
  assert.equal(windowManager.skinSelectorWindow, null);
});

test('sendSkinSelectorData returns immediately when window is null or destroyed', () => {
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow();
  assert.doesNotThrow(() => skinSelectorWindow.sendSkinSelectorData());
});

test('sendSkinSelectorData sends gallery data with isSelected correctly marked', () => {
  const { skinSelectorWindow, windowManager } = loadFreshSkinSelectorWindow();
  
  skinSelectorWindow.init({
    getCurrentSkinId: () => 'skin-b',
    getSkinGalleryItems: () => [
      { id: 'skin-a' },
      { id: 'skin-b' },
    ],
    selectSkin: () => {},
  });

  const win = skinSelectorWindow.openSkinSelectorWindow();
  let sentData = null;
  win.webContents.send = (channel, data) => {
    if (channel === 'skin-selector-data') sentData = data;
  };

  skinSelectorWindow.sendSkinSelectorData();

  assert.ok(sentData);
  assert.equal(sentData.length, 2);
  assert.equal(sentData[0].isSelected, false);
  assert.equal(sentData[1].isSelected, true);
});

test('openSkinSelectorWindow reuses existing window and refreshes data on second call', () => {
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow();
  const win1 = skinSelectorWindow.openSkinSelectorWindow();
  
  let sendCalls = 0;
  win1.webContents.send = (channel) => {
    if (channel === 'skin-selector-data') sendCalls++;
  };

  const win2 = skinSelectorWindow.openSkinSelectorWindow();
  
  assert.equal(win1, win2);
  assert.equal(sendCalls, 1);
});

test('cancelSkinSelection reverts to original skin when preview changed the skin', () => {
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow();
  
  let selectedSkin = null;
  skinSelectorWindow.init({
    getCurrentSkinId: () => 'skin-b',
    getSkinGalleryItems: () => [],
    selectSkin: (id) => { selectedSkin = id; },
  });

  skinSelectorWindow.setSkinSelectorOriginalSkinId('skin-a');
  skinSelectorWindow.closeSkinSelectorWindow();
  
  assert.equal(selectedSkin, 'skin-a');
  assert.equal(skinSelectorWindow.getSkinSelectorOriginalSkinId(), null);
});

test('reopening an active skin selection preserves the preview card and original skin', () => {
  let currentSkinId = 'default';
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow({ getCurrentSkinId: () => currentSkinId });
  const win = skinSelectorWindow.openSkinSelectorWindow();
  let sentOptions = null;
  win.webContents.send = (channel, data, options) => { sentOptions = options; };
  currentSkinId = 'birds';

  skinSelectorWindow.openSkinSelectorWindow();

  assert.equal(skinSelectorWindow.getSkinSelectorOriginalSkinId(), 'default');
  assert.equal(sentOptions.resetSelection, false, 'existing preview selection must survive gallery refresh');
});

test('closeSkinSelectorWindow re-entrance protection: second call is a no-op', () => {
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow();
  const win = skinSelectorWindow.openSkinSelectorWindow();
  
  win.close = () => {
    win.closeCalls += 1;
    skinSelectorWindow.closeSkinSelectorWindow();
    win.destroyed = true;
  };

  skinSelectorWindow.closeSkinSelectorWindow();
  assert.equal(win.closeCalls, 1);
});

test('closeSkinSelectorWindow when window is already null/destroyed resets closeInProgress', () => {
  const { skinSelectorWindow, windowManager } = loadFreshSkinSelectorWindow();
  windowManager.skinSelectorWindow = null;
  assert.doesNotThrow(() => skinSelectorWindow.closeSkinSelectorWindow());
});

test('getter/setter verification', () => {
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow();
  
  skinSelectorWindow.setSkinSelectorSelectionInProgress(true);
  assert.equal(skinSelectorWindow.isSkinSelectorSelectionInProgress(), true);
  
  skinSelectorWindow.setSkinSelectorSelectionInProgress(false);
  assert.equal(skinSelectorWindow.isSkinSelectorSelectionInProgress(), false);
  
  skinSelectorWindow.setSkinSelectorOriginalSkinId('test-skin');
  assert.equal(skinSelectorWindow.getSkinSelectorOriginalSkinId(), 'test-skin');
});

test('sendSkinSelectorData forwards sendOptions preserving resetSelection', () => {
  const { skinSelectorWindow, windowManager } = loadFreshSkinSelectorWindow();
  let sentChannel = null;
  let sentData = null;
  let sentOptions = null;

  windowManager.skinSelectorWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, data, options) => {
        sentChannel = channel;
        sentData = data;
        sentOptions = options;
      },
    },
  };

  skinSelectorWindow.sendSkinSelectorData({ resetSelection: false });

  assert.equal(sentChannel, 'skin-selector-data');
  assert.ok(Array.isArray(sentData));
  assert.deepEqual(sentOptions, { isInitialLoad: false, resetSelection: false });
});

test('creates the skin selector window with hasShadow false to prevent macOS border line and resizable false', () => {
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow();
  const win = skinSelectorWindow.createSkinSelectorWindow();
  assert.equal(win.options.hasShadow, false);
  assert.equal(win.options.resizable, false);
  assert.equal(win.options.transparent, true);
  assert.equal(win.options.frame, false);
});

test('reopening a minimized selector restores the same preview session', () => {
  const { skinSelectorWindow } = loadFreshSkinSelectorWindow();
  const win = skinSelectorWindow.openSkinSelectorWindow();
  let sentOptions;
  win.webContents.send = (channel, items, options) => { sentOptions = options; };
  win.minimized = true;

  assert.equal(skinSelectorWindow.openSkinSelectorWindow(), win);
  assert.equal(win.minimized, false);
  assert.equal(sentOptions.resetSelection, false);
  assert.equal(skinSelectorWindow.getSkinSelectorOriginalSkinId(), 'default');
});

test('skin-selector.css applies content-visibility only to below-the-fold cards (n + 7)', () => {
  const cssPath = path.join(__dirname, '../src/skin-selector.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Verify below-the-fold rule exists with content-visibility: auto and contain-intrinsic-size
  assert.match(
    css,
    /\.skin-card:nth-child\(n\s*\+\s*7\)\s*\{[^}]*content-visibility:\s*auto;[^}]*contain-intrinsic-size:\s*auto none auto 182px;[^}]*\}/s,
    'below-the-fold cards (n + 7) must have content-visibility: auto and contain-intrinsic-size'
  );

  // Verify above-the-fold cards (base .skin-card) do NOT have content-visibility
  const baseCardMatch = css.match(/\.skin-card\s*\{([^}]+)\}/s);
  assert.ok(baseCardMatch, 'base .skin-card rule must exist');
  assert.doesNotMatch(
    baseCardMatch[1],
    /content-visibility/,
    'above-the-fold .skin-card must not have content-visibility to avoid delaying critical page load'
  );
});

test('skin-selector.css scopes hover to non-disabled cards to prevent floating locked cards', () => {
  const cssPath = path.join(__dirname, '../src/skin-selector.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Scoped hover rule must exist
  assert.match(
    css,
    /\.skin-card:hover:not\(:disabled\)/,
    '.skin-card:hover must be scoped with :not(:disabled)'
  );

  // Unscoped .skin-card:hover must NOT exist
  assert.doesNotMatch(
    css,
    /\.skin-card:hover(?!\s*:\s*not\(:disabled\))/,
    'unscoped .skin-card:hover must not exist'
  );
});

test('skin-selector.css aligns close and action button visual styles and focus-visible rings', () => {
  const cssPath = path.join(__dirname, '../src/skin-selector.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(css, /\.skin-selector-close:hover:not\(:disabled\)\s*\{[\s\S]*?background:\s*var\(--color-jade-mist\);/);
  assert.match(css, /\.skin-selector-close:hover:not\(:disabled\)\s*\{[\s\S]*?color:\s*var\(--color-jade-deep\);/);
  assert.match(css, /\.skin-selector-btn-confirm\s*\{[\s\S]*?linear-gradient\(135deg,\s*rgba\(110,\s*198,\s*160,\s*0\.92\),\s*rgba\(201,\s*162,\s*77,\s*0\.62\)\)/);
  assert.match(css, /\.skin-selector-btn-confirm:disabled\s*\{[\s\S]*?opacity:\s*0\.55;[\s\S]*?cursor:\s*not-allowed;/);
  assert.match(css, /\.skin-selector-btn:focus-visible,\s*\.skin-selector-close:focus-visible\s*\{[\s\S]*?outline:\s*2px solid rgba\(110, 198, 160, 0\.7\);/);
});

test('skin-selector.css applies disabled styles to close and action buttons', () => {
  const cssPath = path.join(__dirname, '../src/skin-selector.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(css, /\.skin-selector-close:disabled\s*\{[\s\S]*?opacity:\s*0\.45;[\s\S]*?cursor:\s*not-allowed;/);
  assert.match(css, /\.skin-selector-btn:disabled,\s*\.skin-selector-btn-confirm:disabled\s*\{[\s\S]*?opacity:\s*0\.55;[\s\S]*?cursor:\s*not-allowed;/);
  assert.match(css, /\.skin-selector-btn-cancel:hover:not\(:disabled\)/);
  assert.match(css, /\.skin-selector-close:active:not\(:disabled\)/);
  assert.match(css, /\.skin-selector-btn:active:not\(:disabled\)/);
});

test('skinSelectorWindow.js setLoading disables cancelBtn and closeBtn during loading', () => {
  const rendererPath = path.join(__dirname, '../src/skinSelectorWindow.js');
  const rendererCode = fs.readFileSync(rendererPath, 'utf8');

  assert.match(rendererCode, /if\s*\(confirmBtn\)\s*confirmBtn\.disabled\s*=\s*loading;/);
  assert.match(rendererCode, /if\s*\(cancelBtn\)\s*cancelBtn\.disabled\s*=\s*loading;/);
  assert.match(rendererCode, /if\s*\(closeBtn\)\s*closeBtn\.disabled\s*=\s*loading;/);
});

