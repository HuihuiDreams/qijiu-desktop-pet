/**
 * 验证 IPC 事件的发件方是否为指定主窗口的 webContents。
 * 用于实现安全边界，确保敏感 IPC 只能由受信任的主透明窗口调用。
 *
 * @param {Object} event Electron IPC 事件对象
 * @param {BrowserWindow} mainWindow 期望的发件方窗口
 * @returns {boolean} 是否授权
 */
function isSenderMainWindow(event, mainWindow) {
  if (!event || !event.sender) {
    return false;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  if (!mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
    return false;
  }

  return event.sender === mainWindow.webContents;
}

module.exports = {
  isSenderMainWindow
};
