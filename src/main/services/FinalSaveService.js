/**
 * src/main/services/FinalSaveService.js
 * 退出前最终保存协议：向渲染进程请求最后一次状态保存，等待其 ack 或超时，
 * 再放行主窗口真正关闭，降低异常退出造成的数据丢失。
 */
const { ipcMain } = require('electron');

let allowMainWindowClose = false;
let finalSaveInProgress = false;
let finalSaveRequestId = 0;
const FINAL_SAVE_TIMEOUT_MS = 2500;

function requestRendererFinalSave(win) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const requestId = ++finalSaveRequestId;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      ipcMain.removeListener('save-before-quit-complete', handleComplete);
    };

    const settle = (success) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Boolean(success));
    };

    const handleComplete = (event, completedRequestId, success) => {
      if (event.sender !== win.webContents || completedRequestId !== requestId) return;
      settle(success);
    };

    const timeout = setTimeout(() => {
      console.warn('Timed out waiting for renderer final save.');
      settle(false);
    }, FINAL_SAVE_TIMEOUT_MS);

    ipcMain.on('save-before-quit-complete', handleComplete);
    win.webContents.send('save-before-quit', requestId);
  });
}

function installFinalSaveBeforeClose(win) {
  win.on('close', (event) => {
    if (allowMainWindowClose) return;

    event.preventDefault();
    if (finalSaveInProgress) return;

    finalSaveInProgress = true;
    requestRendererFinalSave(win).finally(() => {
      allowMainWindowClose = true;
      finalSaveInProgress = false;
      if (!win.isDestroyed()) {
        win.close();
      }
    });
  });
}

module.exports = {
  requestRendererFinalSave,
  installFinalSaveBeforeClose,
};
