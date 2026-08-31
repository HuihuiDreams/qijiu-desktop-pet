'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron');

test.describe('skin selector', () => {
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

  test('skin selector window opens with at least 4 skin cards', async () => {
    const [selectorWindow] = await Promise.all([
      electronApp.waitForEvent('window', { timeout: 15000 }),
      electronApp.evaluate(async ({ app }) => {
        app.openSkinSelectorForQA();
      }),
    ]);

    await selectorWindow.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await selectorWindow.waitForTimeout(300);

    const cardCount = await selectorWindow.evaluate(
      () => document.querySelectorAll('.skin-card').length,
    );
    expect(cardCount).toBeGreaterThanOrEqual(4);
  });

  test('skin selector preload API is available', async () => {
    const [selectorWindow] = await Promise.all([
      electronApp.waitForEvent('window', { timeout: 15000 }),
      electronApp.evaluate(async ({ app }) => {
        app.openSkinSelectorForQA();
      }),
    ]);

    await selectorWindow.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await selectorWindow.waitForTimeout(300);

    const hasSelectorApi = await selectorWindow.evaluate(
      () => Boolean(window.skinSelectorAPI),
    );
    expect(hasSelectorApi).toBe(true);
  });

  test('exactly one skin card is marked as current on open', async () => {
    const [selectorWindow] = await Promise.all([
      electronApp.waitForEvent('window', { timeout: 15000 }),
      electronApp.evaluate(async ({ app }) => {
        app.openSkinSelectorForQA();
      }),
    ]);

    await selectorWindow.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await selectorWindow.waitForTimeout(300);

    const currentCardCount = await selectorWindow.evaluate(
      () => document.querySelectorAll('.skin-card[aria-pressed="true"]').length,
    );
    expect(currentCardCount).toBe(1);
  });

  test('clicking a different skin card previews it (aria-pressed moves)', async () => {
    const [selectorWindow] = await Promise.all([
      electronApp.waitForEvent('window', { timeout: 15000 }),
      electronApp.evaluate(async ({ app }) => {
        app.openSkinSelectorForQA();
      }),
    ]);

    await selectorWindow.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await selectorWindow.waitForTimeout(300);

    // Get the ID of the current skin card
    const currentSkinId = await selectorWindow.evaluate(() => {
      const current = document.querySelector('.skin-card[aria-pressed="true"]');
      return current ? current.dataset.skinId : null;
    });
    expect(currentSkinId).not.toBeNull();

    // Click the first card that is NOT the current skin
    const targetSkinId = await selectorWindow.evaluate((cId) => {
      const other = [...document.querySelectorAll('.skin-card')].find(
        (c) => c.dataset.skinId !== cId,
      );
      if (other) { other.click(); return other.dataset.skinId; }
      return null;
    }, currentSkinId);

    // If there's only one skin (unlikely), skip the interaction assertion
    if (targetSkinId === null) {
      test.skip();
      return;
    }

    await selectorWindow.waitForTimeout(300);

    const pressedId = await selectorWindow.evaluate(
      () => document.querySelector('.skin-card[aria-pressed="true"]')?.dataset.skinId ?? null,
    );
    expect(pressedId).toBe(targetSkinId);
  });

  test('clicking cancel closes the selector window', async () => {
    const [selectorWindow] = await Promise.all([
      electronApp.waitForEvent('window', { timeout: 15000 }),
      electronApp.evaluate(async ({ app }) => {
        app.openSkinSelectorForQA();
      }),
    ]);

    await selectorWindow.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await selectorWindow.waitForTimeout(300);

    const windowClosedPromise = selectorWindow.waitForEvent('close', { timeout: 10000 });
    await selectorWindow.evaluate(() => {
      const btn = document.querySelector('[data-action="cancel"], .cancel-btn, #cancel-btn, button[class*="cancel"]');
      if (btn) btn.click();
      else window.skinSelectorAPI.cancelSkin();
    });

    await windowClosedPromise;
    expect(selectorWindow.isClosed()).toBe(true);
  });
});
