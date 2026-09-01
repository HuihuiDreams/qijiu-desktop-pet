/**
 * 验证 IPC 事件的发件方是否为指定主窗口的 webContents。
 * 用于实现安全边界，确保敏感 IPC 只能由受信任的主透明窗口调用。
 *
 * @param {Object} event Electron IPC 事件对象
 * @param {BrowserWindow} mainWindow 期望的发件方窗口
 * @returns {boolean} 是否授权
 */
function isSenderWindow(event, targetWindow) {
  if (!event || !event.sender) {
    return false;
  }

  if (!targetWindow || targetWindow.isDestroyed()) {
    return false;
  }

  if (!targetWindow.webContents || targetWindow.webContents.isDestroyed()) {
    return false;
  }

  return event.sender === targetWindow.webContents;
}

function isSenderAnyWindow(event, windows) {
  return Array.isArray(windows) && windows.some((window) => isSenderWindow(event, window));
}

function isSenderMainWindow(event, mainWindow) {
  return isSenderWindow(event, mainWindow);
}

module.exports = {
  isSenderAnyWindow,
  isSenderMainWindow,
  isSenderWindow,
};
