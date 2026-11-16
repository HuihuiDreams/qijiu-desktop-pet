'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron');

test.describe('sub-window IPC isolation', () => {
  let electronApp;
  let userDataDir;
  let appWindow;

  test.beforeEach(async () => {
    ({ electronApp, userDataDir } = await launchApp());
    appWindow = await electronApp.firstWindow({ timeout: 20000 });
    await appWindow.waitForLoadState('domcontentloaded', { timeout: 20000 });
  });

  test.afterEach(async () => {
    await closeApp(electronApp, userDataDir);
    electronApp = null;
    userDataDir = null;
    appWindow = null;
  });

  test('status and pomodoro windows expose only their permitted API surface', async () => {
    const [statusWindow] = await Promise.all([
      electronApp.waitForEvent('window', { timeout: 15000 }),
      appWindow.evaluate(() => window.electronAPI.showStatusWindow({ pets: [] })),
    ]);
    await statusWindow.waitForLoadState('domcontentloaded', { timeout: 15000 });

    const statusApi = await statusWindow.evaluate(() => ({
      canResize: typeof window.electronAPI.resizeStatusWindow,
      canSave: typeof window.electronAPI.saveData,
      canSetAutoLaunch: typeof window.electronAPI.setAutoLaunch,
      canSetLocale: typeof window.electronAPI.setLocale,
    }));
    expect(statusApi).toEqual({
      canResize: 'function',
      canSave: 'undefined',
      canSetAutoLaunch: 'undefined',
      canSetLocale: 'undefined',
    });
    const [pomodoroWindow] = await Promise.all([
      electronApp.waitForEvent('window', { timeout: 15000 }),
      appWindow.evaluate(() => window.electronAPI.openPomodoroWindow()),
    ]);
    await pomodoroWindow.waitForLoadState('domcontentloaded', { timeout: 15000 });

    const pomodoroApi = await pomodoroWindow.evaluate(() => ({
      canReadState: typeof window.electronAPI.getPomodoroState,
      canSave: typeof window.electronAPI.saveData,
      canSetAutoLaunch: typeof window.electronAPI.setAutoLaunch,
      canSetSkin: typeof window.electronAPI.setCurrentSkin,
    }));
    expect(pomodoroApi).toEqual({
      canReadState: 'function',
      canSave: 'undefined',
      canSetAutoLaunch: 'undefined',
      canSetSkin: 'undefined',
    });

    const [settingsWindow] = await Promise.all([
      electronApp.waitForEvent('window', { timeout: 15000 }),
      electronApp.evaluate(async ({ app }) => {
        app.openSettingsForQA('companion');
      }),
    ]);
    await settingsWindow.waitForLoadState('domcontentloaded', { timeout: 15000 });

    const settingsApi = await settingsWindow.evaluate(() => ({
      canGetSnapshot: typeof window.electronAPI.getSnapshot,
      canChangeLocale: typeof window.electronAPI.changeSettingsLocale,
      canChangeAutoLaunch: typeof window.electronAPI.changeAutoLaunch,
      canSave: typeof window.electronAPI.saveData,
      canSetAutoLaunch: typeof window.electronAPI.setAutoLaunch,
      canSetLocale: typeof window.electronAPI.setLocale,
      canSetSkin: typeof window.electronAPI.setCurrentSkin,
    }));
    expect(settingsApi).toEqual({
      canGetSnapshot: 'function',
      canChangeLocale: 'function',
      canChangeAutoLaunch: 'function',
      canSave: 'undefined',
      canSetAutoLaunch: 'undefined',
      canSetLocale: 'undefined',
      canSetSkin: 'undefined',
    });
  });
});
