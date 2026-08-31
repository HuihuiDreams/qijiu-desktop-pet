'use strict';

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { launchApp, closeApp } = require('./helpers/electron');

test.describe('startup', () => {
  let electronApp;
  let userDataDir;

  test.beforeEach(async () => {
    ({ electronApp, userDataDir } = await launchApp());
  });

  test.afterEach(async () => {
    await closeApp(electronApp, userDataDir);
    electronApp = null;
    userDataDir = null;
  });

  test('main window has correct title', async () => {
    const appWindow = await electronApp.firstWindow({ timeout: 20000 });
    await appWindow.waitForLoadState('domcontentloaded', { timeout: 20000 });
    const title = await appWindow.title();
    expect(title).toBe('岳七 & 沈九 桌面宠物');
  });

  test('renderer reaches ready state', async () => {
    const appWindow = await electronApp.firstWindow({ timeout: 20000 });
    await appWindow.waitForLoadState('domcontentloaded', { timeout: 20000 });
    const readyState = await appWindow.evaluate(() => document.readyState);
    expect(['complete', 'interactive']).toContain(readyState);
  });

  test('pet stage element exists in DOM', async () => {
    const appWindow = await electronApp.firstWindow({ timeout: 20000 });
    await appWindow.waitForLoadState('domcontentloaded', { timeout: 20000 });
    // Wait for the game loop to attach pet elements (~500ms after load)
    await appWindow.waitForTimeout(800);
    const petStageExists = await appWindow.evaluate(
      () => document.getElementById('pet-stage') !== null,
    );
    expect(petStageExists).toBe(true);
  });

  test('userData is isolated to the temp directory', async () => {
    const appUserDataDir = await electronApp.evaluate(({ app }) => app.getPath('userData'));
    expect(path.resolve(appUserDataDir)).toBe(path.resolve(userDataDir));
  });

  test('no unhandled JS errors on startup', async () => {
    const errors = [];
    const appWindow = await electronApp.firstWindow({ timeout: 20000 });
    appWindow.on('pageerror', (err) => errors.push(err.message));
    await appWindow.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await appWindow.waitForTimeout(1000);
    expect(errors).toEqual([]);
  });
});
