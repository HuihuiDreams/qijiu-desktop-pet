const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Dynamically require i18n.js to get the real object
const { DICTIONARY } = require('../src/data/i18n.js');

test('i18n dictionary structure is valid', () => {
  assert.ok(DICTIONARY, 'DICTIONARY should be exported');
  assert.ok(DICTIONARY.zh, 'Chinese dictionary should exist');
  assert.ok(DICTIONARY.en, 'English dictionary should exist');
  assert.ok(DICTIONARY.ja, 'Japanese dictionary should exist');
});

const KEY_UI_TEXT_KEYS = [
  'trayShow',
  'trayHide',
  'trayExit',
  'trayTitle',
  'trayDesc',
  'updateTitle',
  'updateMessage',
  'updateCancel',
  'updateInstall',
  'pomodoroTitle',
  'pomodoroStart',
  'pomodoroFinish',
  'citySettingConfirm',
  'contextMenuFeed',
  'contextMenuCultivate',
  'contextMenuRest',
  'contextMenuStatus',
  'nameYueqi',
  'nicknameYueqi',
  'nameShenjiu',
  'nicknameShenjiu',
  'meditateYueqi',
  'meditateShenjiu',
  'petYueqi',
  'petShenjiu',
];

const LOCALES = ['zh', 'en', 'ja'];

test('Key UI text should exist and be a non-empty string for all locales', () => {
  for (const key of KEY_UI_TEXT_KEYS) {
    for (const locale of LOCALES) {
      const dict = DICTIONARY[locale];
      assert.ok(dict, `Dictionary for locale "${locale}" should exist`);
      const text = dict[key];
      assert.strictEqual(
        typeof text,
        'string',
        `Key "${key}" in locale "${locale}" should be a string, but got ${typeof text}`,
      );
      assert.ok(
        text.trim().length > 0,
        `Key "${key}" in locale "${locale}" should not be an empty string`,
      );
    }
  }
});

test('pet interaction menu text aligns across locales for yueqi and shenjiu', () => {
  assert.equal(DICTIONARY.zh.petYueqi, '🤚 天使关怀');
  assert.equal(DICTIONARY.zh.petShenjiu, '🤚 恶魔偏宠');

  assert.equal(DICTIONARY.en.petYueqi, '🤚 Angel\'s Fondness');
  assert.equal(DICTIONARY.en.petShenjiu, '🤚 Crowley\'s Care');

  assert.equal(DICTIONARY.ja.petYueqi, '🤚 天使の慈愛');
  assert.equal(DICTIONARY.ja.petShenjiu, '🤚 悪魔の寵愛');
});

test('Japanese context menu labels are unified as 5-character noun phrases', () => {
  const expected = {
    feed: '🥐 極上の食事',
    meditate: '✨ 奇跡の発動',
    meditateYueqi: '🪴 植物の世話',
    meditateShenjiu: '📖 古書の熟読',
    petYueqi: '🤚 天使の慈愛',
    petShenjiu: '🤚 悪魔の寵愛',
    rest: '💤 静かな休息',
    status: '📊 状態の確認',
  };

  for (const [key, value] of Object.entries(expected)) {
    assert.equal(DICTIONARY.ja[key], value);
    const labelText = DICTIONARY.ja[key].split(' ').slice(1).join(' ');
    assert.equal(
      Array.from(labelText).length,
      5,
      `Expected Japanese menu label "${labelText}" (${key}) to be 5 characters`,
    );
  }
});

test('classic "Let there be light!" dialogue is integrated in cultivate and morning across locales', () => {
  const { I18N } = require('../src/data/i18n.js');
  const dialoguesSource = fs.readFileSync(path.join(ROOT, 'src', 'data', 'dialogues.js'), 'utf8');

  for (const locale of ['zh', 'en']) {
    const cultivatePool = I18N[locale].dialogues.cultivate.yueqi;
    assert.ok(
      cultivatePool.some(line => line.includes('Let there be light!')),
      `I18N.${locale}.dialogues.cultivate.yueqi should include "Let there be light!"`,
    );

    const morningLine = I18N[locale].ui.morningYueqi;
    assert.ok(
      morningLine.includes('Let there be light!'),
      `I18N.${locale}.ui.morningYueqi should include "Let there be light!"`,
    );
  }

  // ja uses pure Japanese "光あれ" without English in parentheses
  const jaCultivatePool = I18N.ja.dialogues.cultivate.yueqi;
  assert.ok(
    jaCultivatePool.some(line => line.includes('「光あれ」')),
    'I18N.ja.dialogues.cultivate.yueqi should include pure "「光あれ」"',
  );
  assert.ok(
    !jaCultivatePool.some(line => line.includes('（Let there be light!）')),
    'I18N.ja.dialogues.cultivate.yueqi should not contain English in parentheses',
  );

  const jaMorningLine = I18N.ja.ui.morningYueqi;
  assert.ok(
    jaMorningLine.includes('「光あれ」'),
    'I18N.ja.ui.morningYueqi should include pure "「光あれ」"',
  );
  assert.ok(
    !jaMorningLine.includes('（Let there be light!）'),
    'I18N.ja.ui.morningYueqi should not contain English in parentheses',
  );

  assert.ok(
    dialoguesSource.includes('Let there be light!'),
    'dialogues.js fallback should include "Let there be light!"',
  );
});

test('classic nightingale dialogues are integrated into hug and linked dream across locales', () => {
  const { I18N } = require('../src/data/i18n.js');
  const dialoguesSource = fs.readFileSync(path.join(ROOT, 'src', 'data', 'dialogues.js'), 'utf8');

  // zh
  assert.ok(I18N.zh.dialogues.hug.yueqi.some(l => l.includes('夜莺')));
  assert.ok(I18N.zh.dialogues.hug.shenjiu.some(l => l.includes('无论过多少个千年')));
  assert.ok(I18N.zh.dialogues.dream.linked.shenjiu.some(l => l.includes('夜莺')));
  assert.ok(I18N.zh.dialogues.dream.linked.yueqi_reply.some(l => l.includes('伯克利广场的夜莺')));

  // en
  assert.ok(I18N.en.dialogues.hug.yueqi.some(l => l.includes('nightingales')));
  assert.ok(I18N.en.dialogues.hug.shenjiu.some(l => l.includes('millennia pass')));
  assert.ok(I18N.en.dialogues.dream.linked.shenjiu.some(l => l.includes('nightingales')));
  assert.ok(I18N.en.dialogues.dream.linked.yueqi_reply.some(l => l.includes('Berkeley Square')));

  // ja
  assert.ok(I18N.ja.dialogues.hug.yueqi.some(l => l.includes('夜鶯')));
  assert.ok(I18N.ja.dialogues.hug.shenjiu.some(l => l.includes('何千年の時')));
  assert.ok(I18N.ja.dialogues.dream.linked.shenjiu.some(l => l.includes('夜鶯')));
  assert.ok(I18N.ja.dialogues.dream.linked.yueqi_reply.some(l => l.includes('バークレー広場の夜鶯')));

  // fallback in dialogues.js
  assert.ok(dialoguesSource.includes('谁说没有夜莺了'));
});

test('classic "Temptation accomplished." exchange is a shareFood pair in every locale and the zh fallback', () => {
  const { I18N } = require('../src/data/i18n.js');
  const vm = require('node:vm');
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'data', 'dialogues.js'), 'utf8'), context);

  const expectedPairs = {
    en: ['Let me tempt you to a spot of lunch, Angel?', 'Temptation accomplished. Don\'t mind if I do, my dear!'],
    zh: ['让我用一顿美餐诱惑你一下如何，天使？', '诱惑成功！那我就不客气地享用啦，亲爱的。'],
    ja: ['極上の食事で誘惑してやろうか、天使？', '誘惑完了、だね！ありがたくいただくとしよう。'],
    zhFallback: ['让我用一顿美餐诱惑你一下如何，天使？', '诱惑成功！那我就不客气地享用啦，亲爱的。'],
  };
  const pools = {
    en: I18N.en.dialogues.shareFood,
    zh: I18N.zh.dialogues.shareFood,
    ja: I18N.ja.dialogues.shareFood,
    zhFallback: context.window.DIALOGUES.shareFood,
  };

  for (const [name, [yueqiLine, shenjiuLine]] of Object.entries(expectedPairs)) {
    const pool = pools[name];
    assert.deepEqual(
      Array.from(pool.pairs, (pair) => ({ ...pair })),
      [{ yueqi: yueqiLine, shenjiu: shenjiuLine }],
      `${name} shareFood.pairs should hold the paired exchange`,
    );
    // 配对台词不得留在单句池，否则会与其他台词随机错配
    assert.equal(pool.yueqi.includes(yueqiLine), false, `${name} yueqi solo pool must not contain the paired line`);
    assert.equal(pool.shenjiu.includes(shenjiuLine), false, `${name} shenjiu solo pool must not contain the paired line`);
  }
});

test('menu effect hints, status tooltips, and low-stat hints exist across locales and lowQi points to plants/reading', () => {
  const { I18N } = require('../src/data/i18n.js');
  const vm = require('node:vm');
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'data', 'dialogues.js'), 'utf8'), context);

  const requiredHintKeys = [
    'menuHintFeed',
    'menuHintMeditate',
    'menuHintPet',
    'menuHintRest',
    'menuHintFeedUrgent',
    'menuHintMeditateUrgent',
    'menuHintRestUrgent',
    'statTipAffectionYueqi',
    'statTipAffectionShenjiu',
    'statTipHunger',
    'statTipQiYueqi',
    'statTipQiShenjiu',
    'statTipMoodYueqi',
    'statTipMoodShenjiu',
  ];

  for (const locale of LOCALES) {
    for (const key of requiredHintKeys) {
      assert.equal(typeof I18N[locale].ui[key], 'string', `${locale}.ui.${key} must be a string`);
      assert.ok(I18N[locale].ui[key].trim().length > 0, `${locale}.ui.${key} must be non-empty`);
    }
  }

  // lowQi lines must explicitly direct players to plant-tending (Crowley) / reading (Aziraphale), never rest/瞑想
  assert.ok(I18N.zh.dialogues.lowQi.yueqi.every(l => /植物|盆栽/.test(l)));
  assert.ok(I18N.zh.dialogues.lowQi.shenjiu.every(l => /研读|读会儿书/.test(l)));
  assert.ok(context.window.DIALOGUES.lowQi.yueqi.every(l => /植物|盆栽/.test(l)));
  assert.ok(context.window.DIALOGUES.lowQi.shenjiu.every(l => /研读|读会儿书/.test(l)));

  assert.ok(I18N.en.dialogues.lowQi.yueqi.every(l => /plant/i.test(l)));
  assert.ok(I18N.en.dialogues.lowQi.shenjiu.every(l => /reading/i.test(l) && !/\brest\b/i.test(l)));

  assert.ok(I18N.ja.dialogues.lowQi.yueqi.every(l => l.includes('植物の世話')));
  assert.ok(I18N.ja.dialogues.lowQi.shenjiu.every(l => l.includes('熟読') && !l.includes('瞑想')));
});

