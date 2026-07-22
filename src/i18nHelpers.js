/**
 * I18nHelpers — 渲染进程 i18n 纯函数辅助工具。
 *
 * 职责：从全局 `I18N` 字典（由 data/i18n.js 提供）读取当前语言的 UI 文案，
 * 并在缺失时按 locale → zh → key 的顺序回退，同时负责把翻译结果应用到
 * 带有 [data-i18n] 属性的 DOM 元素上。
 *
 * 本文件不持有任何可变状态，可安全地被 app.js 与 node:test 同时引用。
 */
const I18nHelpers = {
  /**
   * 读取全局 I18N 字典。I18N 由 data/i18n.js 以 <script> 标签形式声明为
   * 顶层 const，因此在浏览器环境下作为裸标识符可见；在 Node 环境下（测试）
   * 需要显式在 global 上打桩。
   */
  getI18nDictionaries() {
    return typeof I18N !== 'undefined' ? I18N : null;
  },

  /**
   * 翻译单条 UI 文案，找不到时依次回退到 zh 字典、再回退到 key 本身。
   */
  translateUi(key, locale = window.__currentLocale) {
    const dictionaries = I18nHelpers.getI18nDictionaries();
    return dictionaries?.[locale]?.ui?.[key] ?? dictionaries?.zh?.ui?.[key] ?? key;
  },

  /**
   * 返回目标语言的整份 UI 字典（例如供 DialogBubble 等需要函数类型文案的入口使用）。
   */
  getI18nUi(locale = window.__currentLocale) {
    const dictionaries = I18nHelpers.getI18nDictionaries();
    return dictionaries?.[locale]?.ui ?? dictionaries?.zh?.ui ?? {};
  },

  /**
   * 遍历所有 [data-i18n] 元素，更新 textContent；同时更新 <html lang>。
   * 对于 data-i18n-pet 属性，由 ContextMenu.show() 单独处理。
   */
  applyI18n() {
    if (!window.t) return;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = window.t(el.dataset.i18n);
    });
    const locale = window.__currentLocale || 'zh';
    document.documentElement.lang = locale;
    document.documentElement.setAttribute('data-locale', locale);
  },
};

if (typeof module !== 'undefined') {
  module.exports = { I18nHelpers };
}
