/**
 * dialogues.js — 对话文本入口
 *
 * DIALOGUES 不再直接硬编码，而是由 initDialogues(locale) 从 i18n.js 字典中动态赋值。
 * app.js 在获取 locale 后会调用 initDialogues()，其他模块继续通过 window.DIALOGUES 访问。
 *
 * 兜底策略：若 i18n.js 未加载或 locale 不合法，则回退到简体中文。
 */

/**
 * 根据语言代码从 I18N 字典初始化 DIALOGUES。
 * @param {'zh'|'en'|'ja'} locale
 */
function initDialogues(locale) {
  const dictionaries = typeof I18N !== 'undefined' ? I18N : null;
  const dict = dictionaries?.[locale] ?? dictionaries?.zh;
  window.DIALOGUES = dict ? dict.dialogues : _DIALOGUES_ZH_FALLBACK;
}

/**
 * 中文兜底（万一 i18n.js 未能加载时使用）
 */
const _DIALOGUES_ZH_FALLBACK = {
  greet: {
    yueqi: [
      '小九，你也在这里。',
      '清秋师弟，今日可好？',
      '清秋师弟，许久不见。',
      '小九，要一起走走吗？',
      '清秋师弟，你的气色好了许多。',
    ],
    shenjiu: [
      '岳七。',
      '…嗯。',
      '掌门师兄，别来无恙。',
      '你怎么又来了。',
      '哼，闲人一个。',
    ],
  },
  shareFood: {
    yueqi: ['小九，这个给你吃。', '我不饿，你多吃一些。', '清秋，尝尝这个灵果。'],
    shenjiu: ['…谁要你的东西。', '（默默接过）', '哼…还算能入口。'],
  },
  cultivate: {
    yueqi: ['小九，一起修炼吧。', '双修能事半功倍❤', '我来为你护法。'],
    shenjiu: ['少废话，打坐。', '…别分心。', '（闭目凝神）'],
  },
  kiss: {
    yueqi: ['小九…', '清秋，我很想你。', '让我靠近一点。'],
    shenjiu: ['…岳七，你…！', '（耳尖微红）', '…哼。'],
  },
  hug: {
    yueqi: ['小九，让我抱一下。', '你太瘦了。', '不会再放手了。'],
    shenjiu: ['……', '（没有推开）', '（就像小时候那样）'],
  },
  idle: {
    yueqi: ['小九在哪里呢…', '今日天气不错。', '该去修炼了。', '（整理衣冠）', '苍穹山的风景真好。'],
    shenjiu: ['（翻书）', '…烦。', '如何突破瓶颈？', '（冷冷地看着远方）', '那个人…又没来。'],
  },
  weather_rain: {
    yueqi: ['下雨了，小九当心着凉。', '这雨不知何时能停。'],
    shenjiu: ['…烦人的雨。', '（在屋檐下避雨）'],
  },
  weather_snow: {
    yueqi: ['下雪了，记得添衣。', '雪景虽好，却也寒冷。'],
    shenjiu: ['…有点冷。', '（微微缩手）'],
  },
  weather_clear: {
    yueqi: ['今日阳光真好，最适合修炼。', '天朗气清。'],
    shenjiu: ['阳光刺眼…', '这天倒是不错。'],
  },
  weather_cloudy: {
    yueqi: ['今天云朵挺多的。', '云来云往，倒也有趣。'],
    shenjiu: ['多云…还算凉快。', '（抬头看了看天）'],
  },
  weather_overcast: {
    yueqi: ['天色阴沉，似乎要变天了。', '起风了。'],
    shenjiu: ['阴天…让人提不起劲。', '（天气阴沉沉的）'],
  },
  weather_windy: {
    yueqi: ['风有些大，小九别站在风口。', '山风急了，衣袂都乱了。'],
    shenjiu: ['…风吵得人心烦。', '（拢了拢衣袖）'],
  },
  weather_thunderstorm: {
    yueqi: ['雷声近了，小九别怕。', '这场雷雨来得急，先避一避。'],
    shenjiu: ['…打雷而已，有什么好怕。', '（被雷光照得皱了皱眉）'],
  },
  weather_heat: {
    yueqi: ['天热日烈，小九当心暑气。', '这般酷热，先来阴凉处歇歇吧。', '天气炎热，记得多进些茶水。'],
    shenjiu: ['…热得让人心烦。', '（轻摇折扇，微微蹙眉）', '日头这么毒…没事别叫我。'],
  },
  hungry: {
    yueqi: ['有些饿了…', '该用膳了。'],
    shenjiu: ['…肚子叫了。', '辟谷也该有个限度。'],
  },
  lowQi: {
    yueqi: ['灵力快见底了。', '需要打坐恢复。'],
    shenjiu: ['灵力不足…', '该修炼了。'],
  },
  lowMood: {
    yueqi: ['心境不稳…', '有些心烦。'],
    shenjiu: ['…别烦我。', '（面无表情）'],
  },
  effects: {
    greet: '💬',
    shareFood: '🍎',
    cultivate: '✨',
    kiss: '💋',
    hug: '💕',
  },
  breakReminder: {
    yueqi: [
      '起来走走吧，你已经坐很久了。',
      '修行也要注意体魄。',
      '来，休息一下，起身走走。',
      '坚持修炼是好事，但也要活动筋骨。',
      '站起来伸展一下吧。',
    ],
    shenjiu: [
      '…别死坐着了，起来活动活动。',
      '（站起来）你也起来。',
      '身体是修炼的根基，别赖着不动。',
      '…哼，我只是顺便提醒你一下。',
      '久坐伤身，不想修练也得走两步。',
    ],
  },
  screensaverCaught: {
    yueqi: ['好羞…😳', '咳咳…', '嘿嘿😳'],
    shenjiu: ['被发现了❗️', '…啧。', '…你怎么总挑这时候回来。'],
  },
};

// 默认先使用中文兜底，等 app.js 调用 initDialogues(locale) 后会被覆盖
window.DIALOGUES = _DIALOGUES_ZH_FALLBACK;
