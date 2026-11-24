'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron');

test.describe('unified settings window', () => {
  let electronApp;
  let userDataDir;
  let appWindow;

  test.beforeEach(async () => {
    ({ electronApp, userDataDir } = await launchApp());
    appWindow = await electronApp.firstWindow({ timeout: 20000 });
    await appWindow.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await appWindow.waitForTimeout(500);
  });

  test.afterEach(async () => {
    await closeApp(electronApp, userDataDir);
    electronApp = null;
    userDataDir = null;
    appWindow = null;
  });

  test('opens via QA hook, navigates 3 tabs without scroll overflow, and closes on Escape', async () => {
    const [settingsWindow] = await Promise.all([
      electronApp.waitForEvent('window', { timeout: 15000 }),
      electronApp.evaluate(async ({ app }) => {
        app.openSettingsForQA('appearance');
      }),
    ]);
    await settingsWindow.waitForLoadState('load', { timeout: 15000 });
    await settingsWindow.waitForTimeout(250);

    // Focused settings window stays alwaysOnTop (pop-up-menu) past the 180ms pulse so external apps
    // do not cover it while mainWindow remains above it (screen-saver)
    const focusedTopState = await electronApp.evaluate(() => {
      const wm = process.mainModule.require('./src/main/windows/WindowManager');
      return {
        focused: Boolean(wm.settingsWindow?.isFocused?.()),
        alwaysOnTop: Boolean(wm.settingsWindow?.isAlwaysOnTop?.()),
        mainAlwaysOnTop: Boolean(wm.mainWindow?.isAlwaysOnTop?.()),
      };
    });
    expect(focusedTopState.mainAlwaysOnTop).toBe(true);
    if (focusedTopState.focused) {
      expect(focusedTopState.alwaysOnTop).toBe(true);
    }

    // Tab 1 active & zero vertical overflow
    await expect(settingsWindow.locator('#tab-appearance')).toHaveAttribute('aria-selected', 'true');
    const tab1Overflow = await settingsWindow.evaluate(() => {
      const panel = document.getElementById('panel-appearance');
      return panel.scrollHeight > panel.clientHeight;
    });
    expect(tab1Overflow).toBe(false);

    // Computed styles on Appearance controls must reflect Good Omens claret/gold rather than Qijiu jade-green
    const appearanceStyles = await settingsWindow.evaluate(() => {
      const skinBtn = getComputedStyle(document.getElementById('settings-open-skin-button'));
      const switchTrack = getComputedStyle(document.querySelector('#window-awareness-switch .settings-switch-track'));
      const scaleVal = getComputedStyle(document.querySelector('.settings-scale-value'));
      return {
        skinBtnBg: skinBtn.backgroundImage,
        skinBtnBorder: skinBtn.borderColor,
        switchBg: switchTrack.backgroundImage,
        switchBorder: switchTrack.borderColor,
        scaleFont: scaleVal.fontFamily,
      };
    });
    for (const value of [
      appearanceStyles.skinBtnBg,
      appearanceStyles.skinBtnBorder,
      appearanceStyles.switchBg,
      appearanceStyles.switchBorder,
    ]) {
      expect(value).not.toContain('110, 198, 160');
      expect(value).not.toContain('61, 139, 107');
    }
    expect(appearanceStyles.scaleFont).toContain('Cinzel');

    // Keyboard ArrowRight -> Companion tab & zero overflow
    await settingsWindow.locator('#tab-appearance').focus();
    await settingsWindow.keyboard.press('ArrowRight');
    await expect(settingsWindow.locator('#tab-companion')).toHaveAttribute('aria-selected', 'true');
    const tab2Overflow = await settingsWindow.evaluate(() => {
      const panel = document.getElementById('panel-companion');
      return panel.scrollHeight > panel.clientHeight;
    });
    expect(tab2Overflow).toBe(false);

    // Keyboard End -> System tab & zero overflow
    await settingsWindow.keyboard.press('End');
    await expect(settingsWindow.locator('#tab-system')).toHaveAttribute('aria-selected', 'true');
    const tab3Overflow = await settingsWindow.evaluate(() => {
      const panel = document.getElementById('panel-system');
      return panel.scrollHeight > panel.clientHeight;
    });
    expect(tab3Overflow).toBe(false);

    // Verify zero vertical overflow across en and ja locales on every tab as well
    for (const locale of ['en', 'ja']) {
      await settingsWindow.locator('#tab-system').click();
      await settingsWindow.locator(`#locale-buttons button[data-locale="${locale}"]`).click();
      await expect.poll(
        () => settingsWindow.evaluate(() => document.documentElement.dataset.locale || document.documentElement.lang),
        { message: `locale should switch to ${locale}` },
      ).toBe(locale);

      for (const [tabId, panelId] of [
        ['tab-appearance', 'panel-appearance'],
        ['tab-companion', 'panel-companion'],
        ['tab-system', 'panel-system'],
      ]) {
        await settingsWindow.locator(`#${tabId}`).click();
        await expect(settingsWindow.locator(`#${tabId}`)).toHaveAttribute('aria-selected', 'true');
        const hasOverflow = await settingsWindow.evaluate(
          (id) => {
            const panel = document.getElementById(id);
            return panel.scrollHeight > panel.clientHeight;
          },
          panelId,
        );
        expect(hasOverflow, `${locale} ${panelId} should not overflow vertically`).toBe(false);
      }
    }

    // Escape keydown closes the settings window cleanly
    const closedPromise = settingsWindow.waitForEvent('close', { timeout: 10000 });
    await settingsWindow.keyboard.down('Escape');
    await closedPromise;
    expect(settingsWindow.isClosed()).toBe(true);
  });

  test('opening skin selector from settings restores focus to the trigger button on close', async () => {
    const [settingsWindow] = await Promise.all([
      electronApp.waitForEvent('window', { timeout: 15000 }),
      electronApp.evaluate(async ({ app }) => {
        app.openSettingsForQA('appearance');
      }),
    ]);
    await settingsWindow.waitForLoadState('load', { timeout: 15000 });
    await settingsWindow.waitForTimeout(250);

    const [selectorWindow] = await Promise.all([
      electronApp.waitForEvent('window', { timeout: 15000 }),
      settingsWindow.locator('#settings-open-skin-button').click(),
    ]);
    await selectorWindow.waitForLoadState('load', { timeout: 15000 });
    await selectorWindow.waitForTimeout(250);

    const closedPromise = selectorWindow.waitForEvent('close', { timeout: 10000 });
    await selectorWindow.locator('#skin-selector-cancel').click();
    await closedPromise;
    expect(selectorWindow.isClosed()).toBe(true);

    await expect.poll(
      () => settingsWindow.evaluate(() => document.activeElement?.id || null),
      { message: 'closing skin selector launched from settings should restore focus to #settings-open-skin-button' },
    ).toBe('settings-open-skin-button');
  });
});
