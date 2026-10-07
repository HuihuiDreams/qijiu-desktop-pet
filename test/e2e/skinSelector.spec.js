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

  test('reopening an active preview keeps the highlighted card and confirms that skin', async () => {
    await appWindow.waitForFunction(() => Boolean(window.__DEBUG_SKIN_MANAGER));
    const [selectorWindow] = await Promise.all([
      electronApp.waitForEvent('window', { timeout: 15000 }),
      electronApp.evaluate(({ app }) => app.openSkinSelectorForQA()),
    ]);
    const birdsCard = selectorWindow.locator('.skin-card[data-skin-id="birds"]');
    await birdsCard.click();
    await expect(birdsCard).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => appWindow.evaluate(() => window.__DEBUG_SKIN_MANAGER.getCurrentSkin())).toBe('birds');
    const savedBefore = await appWindow.evaluate(() => window.electronAPI.loadData('petState'));
    expect(savedBefore?.skinId ?? 'default').toBe('default');

    await electronApp.evaluate(({ app }) => app.openSkinSelectorForQA());
    await expect(birdsCard).toHaveAttribute('aria-pressed', 'true');
    const closed = selectorWindow.waitForEvent('close');
    await selectorWindow.locator('#skin-selector-confirm').click();
    await closed;
    await expect.poll(() => appWindow.evaluate(async () => (await window.electronAPI.loadData('petState'))?.skinId)).toBe('birds');
  });

  test('required image failure shows a confirmation error and keeps the original saved skin', async () => {
    await appWindow.waitForFunction(() => Boolean(window.__DEBUG_SKIN_MANAGER));
    const [selectorWindow] = await Promise.all([
      electronApp.waitForEvent('window', { timeout: 15000 }),
      electronApp.evaluate(({ app }) => app.openSkinSelectorForQA()),
    ]);
    await appWindow.evaluate(() => {
      window.__qaOriginalImage = window.Image;
      window.Image = class {
        set src(value) { queueMicrotask(() => this.onerror?.(new Event('error'))); }
      };
    });
    const birdsCard = selectorWindow.locator('.skin-card[data-skin-id="birds"]');
    await birdsCard.click();
    await expect(birdsCard).toHaveAttribute('aria-pressed', 'true');
    await selectorWindow.locator('#skin-selector-confirm').click();
    await expect(selectorWindow.locator('#skin-selector-status')).not.toHaveText('');
    expect(selectorWindow.isClosed()).toBe(false);
    const saved = await appWindow.evaluate(() => window.electronAPI.loadData('petState'));
    expect(saved?.skinId ?? 'default').toBe('default');

    await appWindow.evaluate(() => {
      window.Image = window.__qaOriginalImage;
      delete window.__qaOriginalImage;
    });
    const closed = selectorWindow.waitForEvent('close');
    await selectorWindow.locator('#skin-selector-cancel').click();
    await closed;
    await expect.poll(() => appWindow.evaluate(() => window.__DEBUG_SKIN_MANAGER.getCurrentSkin())).toBe('default');
  });

  test('another working window and the native tray popup keep the preview session open', async () => {
    await appWindow.waitForFunction(() => Boolean(window.__DEBUG_SKIN_MANAGER));
    const [selectorWindow] = await Promise.all([
      electronApp.waitForEvent('window'),
      electronApp.evaluate(({ app }) => app.openSkinSelectorForQA()),
    ]);
    const birdsCard = selectorWindow.locator('.skin-card[data-skin-id="birds"]');
    await birdsCard.click();
    await expect(birdsCard).toHaveAttribute('aria-pressed', 'true');

    await electronApp.evaluate(async ({ app, BrowserWindow }) => {
      const workingWindow = new BrowserWindow({
        width: 360, height: 160, x: 30, y: 30, title: 'DeskPet QA working window',
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      app.__qaWorkingWindow = workingWindow;
      await workingWindow.loadURL('about:blank');
      workingWindow.focus();
    });
    await expect.poll(() => electronApp.evaluate(({ app }) => app.__qaWorkingWindow.isFocused())).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 1300));
    expect(selectorWindow.isClosed()).toBe(false);
    await expect(birdsCard).toHaveAttribute('aria-pressed', 'true');

    await electronApp.evaluate(({ app }) => {
      // The overflow panel also removes focus without a DeskPet tray event.
      app.__qaWorkingWindow.blur();
      process.mainModule.require('./src/main/TrayManager').getTray().popUpContextMenu();
    });
    await new Promise(resolve => setTimeout(resolve, 1300));
    expect(selectorWindow.isClosed()).toBe(false);

    await electronApp.evaluate(({ app }) => {
      process.mainModule.require('./src/main/TrayManager').getTray().closeContextMenu();
      app.__qaWorkingWindow.close();
      delete app.__qaWorkingWindow;
      app.openSkinSelectorForQA();
      process.mainModule.require('./src/main/windows/WindowManager').skinSelectorWindow.minimize();
    });
    await expect.poll(() => electronApp.evaluate(() => process.mainModule.require('./src/main/windows/WindowManager').skinSelectorWindow.isMinimized())).toBe(true);
    expect(selectorWindow.isClosed()).toBe(false);
    await electronApp.evaluate(({ app }) => app.openSkinSelectorForQA());
    await expect.poll(() => electronApp.evaluate(() => process.mainModule.require('./src/main/windows/WindowManager').skinSelectorWindow.isMinimized())).toBe(false);
    await expect(birdsCard).toHaveAttribute('aria-pressed', 'true');

    const closed = selectorWindow.waitForEvent('close');
    await selectorWindow.locator('#skin-selector-cancel').click();
    await closed;
    await expect.poll(() => appWindow.evaluate(() => window.__DEBUG_SKIN_MANAGER.getCurrentSkin())).toBe('default');
    const saved = await appWindow.evaluate(() => window.electronAPI.loadData('petState'));
    expect(saved?.skinId ?? 'default').toBe('default');
  });

  test('closing the native selector window cancels its preview', async () => {
    await appWindow.waitForFunction(() => Boolean(window.__DEBUG_SKIN_MANAGER));
    const [selectorWindow] = await Promise.all([
      electronApp.waitForEvent('window'),
      electronApp.evaluate(({ app }) => app.openSkinSelectorForQA()),
    ]);
    const birdsCard = selectorWindow.locator('.skin-card[data-skin-id="birds"]');
    await birdsCard.click();
    await expect(birdsCard).toHaveAttribute('aria-pressed', 'true');

    const closed = selectorWindow.waitForEvent('close');
    await electronApp.evaluate(() => process.mainModule.require('./src/main/windows/WindowManager').skinSelectorWindow.close());
    await closed;
    await expect.poll(() => appWindow.evaluate(() => window.__DEBUG_SKIN_MANAGER.getCurrentSkin())).toBe('default');
    expect(await electronApp.evaluate(() => process.mainModule.require('./src/main/services/SkinService').getPreviewSkinId())).toBeNull();
    const saved = await appWindow.evaluate(() => window.electronAPI.loadData('petState'));
    expect(saved?.skinId ?? 'default').toBe('default');
  });
});
