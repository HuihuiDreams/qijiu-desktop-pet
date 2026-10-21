const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

test('all required calligraphy webp assets exist in src/assets', () => {
  const assets = [
    'calligraphy-yqy.webp',
    'calligraphy-sqq.webp',
    'calligraphy-yq.webp',
    'calligraphy-sj.webp',
    'calligraphy-qj.webp',
  ];

  for (const file of assets) {
    const fullPath = path.join(ROOT, 'src', 'assets', file);
    assert.ok(fs.existsSync(fullPath), `Asset ${file} should exist`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 0, `Asset ${file} should not be empty`);
  }
});

test('context-menu.css isolates calligraphy decorations and keeps english watermark faint', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'context-menu.css'), 'utf8');

  // Watermark rules
  assert.match(css, /\.context-menu--yueqi::before/);
  assert.match(css, /\.context-menu--shenjiu::before/);
  assert.match(css, /html\[data-locale="en"\]\s+\.context-menu::before\s*\{[^}]*opacity:\s*0\.045/);

  // Header horizontal calligraphy rules (text shown in en, calligraphy in zh/ja)
  const nameRule = css.match(/html:not\(\[data-locale="en"\]\)\s+\.menu-header-text\s*\{([^}]*)\}/)?.[1] || '';
  assert.doesNotMatch(nameRule, /display:\s*none|visibility:\s*hidden/);
  assert.match(nameRule, /position:\s*absolute/);
  assert.match(nameRule, /clip-path:\s*inset\(50%\)/);
  assert.match(css, /html\[data-locale="en"\]\s+\.menu-header-calligraphy\s*\{[^}]*display:\s*none\s*!important/);
});

test('status.css isolates calligraphy card names and keeps background watermark and seal across locales', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'status.css'), 'utf8');

  // Card watermark rules
  assert.match(css, /\.pet-status-block--yueqi::before/);
  assert.match(css, /\.pet-status-block--shenjiu::before/);
  assert.match(css, /html\[data-locale="en"\]\s+\.pet-status-block::before\s*\{[^}]*opacity:\s*0\.045/);

  // Horizontal card name calligraphy
  const nameRule = css.match(/html:not\(\[data-locale="en"\]\)\s+\.pet-status-name-text\s*\{([^}]*)\}/)?.[1] || '';
  assert.doesNotMatch(nameRule, /display:\s*none|visibility:\s*hidden/);
  assert.match(nameRule, /position:\s*absolute/);
  assert.match(nameRule, /clip-path:\s*inset\(50%\)/);
  assert.match(css, /html:not\(\[data-locale="en"\]\)\s+\.pet-status-block--yueqi\s+\.pet-status-calligraphy/);
  assert.match(css, /html:not\(\[data-locale="en"\]\)\s+\.pet-status-block--shenjiu\s+\.pet-status-calligraphy/);

  // Gilded seal for 七九
  assert.match(css, /\.status-seal-qijiu/);
  assert.match(css, /calligraphy-qj\.webp/);
});

test('pomodoro.css uses the same dial emblem opacity across locales', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'pomodoro.css'), 'utf8');

  assert.match(css, /\.pomodoro-dial-emblem\s*\{[^}]*display:\s*block/);
  assert.match(css, /calligraphy-qj\.webp/);
  assert.doesNotMatch(css, /html\[data-locale="en"\]\s+\.pomodoro-dial-emblem\s*\{/);
});

test('statusWindow.js attaches pet modifier class and calligraphy container', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'statusWindow.js'), 'utf8');

  assert.ok(source.includes('pet-status-block--${pet.id}'));
  assert.ok(source.includes('pet-status-calligraphy'));
  assert.ok(source.includes('pet-status-name-text'));
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
