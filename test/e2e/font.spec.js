const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron');

test('Japanese locale applies the bundled display and body fonts', async () => {
  let electronApp;
  let userDataDir;

  try {
    ({ electronApp, userDataDir } = await launchApp());
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const localeUpdate = await window.evaluate(async () => {
      let unsubscribe = () => {};
      const localeChanged = new Promise((resolve) => {
        unsubscribe = window.electronAPI.onLocaleChange((locale) => {
          if (locale === 'ja') resolve(locale);
        });
      });
      const result = await window.electronAPI.setLocale('ja');
      if (!result?.success) {
        unsubscribe();
        return { result, changedLocale: null };
      }
      const changedLocale = await localeChanged;
      unsubscribe();
      return { result, changedLocale };
    });

    expect(localeUpdate.result).toEqual({ success: true, locale: 'ja' });
    expect(localeUpdate.changedLocale).toBe('ja');
    await expect.poll(
      () => window.evaluate(() => document.documentElement.lang),
      { message: 'locale-changed should update the document language' },
    ).toBe('ja');

    const fonts = await window.evaluate(() => {
      const rootStyle = getComputedStyle(document.documentElement);
      return {
        display: rootStyle.getPropertyValue('--font-display'),
        body: getComputedStyle(document.body).fontFamily,
      };
    });

    expect(fonts.display).toContain('Yuji Syuku');
    expect(fonts.body).toContain('Shippori Mincho');

    // Test English locale
    const enUpdate = await window.evaluate(async () => {
      let unsubscribe = () => {};
      const localeChanged = new Promise((resolve) => {
        unsubscribe = window.electronAPI.onLocaleChange((locale) => {
          if (locale === 'en') resolve(locale);
        });
      });
      const result = await window.electronAPI.setLocale('en');
      if (!result?.success) {
        unsubscribe();
        return { result, changedLocale: null };
      }
      const changedLocale = await localeChanged;
      unsubscribe();
      return { result, changedLocale };
    });
    expect(enUpdate.result).toEqual({ success: true, locale: 'en' });
    expect(enUpdate.changedLocale).toBe('en');
    await expect.poll(
      () => window.evaluate(() => document.documentElement.lang),
      { message: 'locale-changed should update document lang to en' }
    ).toBe('en');

    const enFonts = await window.evaluate(() => {
      const rootStyle = getComputedStyle(document.documentElement);
      return {
        display: rootStyle.getPropertyValue('--font-display'),
        body: getComputedStyle(document.body).fontFamily,
      };
    });
    expect(enFonts.display).toContain('Cinzel');
    expect(enFonts.body).toContain('EB Garamond');

    // Test Chinese locale
    const zhUpdate = await window.evaluate(async () => {
      let unsubscribe = () => {};
      const localeChanged = new Promise((resolve) => {
        unsubscribe = window.electronAPI.onLocaleChange((locale) => {
          if (locale === 'zh') resolve(locale);
        });
      });
      const result = await window.electronAPI.setLocale('zh');
      if (!result?.success) {
        unsubscribe();
        return { result, changedLocale: null };
      }
      const changedLocale = await localeChanged;
      unsubscribe();
      return { result, changedLocale };
    });
    expect(zhUpdate.result).toEqual({ success: true, locale: 'zh' });
    expect(zhUpdate.changedLocale).toBe('zh');
    await expect.poll(
      () => window.evaluate(() => document.documentElement.lang),
      { message: 'locale-changed should update document lang to zh' }
    ).toBe('zh');

    const zhFonts = await window.evaluate(() => {
      const rootStyle = getComputedStyle(document.documentElement);
      return {
        display: rootStyle.getPropertyValue('--font-display'),
        body: getComputedStyle(document.body).fontFamily,
      };
    });
    expect(zhFonts.display).toContain('Ma Shan Zheng');
  } finally {
    await closeApp(electronApp, userDataDir);
  }
});
