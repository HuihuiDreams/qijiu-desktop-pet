/**
 * Shared i18n boilerplate for sub-windows.
 */
const WindowI18n = {
  currentLocale: "zh",
  
  init(onCustomLocaleChange) {
    window.t = (key) => {
      if (typeof I18N === "undefined") return key;
      return (I18N[WindowI18n.currentLocale]?.ui?.[key]) ?? (I18N.zh?.ui?.[key]) ?? key;
    };

    window.updateI18nElements = () => {
      document.querySelectorAll("[data-i18n]").forEach((element) => {
        element.textContent = window.t(element.dataset.i18n);
      });
      document.querySelectorAll("[data-i18n-title]").forEach((element) => {
        const translated = window.t(element.dataset.i18nTitle);
        element.title = translated;
        element.setAttribute("aria-label", translated);
      });
      document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
        element.setAttribute("aria-label", window.t(element.dataset.i18nAriaLabel));
      });
      document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
        element.setAttribute("placeholder", window.t(element.dataset.i18nPlaceholder));
      });
    };

    const handleLocaleChange = (locale) => {
      WindowI18n.currentLocale = locale;
      document.documentElement.lang = locale;
      document.documentElement.setAttribute("data-locale", locale);
      window.updateI18nElements();
      if (onCustomLocaleChange) onCustomLocaleChange(locale);
    };

    if (window.electronAPI) {
      if (window.electronAPI.getLocale) {
        window.electronAPI.getLocale().then(handleLocaleChange);
      }
      if (window.electronAPI.onLocaleChange) {
        window.electronAPI.onLocaleChange(handleLocaleChange);
      }
    }
  }
};
