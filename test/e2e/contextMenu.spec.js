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
});
