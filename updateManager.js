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

function collectErrorSignals(error, seen = new Set()) {
  if (!error || seen.has(error)) {
    return { codes: [], statuses: [], messages: [] };
  }

  if (typeof error !== 'object') {
    return { codes: [], statuses: [], messages: [String(error)] };
  }

  seen.add(error);

  const signals = {
    codes: [],
    statuses: [],
    messages: [],
  };

  const append = (key, value) => {
    if (value === null || value === undefined || value === '') return;
    if (key === 'codes') signals.codes.push(String(value).toUpperCase());
    if (key === 'statuses') {
      const status = Number(value);
      if (Number.isFinite(status)) signals.statuses.push(status);
    }
    if (key === 'messages') signals.messages.push(String(value));
  };

  append('codes', error.code);
  append('codes', error.errno);
  append('statuses', error.statusCode);
  append('statuses', error.status);
  append('statuses', error.response?.statusCode);
  append('statuses', error.response?.status);
  append('messages', error.message);
  append('messages', error.stack);

  const nestedErrors = [
    error.cause,
    error.error,
    error.originalError,
    error.response?.error,
    error.response?.body,
  ];

  if (Array.isArray(error.errors)) {
    nestedErrors.push(...error.errors);
  }

  nestedErrors.forEach((nestedError) => {
    const nestedSignals = collectErrorSignals(nestedError, seen);
    signals.codes.push(...nestedSignals.codes);
    signals.statuses.push(...nestedSignals.statuses);
    signals.messages.push(...nestedSignals.messages);
  });

  return signals;
}

function isNotFoundError(error) {
  const signals = collectErrorSignals(error);
  const messageText = signals.messages.join('\n');
  return signals.statuses.includes(404) || /\b404\b/.test(messageText);
}

function classifyUpdateError(error) {
  const signals = collectErrorSignals(error);
  const codes = new Set(signals.codes);
  const messageText = signals.messages.join('\n');
  const messageTextUpper = messageText.toUpperCase();
  const hasCode = (...values) => values.some((value) => codes.has(value));

  if (
    hasCode('ENOTFOUND', 'ENETUNREACH', 'EAI_AGAIN') ||
    messageTextUpper.includes('ERR_INTERNET_DISCONNECTED') ||
    messageTextUpper.includes('ERR_NAME_NOT_RESOLVED') ||
    messageTextUpper.includes('GETADDRINFO ENOTFOUND')
  ) {
    return '无法连接更新源，请稍后再试；如果网络正常，可能是 GitHub 更新源暂时不可访问。';
  }

  if (isNotFoundError(error)) {
    return '更新服务器暂时不可用，请稍后再试。';
  }

  if (
    hasCode('ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNABORTED', 'EPIPE') ||
    messageTextUpper.includes('ERR_CONNECTION_RESET') ||
    messageTextUpper.includes('ERR_TIMED_OUT') ||
    messageTextUpper.includes('SOCKET HANG UP') ||
    messageTextUpper.includes('ABORTED')
  ) {
    return '更新包下载中断，请稍后重试；如果反复失败，可改用手动下载安装包。';
  }

  return '检查更新失败，详细原因已写入日志。';
}

function getReadableErrorDetail(error) {
  const [message] = collectErrorSignals(error).messages
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return message ? `原因：${message}` : '原因：未知错误，详情已写入日志。';
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
      detail: getReadableErrorDetail(error),
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
