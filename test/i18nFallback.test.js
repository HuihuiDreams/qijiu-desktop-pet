const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('dialogues init falls back without throwing when I18N is absent', () => {
  const context = {
    window: {},
  };
  vm.createContext(context);

  vm.runInContext(readSource('src/data/dialogues.js'), context);
  assert.doesNotThrow(() => vm.runInContext("initDialogues('en')", context));
  assert.ok(Array.isArray(context.window.DIALOGUES.greet.yueqi));
  assert.equal(context.window.DIALOGUES.greet.yueqi[0], '小九，你也在这里。');
  assert.ok(Array.isArray(context.window.DIALOGUES.weather_windy.yueqi));
  assert.ok(Array.isArray(context.window.DIALOGUES.weather_thunderstorm.shenjiu));
});

test('I18nHelpers.translateUi falls back locale -> zh -> key without throwing when I18N is undeclared', () => {
  delete require.cache[require.resolve('../src/i18nHelpers')];
  delete global.I18N;
  const { I18nHelpers } = require('../src/i18nHelpers');

  // I18N 全局未声明时：getI18nDictionaries 安全返回 null，translateUi 回退到 key 本身
  assert.equal(I18nHelpers.getI18nDictionaries(), null);
  assert.doesNotThrow(() => I18nHelpers.translateUi('greet', 'en'));
  assert.equal(I18nHelpers.translateUi('greet', 'en'), 'greet');
  assert.deepEqual(I18nHelpers.getI18nUi('en'), {});
});

test('I18nHelpers.translateUi resolves locale dictionary before falling back to zh, then key', () => {
  delete require.cache[require.resolve('../src/i18nHelpers')];
  global.I18N = {
    zh: { ui: { greet: '你好', zhOnly: '仅中文文案' } },
    en: { ui: { greet: 'Hello' } },
  };
  const { I18nHelpers } = require('../src/i18nHelpers');

  // 1. locale 字典命中
  assert.equal(I18nHelpers.translateUi('greet', 'en'), 'Hello');
  // 2. locale 字典缺失该 key，回退到 zh 字典
  assert.equal(I18nHelpers.translateUi('zhOnly', 'en'), '仅中文文案');
  // 3. zh 字典也没有该 key，回退到 key 本身
  assert.equal(I18nHelpers.translateUi('missingEverywhere', 'en'), 'missingEverywhere');
  // getI18nUi 遵循同样的 locale -> zh 回退顺序
  assert.deepEqual(I18nHelpers.getI18nUi('en'), { greet: 'Hello' });
  assert.deepEqual(I18nHelpers.getI18nUi('ja'), { greet: '你好', zhOnly: '仅中文文案' });

  delete global.I18N;
});
