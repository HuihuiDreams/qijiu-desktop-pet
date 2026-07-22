const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('path');

test('Check computed font family in Japanese', async () => {
  const electronApp = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, NODE_ENV: 'development' }
  });

  const window = await electronApp.firstWindow();
  
  // Wait for the app to be ready
  await window.waitForLoadState('domcontentloaded');
  
  // Switch to Japanese
  await window.evaluate(() => {
    window.electronAPI.setSetting('language', 'ja');
    // Force apply
    window.__currentLocale = 'ja';
    document.documentElement.lang = 'ja';
    if (window.I18nHelpers) window.I18nHelpers.applyI18n();
  });
  
  // Give it a moment to apply CSS
  await window.waitForTimeout(500);
  
  // Check the font of the title or a dialog bubble
  const computedFont = await window.evaluate(() => {
    return getComputedStyle(document.body).fontFamily;
  });
  
  console.log('COMPUTED FONT (BODY):', computedFont);
  
  // Try to find a dialog bubble or similar that uses var(--font-display)
  const rootFontDisplay = await window.evaluate(() => {
    return getComputedStyle(document.documentElement).getPropertyValue('--font-display');
  });
  
  console.log('ROOT --font-display:', rootFontDisplay);
  
  const langAttr = await window.evaluate(() => document.documentElement.lang);
  console.log('HTML lang attribute:', langAttr);

  await electronApp.close();
});
