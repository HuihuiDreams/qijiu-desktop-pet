const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readPackageJson() {
  return JSON.parse(readSource('package.json'));
}

const MOJIBAKE_MARKERS = /[譛蜈蟯豐荳螳邇竊笏窶]/;

function visibleTextFromHtml(source) {
  return source
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test('primary static window fallback text is readable UTF-8', () => {
  const expected = {
    'src/index.html': [
      '岳七 & 沈九 桌面宠物',
      '喂食',
      '打坐修炼',
      '摸头',
      '休息',
      '查看状态',
      '修仙状态',
    ],
    'src/pomodoro.html': [
      '苍穹静修',
      '取消置顶',
      '关闭',
      '本次闭关多久？',
      '分钟',
      '开始静修',
      '提前出关',
      '静修圆满',
      '闭关结束，修为又大有精进。',
      '出关',
    ],
    'src/city-setting.html': [
      '城市设置',
      '关闭',
      '当前城市：',
      '未设置',
      '确认',
    ],
    'src/status.html': [
      '修仙状态',
      'Make QiJiu Great Again!',
    ],
  };

  for (const [relativePath, snippets] of Object.entries(expected)) {
    const source = readSource(relativePath);
    const visibleText = visibleTextFromHtml(source);
    assert.equal(source.includes('\uFFFD'), false, `${relativePath} should not contain replacement characters`);
    assert.equal(MOJIBAKE_MARKERS.test(visibleText), false, `${relativePath} visible fallback text should not contain mojibake markers`);

    for (const snippet of snippets) {
      assert.ok(source.includes(snippet), `${relativePath} should include fallback text: ${snippet}`);
    }
  }
});

test('city and pomodoro windows preserve i18n attributes while using readable fallback text', () => {
  const cityHtml = readSource('src/city-setting.html');
  const pomodoroHtml = readSource('src/pomodoro.html');

  for (const snippet of [
    'data-i18n="citySettingTitle"',
    'data-i18n="citySettingCurrent"',
    'data-i18n="citySettingNone"',
    'data-i18n-placeholder="citySettingPlaceholder"',
    'data-i18n="citySettingConfirm"',
    'data-i18n-title="pomodoroClose"',
  ]) {
    assert.match(cityHtml, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const snippet of [
    'data-i18n="pomodoroTitle"',
    'data-i18n-title="pomodoroUnpin"',
    'data-i18n-title="pomodoroClose"',
    'data-i18n="pomodoroPrompt"',
    'data-i18n-title="pomodoroDecrease"',
    'data-i18n-title="pomodoroIncrease"',
    'data-i18n="pomodoroStart"',
    'data-i18n="pomodoroStop"',
    'data-i18n="pomodoroCompleted"',
    'data-i18n="pomodoroCompleteMessage"',
    'data-i18n="pomodoroFinish"',
  ]) {
    assert.match(pomodoroHtml, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('package display metadata is readable UTF-8', () => {
  const pkg = readPackageJson();
  const values = [
    pkg.description,
    pkg.build.productName,
    pkg.build.nsis.shortcutName,
    pkg.build.nsis.uninstallDisplayName,
  ];

  assert.deepEqual(values, [
    '岳清源 & 沈清秋 桌面爱宠',
    '七九爱宠',
    '七九爱宠',
    '七九爱宠',
  ]);

  for (const value of values) {
    assert.equal(value.includes('\uFFFD'), false);
    assert.equal(MOJIBAKE_MARKERS.test(value), false);
  }
});

test('shared UI design tokens cover panels, controls, focus, feedback, and motion', () => {
  const css = readSource('src/index.css');

  for (const token of [
    '--panel-bg',
    '--panel-border',
    '--panel-shadow',
    '--panel-deco-bg',
    '--control-height-sm',
    '--control-height-md',
    '--control-radius',
    '--control-border',
    '--control-bg',
    '--control-primary-bg',
    '--control-primary-shadow',
    '--focus-ring',
    '--feedback-success',
    '--feedback-error',
    '--feedback-muted',
    '--tooltip-bg',
    '--motion-fast',
    '--motion-normal',
    '--motion-panel',
  ]) {
    assert.match(css, new RegExp(`${token}:`), `${token} should be defined`);
  }
});

test('shared native UI classes exist and are consumed by the city setting window', () => {
  const css = readSource('src/index.css');
  const cityHtml = readSource('src/city-setting.html');

  for (const selector of [
    '.ui-panel',
    '.ui-titlebar',
    '.ui-icon-button',
    '.ui-primary-button',
    '.ui-ghost-button',
    '.ui-input',
    '.ui-feedback',
    '.ui-tooltip',
  ]) {
    assert.match(css, new RegExp(selector.replace('.', '\\.')), `${selector} should be defined`);
  }

  for (const className of [
    'ui-panel',
    'ui-titlebar',
    'ui-icon-button',
    'ui-input',
    'ui-primary-button',
    'ui-feedback',
  ]) {
    assert.match(cityHtml, new RegExp(`class="[^"]*\\b${className}\\b`), `city setting window should use ${className}`);
  }
});
