const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

test('settings windows display clean localized titles without Qijiu calligraphy seals', () => {
  for (const [file, titleKey] of [
    ['skin-selector.html', 'skinSelectorTitle'],
    ['city-setting.html', 'citySettingTitle'],
    ['pet-scale.html', 'petScaleTitle'],
  ]) {
    const html = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
    assert.match(html, /href="settings-calligraphy\.css"/);
    assert.doesNotMatch(html, /class="settings-calligraphy"/);
    assert.match(html, new RegExp(`class="settings-calligraphy-title" data-i18n="${titleKey}">[^<]+<`));
  }

  const css = fs.readFileSync(path.join(ROOT, 'src', 'settings-calligraphy.css'), 'utf8');
  assert.doesNotMatch(css, /calligraphy-(?:yqy|sqq|qj)\.webp/);
  assert.doesNotMatch(css, /mask:\s*url/);
});

test('context-menu.css renders clean typography without calligraphy watermarks or clip-path hiding names', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'context-menu.css'), 'utf8');

  // No calligraphy webp references
  assert.doesNotMatch(css, /calligraphy-(?:yqy|sqq|yq|sj|qj)\.webp/);

  // Real localized text is visible in all locales (no clip-path hiding)
  assert.doesNotMatch(css, /clip-path:\s*inset\(50%\)/);
});

test('status.css renders clean card names without calligraphy watermarks or seals', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'status.css'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'src', 'status.html'), 'utf8');

  // No calligraphy webp references in css
  assert.doesNotMatch(css, /calligraphy-(?:yqy|sqq|yq|sj|qj)\.webp/);

  // Real localized name is visible without clip-path hiding
  assert.doesNotMatch(css, /clip-path:\s*inset\(50%\)/);

  // Status HTML does not include legacy seal
  assert.doesNotMatch(html, /class="status-seal-qijiu"/);
});

test('pomodoro.css renders clean dial and completion ceremony without Qijiu calligraphy masks', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'pomodoro.css'), 'utf8');

  assert.doesNotMatch(css, /calligraphy-qj\.webp/);
  assert.match(css, /\.pomodoro-dial-emblem\s*\{[^}]*display:\s*block/);
});

test('statusWindow.js attaches clean pet name text without calligraphy containers', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'statusWindow.js'), 'utf8');

  assert.ok(source.includes('pet-status-name-text'));
  assert.ok(!source.includes('pet-status-calligraphy'));
});

test('ContextMenu header text does not duplicate displayName in real DOM', () => {
  class MockElement {
    constructor() {
      this.children = [];
      this.childNodes = [];
      const classes = new Set();
      this.classList = {
        add: (...c) => c.forEach(item => classes.add(item)),
        remove: (...c) => c.forEach(item => classes.delete(item)),
        contains: (c) => classes.has(c),
      };
      this.style = { setProperty() {} };
      this.dataset = {};
    }
    appendChild(child) {
      this.children.push(child);
      this.childNodes.push(child);
    }
    get textContent() {
      if (this.childNodes.length > 0) {
        return this.childNodes.map(n => n.textContent || '').join('');
      }
      return this._textContent || '';
    }
    set textContent(val) {
      this._textContent = val;
      this.children = [];
      this.childNodes = [];
      if (val) {
        this.childNodes.push({ textContent: val });
      }
    }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    getBoundingClientRect() { return { width: 170, height: 200 }; }
    addEventListener() {}
  }

  const { ContextMenu } = require('../src/ui/ContextMenu.js');
  const menuEl = new MockElement();
  const headerEl = new MockElement();

  const originalDocument = global.document;
  const originalWindow = global.window;

  global.document = {
    getElementById: (id) => (id === 'context-menu' ? menuEl : id === 'menu-header' ? headerEl : null),
    createElement: () => new MockElement(),
    createTextNode: (text) => ({ textContent: text }),
    addEventListener: () => {},
  };
  global.window = {
    electronAPI: { setIgnoreMouseEvents: () => {} },
    t: (key) => (key === 'nameYueqi' ? 'Yue Qingyuan' : key === 'nicknameYueqi' ? 'Yue Qi' : key),
  };

  try {
    const contextMenu = new ContextMenu({}, () => 1);
    contextMenu.show({ id: 'yueqi', name: 'Yue Qingyuan', nickname: 'Yue Qi', isBusy: () => false }, 10, 10);

    const textSpan = headerEl.children.find(c => c.className === 'menu-header-text');
    assert.ok(textSpan, 'textSpan should exist');
    const matches = textSpan.textContent.match(/Yue Qingyuan/g) || [];
    assert.equal(matches.length, 1, `Expected "Yue Qingyuan" to appear exactly once, got: "${textSpan.textContent}"`);

    // Verify dynamic custom pet class cleanup on show / hide
    contextMenu.show({ id: 'custompet', name: 'Custom Pet', nickname: 'Custom', isBusy: () => false }, 10, 10);
    assert.equal(menuEl.classList.contains('context-menu--custompet'), true);
    contextMenu.hide();
    assert.equal(menuEl.classList.contains('context-menu--custompet'), false);
    assert.equal(menuEl.dataset.petId, undefined);
  } finally {
    global.document = originalDocument;
    global.window = originalWindow;
  }
});

test('pomodoro completion ceremony renders stamp, golden ripples, and audio chime', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src', 'pomodoro.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'src', 'pomodoro.css'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'src', 'pomodoroWindow.js'), 'utf8');

  // HTML structure
  assert.match(html, /id="pomodoro-stamp-ceremony"/);
  assert.match(html, /class="[^"]*pomodoro-stamp-seal[^"]*"/);
  assert.match(html, /class="[^"]*pomodoro-stamp-ripple--1[^"]*"/);
  assert.match(html, /class="[^"]*pomodoro-stamp-ripple--2[^"]*"/);

  // CSS animations & reduced motion
  assert.match(css, /@keyframes pomodoroStampDrop\s*\{/);
  assert.match(css, /@keyframes pomodoroStampDropEn\s*\{/);
  assert.match(css, /@keyframes pomodoroRippleExpand\s*\{/);
  assert.match(css, /@keyframes pomodoroStampFadeReduced\s*\{/);
  assert.match(css, /\.pomodoro-stamp-ceremony--active \.pomodoro-stamp-seal/);
  assert.match(css, /\.pomodoro-dial-emblem\s*\{[^}]*animation:\s*none\s*!important/);
  assert.match(css, /html\[data-locale="en"\]\s+\.pomodoro-stamp-ceremony--active\s+\.pomodoro-stamp-seal\s*\{[^}]*animation:\s*pomodoroStampFadeReduced[^}]*!important/);

  // JS chime synthesizer & triggers
  assert.match(js, /function playMeditationChime\(\)/);
  assert.match(js, /function triggerCompletionCeremony\(\)/);
  assert.match(js, /AudioContext || window\.webkitAudioContext/);
  assert.match(js, /currentState\.status === 'completed' && !hasCompletedCeremonyPlayed/);
});
