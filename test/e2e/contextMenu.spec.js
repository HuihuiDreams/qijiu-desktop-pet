'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron');

test.describe('context menu', () => {
  let electronApp;
  let userDataDir;
  let appWindow;

  test.beforeEach(async () => {
    ({ electronApp, userDataDir } = await launchApp());
    appWindow = await electronApp.firstWindow({ timeout: 20000 });
    await appWindow.waitForLoadState('domcontentloaded', { timeout: 20000 });
    // Wait for pets and the game loop to initialize
    await appWindow.waitForTimeout(1000);
  });

  test.afterEach(async () => {
    await closeApp(electronApp, userDataDir);
    electronApp = null;
    userDataDir = null;
    appWindow = null;
  });

  test('context menu element exists in DOM and is initially hidden', async () => {
    const isHidden = await appWindow.evaluate(() => {
      const menu = document.getElementById('context-menu');
      return menu !== null && menu.classList.contains('hidden');
    });
    expect(isHidden).toBe(true);
  });

  test('right-clicking a pet shows the context menu', async () => {
    // Trigger contextmenu on a .pet element directly.
    // The listener in app.js is bound to pet.element (div.pet), not the stage,
    // so we must dispatch on the .pet child — events bubble up, not down.
    await appWindow.evaluate(() => {
      const petEl = document.querySelector('#pet-stage .pet');
      if (!petEl) return; // pets may not have rendered yet
      const rect = petEl.getBoundingClientRect();
      petEl.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }));
    });

    await appWindow.waitForTimeout(300);

    const isVisible = await appWindow.evaluate(() => {
      const menu = document.getElementById('context-menu');
      return menu !== null && !menu.classList.contains('hidden');
    });
    expect(isVisible).toBe(true);
  });


  test('context menu contains expected action items', async () => {
    await appWindow.evaluate(() => {
      const petEl = document.querySelector('#pet-stage .pet');
      if (!petEl) return;
      const rect = petEl.getBoundingClientRect();
      petEl.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }));
    });

    await appWindow.waitForTimeout(300);

    const actions = await appWindow.evaluate(() =>
      [...document.querySelectorAll('#context-menu .menu-item')].map(
        (el) => el.dataset.action,
      ),
    );
    // Core actions defined in index.html
    expect(actions).toContain('feed');
    expect(actions).toContain('pet');
  });

  test('context menu low-qi hint, hidden healthy hints, and status window tooltips fit without overflow across zh/en/ja', async () => {
    const expectedByLocale = {
      zh: {
        meditateYueqi: '🪴 照料植物',
        meditateShenjiu: '📖 静心研读',
        hintUrgent: '奇迹能量偏低',
        tipYueqiNeedle: '照料植物',
        tipShenjiuNeedle: '静心研读',
      },
      en: {
        meditateYueqi: '🪴 Tending Plants',
        meditateShenjiu: '📖 Reading',
        hintUrgent: 'Low Miracle Energy',
        tipYueqiNeedle: 'Tending Plants',
        tipShenjiuNeedle: 'Reading',
      },
      ja: {
        meditateYueqi: '🪴 植物の世話',
        meditateShenjiu: '📖 古書の熟読',
        hintUrgent: '奇跡の力が低め',
        tipYueqiNeedle: '植物の世話',
        tipShenjiuNeedle: '古書の熟読',
      },
    };

    // Put Crowley into low-qi state while keeping Aziraphale healthy
    await appWindow.evaluate(() => {
      const { yueqi, shenjiu } = window.__DEBUG_PETS;
      yueqi.stats.hunger = 80;
      yueqi.stats.qi = 12;
      yueqi.stats.mood = 80;
      shenjiu.stats.hunger = 80;
      shenjiu.stats.qi = 80;
      shenjiu.stats.mood = 80;
    });

    // Open status window once via context menu action="status"
    await appWindow.evaluate(() => {
      const petEl = document.getElementById('pet-yueqi');
      const rect = petEl.getBoundingClientRect();
      petEl.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }));
    });
    await appWindow.waitForTimeout(200);

    const [statusWindow] = await Promise.all([
      electronApp.waitForEvent('window', { timeout: 15000 }),
      appWindow.evaluate(() => {
        document.querySelector('#context-menu .menu-item[data-action="status"]').click();
      }),
    ]);
    await statusWindow.waitForLoadState('load', { timeout: 15000 });
    await statusWindow.waitForTimeout(300);

    for (const locale of ['zh', 'en', 'ja']) {
      const expected = expectedByLocale[locale];
      await electronApp.evaluate(async (_, lang) => {
        await process.mainModule.require('./src/main/services/LocaleService').changeLocale(lang);
      }, locale);

      await expect.poll(
        () => appWindow.evaluate(() => document.documentElement.dataset.locale || document.documentElement.lang),
        { message: `main window locale should become ${locale}` },
      ).toBe(locale);
      await expect.poll(
        () => statusWindow.evaluate(() => document.documentElement.dataset.locale || document.documentElement.lang),
        { message: `status window locale should become ${locale}` },
      ).toBe(locale);
      await statusWindow.waitForTimeout(200);

      // 1. Check Crowley low-qi context menu
      await appWindow.evaluate(() => {
        const petEl = document.getElementById('pet-yueqi');
        const rect = petEl.getBoundingClientRect();
        petEl.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }));
      });
      await appWindow.waitForTimeout(150);

      const yueqiMenu = await appWindow.evaluate(() => {
        const menu = document.getElementById('context-menu');
        const med = menu.querySelector('.menu-item[data-action="meditate"]');
        const label = med.querySelector('.menu-item-label');
        const hint = med.querySelector('.menu-item-hint');
        const itemsOverflow = [...menu.querySelectorAll('.menu-item')].some(
          (el) => el.scrollWidth > el.clientWidth + 1,
        );
        return {
          labelText: label?.textContent,
          hintText: hint?.textContent,
          urgent: med.getAttribute('data-urgent'),
          menuOverflowX: menu.scrollWidth > menu.clientWidth + 1,
          itemsOverflow,
        };
      });
      expect(yueqiMenu.labelText).toBe(expected.meditateYueqi);
      expect(yueqiMenu.hintText).toBe(expected.hintUrgent);
      expect(yueqiMenu.urgent).toBe('true');
      expect(yueqiMenu.menuOverflowX).toBe(false);
      expect(yueqiMenu.itemsOverflow).toBe(false);

      // 2. Check Aziraphale healthy context menu
      await appWindow.evaluate(() => {
        const petEl = document.getElementById('pet-shenjiu');
        const rect = petEl.getBoundingClientRect();
        petEl.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }));
      });
      await appWindow.waitForTimeout(150);

      const shenjiuMenu = await appWindow.evaluate(() => {
        const menu = document.getElementById('context-menu');
        const med = menu.querySelector('.menu-item[data-action="meditate"]');
        return {
          labelText: med.querySelector('.menu-item-label')?.textContent,
          hintText: med.querySelector('.menu-item-hint')?.textContent,
          hintHidden: med.querySelector('.menu-item-hint')?.hidden,
          urgent: med.getAttribute('data-urgent'),
          menuOverflowX: menu.scrollWidth > menu.clientWidth + 1,
        };
      });
      expect(shenjiuMenu.labelText).toBe(expected.meditateShenjiu);
      expect(shenjiuMenu.hintText).toBe('');
      expect(shenjiuMenu.hintHidden).toBe(true);
      expect(shenjiuMenu.urgent).toBeNull();
      expect(shenjiuMenu.menuOverflowX).toBe(false);

      // Dismiss context menu
      await appWindow.keyboard.press('Escape');

      // 3. Check StatusWindow icons, low-qi row flag, absence of inline hints, no overflow, and tooltip bounds
      const statusCheck = await statusWindow.evaluate(() => {
        const panel = document.querySelector('.status-panel');
        const yueqiBlock = document.querySelector('.pet-status-block--yueqi');
        const shenjiuBlock = document.querySelector('.pet-status-block--shenjiu');
        const yueqiQiRow = yueqiBlock.querySelector('.stat-row[data-stat="qi"]');
        const shenjiuQiRow = shenjiuBlock.querySelector('.stat-row[data-stat="qi"]');
        const qiLabel = document.getElementById('stat-label-yueqi-qi');
        const moodLabel = document.getElementById('stat-label-yueqi-mood');
        return {
          qiLabelText: qiLabel?.textContent || '',
          moodLabelText: moodLabel?.textContent || '',
          hasInlineHints: Boolean(document.querySelector('.pet-status-hints')),
          yueqiQiLow: yueqiQiRow?.getAttribute('data-low'),
          shenjiuQiLow: shenjiuQiRow?.getAttribute('data-low'),
          panelHeight: panel.scrollHeight,
          docOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
          docOverflowY: document.documentElement.scrollHeight > window.innerHeight + 1,
          panelOverflowX: panel.scrollWidth > panel.clientWidth + 1,
          panelOverflowY: panel.scrollHeight > panel.clientHeight + 1,
        };
      });
      expect(statusCheck.qiLabelText.startsWith('✨ ')).toBe(true);
      expect(statusCheck.moodLabelText.startsWith('☕ ')).toBe(true);
      expect(statusCheck.hasInlineHints).toBe(false);
      expect(statusCheck.yueqiQiLow).toBe('true');
      expect(statusCheck.shenjiuQiLow).toBeNull();
      expect(statusCheck.docOverflowX).toBe(false);
      expect(statusCheck.docOverflowY).toBe(false);
      expect(statusCheck.panelOverflowX).toBe(false);
      expect(statusCheck.panelOverflowY).toBe(false);

      // Focus Crowley's qi row and Aziraphale's bottom mood/qi rows to verify #status-tooltip stays inside viewport
      for (const [petId, statKey, needle] of [
        ['yueqi', 'qi', expected.tipYueqiNeedle],
        ['shenjiu', 'qi', expected.tipShenjiuNeedle],
        ['shenjiu', 'mood', ''],
      ]) {
        await statusWindow.locator(`.pet-status-block--${petId} .stat-row[data-stat="${statKey}"]`).focus();
        await statusWindow.waitForTimeout(100);
        const tipBounds = await statusWindow.evaluate(() => {
          const tip = document.getElementById('status-tooltip');
          const r = tip.getBoundingClientRect();
          return {
            open: tip.matches(':popover-open'),
            text: tip.textContent,
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
            vw: window.innerWidth,
            vh: window.innerHeight,
          };
        });
        expect(tipBounds.open).toBe(true);
        if (needle) {
          expect(tipBounds.text).toContain(needle);
        }
        expect(tipBounds.left).toBeGreaterThanOrEqual(0);
        expect(tipBounds.top).toBeGreaterThanOrEqual(0);
        expect(tipBounds.right).toBeLessThanOrEqual(tipBounds.vw + 1);
        expect(tipBounds.bottom).toBeLessThanOrEqual(tipBounds.vh + 1);
      }

      // First Escape closes tooltip without closing StatusWindow
      await statusWindow.keyboard.press('Escape');
      const tipClosed = await statusWindow.evaluate(
        () => !document.getElementById('status-tooltip').matches(':popover-open'),
      );
      expect(tipClosed).toBe(true);
      expect(statusWindow.isClosed()).toBe(false);
    }

    // Drop ALL low stats across both pets and verify panel height stays compact (unchanged)
    const heightBeforeAllLow = await statusWindow.evaluate(() => document.querySelector('.status-panel').scrollHeight);
    await appWindow.evaluate(() => {
      const { yueqi, shenjiu } = window.__DEBUG_PETS;
      yueqi.stats.hunger = 10;
      yueqi.stats.qi = 12;
      yueqi.stats.mood = 10;
      shenjiu.stats.hunger = 10;
      shenjiu.stats.qi = 12;
      shenjiu.stats.mood = 10;
    });
    await expect.poll(
      () => statusWindow.evaluate(() => document.querySelector('.pet-status-block--shenjiu .stat-row[data-stat="qi"]')?.getAttribute('data-low')),
      { message: 'Aziraphale qi row should mark data-low when low' },
    ).toBe('true');
    const heightAfterAllLow = await statusWindow.evaluate(() => document.querySelector('.status-panel').scrollHeight);
    expect(heightAfterAllLow).toBe(heightBeforeAllLow);

    // Recover Crowley's qi and verify data-low clears cleanly
    await appWindow.evaluate(() => {
      window.__DEBUG_PETS.yueqi.stats.qi = 80;
    });
    await expect.poll(
      () => statusWindow.evaluate(() => document.querySelector('.pet-status-block--yueqi .stat-row[data-stat="qi"]')?.getAttribute('data-low')),
      { message: 'Crowley qi row data-low should clear once qi recovers' },
    ).toBeNull();
  });
});
