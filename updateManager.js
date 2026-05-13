const DEFAULT_UPDATE_STATE = Object.freeze({
  checking: false,
  updateAvailable: false,
  downloading: false,
  downloaded: false,
  latestVersion: null,
  error: null,
});

function loadDefaultAutoUpdater() {
  return require('electron-updater').autoUpdater;
}

function loadDefaultLog() {
  try {
    return require('electron-log/main');
  } catch (_error) {
    return require('electron-log');
  }
}

function cloneState(state) {
  return { ...state };
}

function getUpdateVersion(info) {
  return info?.version || info?.releaseName || null;
}

function isNotFoundError(error) {
  const statusCode = error?.statusCode || error?.status || '';
  const message = error?.message || String(error || '');
  return statusCode === 404 || message.includes('404');
}

function classifyUpdateError(error) {
  const code = error?.code || '';

  if (code === 'ENOTFOUND' || code === 'ENETUNREACH') {
    return '检查更新失败，请确认网络连接后重试。';
  }

  if (isNotFoundError(error)) {
    return '更新服务器暂时不可用，请稍后再试。';
  }

  if (code === 'ECONNRESET' || code === 'ETIMEDOUT') {
    return '更新下载中断，请稍后重试。';
  }

  return '检查更新失败，详细原因已写入日志。';
}

function createUpdateManager(options = {}) {
  const getAutoUpdater = options.getAutoUpdater || loadDefaultAutoUpdater;
  const getLog = options.getLog || loadDefaultLog;

  let autoUpdater = null;
  let log = null;
  let app = null;
  let dialog = null;
  let getMainWindow = () => null;
  let refreshTrayMenu = () => {};
  let initialized = false;
  let checkNotFoundHandled = false;
  let state = cloneState(DEFAULT_UPDATE_STATE);

  function setState(patch) {
    state = { ...state, ...patch };
    refreshTrayMenu();
  }

  function logError(error) {
    if (log?.error) {
      log.error('Update error:', error);
    }
  }

  function showMessageBox(options) {
    if (!dialog?.showMessageBox) return Promise.resolve({ response: 0 });
    return dialog.showMessageBox(options);
  }

  function setMainWindowProgress(value) {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed?.()) return;
    if (typeof mainWindow.setProgressBar === 'function') {
      mainWindow.setProgressBar(value);
    }
  }

  function getCurrentVersion() {
    try {
      return app?.getVersion?.() || null;
    } catch (_error) {
      return null;
    }
  }

  function getNoUpdateMessage(info) {
    const version = getCurrentVersion() || getUpdateVersion(info);
    return version ? `当前版本 ${version} 已是最新版本。` : '当前已经是最新版本。';
  }

  function getUpdateMenuState() {
    if (state.checking) {
      return { ...cloneState(state), label: '📦 正在检查更新...', enabled: false };
    }

    if (state.downloading) {
      return { ...cloneState(state), label: '📦 正在下载更新...', enabled: false };
    }

    return { ...cloneState(state), label: '📦 检查更新', enabled: true };
  }

  async function handleError(error) {
    if (isNotFoundError(error) && checkNotFoundHandled) {
      return;
    }

    if (state.checking && isNotFoundError(error)) {
      checkNotFoundHandled = true;
      await handleUpdateNotAvailable();
      return;
    }

    logError(error);
    const message = classifyUpdateError(error);
    setState({
      checking: false,
      downloading: false,
      error: message,
    });
    setMainWindowProgress(-1);
    await showMessageBox({
      type: 'error',
      title: '更新失败',
      message,
      buttons: ['知道了'],
      noLink: true,
    });
  }

  async function handleUpdateAvailable(info) {
    const latestVersion = getUpdateVersion(info);
    setState({
      checking: false,
      updateAvailable: true,
      latestVersion,
      error: null,
    });

    const versionText = latestVersion ? ` ${latestVersion}` : '';
    const result = await showMessageBox({
      type: 'info',
      title: '发现新版本',
      message: `发现新版本${versionText}，是否现在下载？`,
      buttons: ['下载', '稍后'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (result.response !== 0) return;

    setState({ downloading: true, error: null });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      await handleError(error);
    }
  }

  async function handleUpdateNotAvailable(info) {
    setState({
      checking: false,
      updateAvailable: false,
      downloading: false,
      downloaded: false,
      latestVersion: null,
      error: null,
    });
    setMainWindowProgress(-1);

    await showMessageBox({
      type: 'info',
      title: '已是最新版本',
      message: getNoUpdateMessage(info),
      buttons: ['知道了'],
      noLink: true,
    });
  }

  async function handleUpdateDownloaded(info) {
    const latestVersion = getUpdateVersion(info) || state.latestVersion;
    setState({
      checking: false,
      downloading: false,
      downloaded: true,
      latestVersion,
      error: null,
    });
    setMainWindowProgress(-1);

    const versionText = latestVersion ? ` ${latestVersion}` : '';
    const result = await showMessageBox({
      type: 'question',
      title: '更新已下载',
      message: `新版本${versionText}已下载完成，是否现在重启并安装？`,
      buttons: ['重启并安装', '稍后'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  }

  function registerUpdateEvents() {
    autoUpdater.on('checking-for-update', () => {
      setState({
        checking: true,
        updateAvailable: false,
        downloading: false,
        downloaded: false,
        latestVersion: null,
        error: null,
      });
    });

    autoUpdater.on('update-available', (info) => {
      void handleUpdateAvailable(info);
    });

    autoUpdater.on('update-not-available', (info) => {
      void handleUpdateNotAvailable(info);
    });

    autoUpdater.on('download-progress', (progress) => {
      setState({ checking: false, downloading: true, error: null });
      if (typeof progress?.percent === 'number') {
        setMainWindowProgress(progress.percent / 100);
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      void handleUpdateDownloaded(info);
    });

    autoUpdater.on('error', (error) => {
      void handleError(error);
    });
  }

  function initUpdateManager(config) {
    app = config.app;
    dialog = config.dialog;
    getMainWindow = config.getMainWindow || getMainWindow;
    refreshTrayMenu = config.refreshTrayMenu || refreshTrayMenu;

    if (initialized) return;

    autoUpdater = getAutoUpdater();
    log = getLog();
    autoUpdater.logger = log;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    registerUpdateEvents();
    initialized = true;
  }

  async function checkForUpdatesFromTray() {
    if (!initialized) {
      throw new Error('Update manager is not initialized.');
    }

    if (state.checking || state.downloading) {
      await showMessageBox({
        type: 'info',
        title: '更新检查进行中',
        message: state.checking ? '正在检查更新，请稍候。' : '正在下载更新，请稍候。',
        buttons: ['知道了'],
        noLink: true,
      });
      return;
    }

    if (!app?.isPackaged) {
      await showMessageBox({
        type: 'info',
        title: '开发模式',
        message: '开发模式下不支持检查更新，请使用安装包验证自动更新。',
        buttons: ['知道了'],
        noLink: true,
      });
      return;
    }

    setState({
      checking: true,
      updateAvailable: false,
      downloading: false,
      downloaded: false,
      latestVersion: null,
      error: null,
    });
    checkNotFoundHandled = false;

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      await handleError(error);
    }
  }

  return {
    initUpdateManager,
    checkForUpdatesFromTray,
    getUpdateMenuState,
    classifyUpdateError,
    _getState: () => cloneState(state),
  };
}

const defaultUpdateManager = createUpdateManager();

module.exports = {
  initUpdateManager: defaultUpdateManager.initUpdateManager,
  checkForUpdatesFromTray: defaultUpdateManager.checkForUpdatesFromTray,
  getUpdateMenuState: defaultUpdateManager.getUpdateMenuState,
  classifyUpdateError,
  createUpdateManager,
};
