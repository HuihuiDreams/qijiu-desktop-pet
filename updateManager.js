const DEFAULT_UPDATE_STATE = Object.freeze({
  checking: false,
  updateAvailable: false,
  downloading: false,
  downloaded: false,
  latestVersion: null,
  error: null,
});

// macOS 下没有 Apple Developer 证书时，Squirrel.Mac 会因 ad-hoc 签名
// 不满足代码要求而报错。此标志用于在 macOS 上跳过 electron-updater，
// 改为引导用户到 GitHub Releases 页面手动下载。
const IS_MAC = process.platform === 'darwin';

// GitHub Releases 页面地址（手动更新时在浏览器打开）
const GITHUB_RELEASES_URL = 'https://github.com/HuihuiDreams/qijiu-desktop-pet/releases/latest';

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

function classifyUpdateError(error, t = (k => k)) {
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
    return t('updateErrNetwork');
  }

  if (isNotFoundError(error)) {
    return t('updateErrServer');
  }

  if (
    hasCode('ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNABORTED', 'EPIPE') ||
    messageTextUpper.includes('ERR_CONNECTION_RESET') ||
    messageTextUpper.includes('ERR_TIMED_OUT') ||
    messageTextUpper.includes('SOCKET HANG UP') ||
    messageTextUpper.includes('ABORTED')
  ) {
    return t('updateErrDownload');
  }

  return t('updateErrGeneric');
}

function getReadableErrorDetail(error, t = (k => k)) {
  const [message] = collectErrorSignals(error).messages
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return message ? `${t('updateErrDetailPrefix')}${message}` : t('updateErrUnknownDetail');
}

function getTranslatedText(t, key, fallback) {
  const value = t(key);
  return value === key ? fallback : value;
}

/**
 * macOS 专用：无证书环境下的手动更新管理器。
 * 对外暴露与 createUpdateManager 完全一致的 API，
 * 但"检查更新"会直接打开浏览器跳转到 GitHub Releases 页面，
 * 绕过 Squirrel.Mac 的签名验证。
 */
function createMacManualUpdateManager() {
  let app = null;
  let dialog = null;
  let t = (k) => k;
  let initialized = false;
  const state = { ...DEFAULT_UPDATE_STATE };

  function initUpdateManager(config) {
    app = config.app;
    dialog = config.dialog;
    if (config.t) t = config.t;
    initialized = true;
  }

  async function checkForUpdatesFromTray() {
    if (!initialized) throw new Error('Update manager is not initialized.');

    if (!app || !app.isPackaged) {
      await dialog.showMessageBox({
        type: 'info',
        title: t('updateDevTitle'),
        message: t('updateDevMsg'),
        buttons: [t('updateBtnOk')],
        noLink: true,
      });
      return;
    }

    // macOS 无证书：打开 GitHub Releases 页面，用户手动下载 DMG
    const { shell } = require('electron');
    const manualTitle = t('updateMacManualTitle');
    const manualMsg = t('updateMacManualMsg');
    const manualBtn = t('updateMacManualBtn');
    const laterBtn = t('updateBtnLater');

    const result = await dialog.showMessageBox({
      type: 'info',
      title: manualTitle !== 'updateMacManualTitle' ? manualTitle : '检查更新',
      message: manualMsg !== 'updateMacManualMsg'
        ? manualMsg
        : '点击下方按钮前往 GitHub 下载最新版本的 DMG 安装包。',
      buttons: [
        manualBtn !== 'updateMacManualBtn' ? manualBtn : '前往下载页面',
        laterBtn !== 'updateBtnLater' ? laterBtn : '稍后',
      ],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (result.response === 0) {
      shell.openExternal(GITHUB_RELEASES_URL);
    }
  }

  function getUpdateMenuState() {
    return { ...state, label: '📦 检查更新', enabled: true };
  }

  return {
    initUpdateManager,
    checkForUpdatesFromTray,
    getUpdateMenuState,
    classifyUpdateError,
    _getState: () => ({ ...state }),
  };
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
  let updateProgressUi = {
    showChecking: () => {},
    showDownloading: () => {},
    setProgress: () => {},
    close: () => {},
  };
  let t = (k) => k;
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

  function showCheckingProgress() {
    updateProgressUi.showChecking?.({
      title: getTranslatedText(t, 'updateCheckingTitle', 'Checking for Updates'),
      message: t('updateCheckingMsg'),
    });
  }

  function showDownloadingProgress(percent = 0) {
    updateProgressUi.showDownloading?.({
      title: getTranslatedText(t, 'updateDownloadingTitle', 'Downloading Update'),
      message: t('updateDownloadingMsg'),
      percent,
    });
  }

  function setDownloadProgress(percent) {
    updateProgressUi.setProgress?.(percent);
  }

  function closeProgressUi() {
    updateProgressUi.close?.();
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
    return version 
      ? t('updateNotAvailMsg').replace('{version}', version) 
      : t('updateNotAvailMsgNoVer');
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
    const message = classifyUpdateError(error, t);
    setState({
      checking: false,
      downloading: false,
      error: message,
    });
    setMainWindowProgress(-1);
    closeProgressUi();
    await showMessageBox({
      type: 'error',
      title: t('updateErrTitle'),
      message,
      detail: getReadableErrorDetail(error, t),
      buttons: [t('updateBtnOk')],
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
    closeProgressUi();

    const versionText = latestVersion ? latestVersion : '';
    const result = await showMessageBox({
      type: 'info',
      title: t('updateAvailTitle'),
      message: versionText 
        ? t('updateAvailMsg').replace('{version}', versionText)
        : t('updateAvailMsgNoVer'),
      buttons: [t('updateBtnDownload'), t('updateBtnLater')],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (result.response !== 0) return;

    setState({ downloading: true, error: null });
    showDownloadingProgress(0);
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
    closeProgressUi();

    await showMessageBox({
      type: 'info',
      title: t('updateNotAvailTitle'),
      message: getNoUpdateMessage(info),
      buttons: [t('updateBtnOk')],
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
    closeProgressUi();

    const versionText = latestVersion ? latestVersion : '';
    const result = await showMessageBox({
      type: 'question',
      title: t('updateReadyTitle'),
      message: versionText
        ? t('updateReadyMsg').replace('{version}', versionText)
        : t('updateReadyMsgNoVer'),
      buttons: [t('updateBtnInstall'), t('updateBtnLater')],
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
      showCheckingProgress();
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
        setDownloadProgress(progress.percent);
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
    updateProgressUi = { ...updateProgressUi, ...(config.updateProgressUi || {}) };
    if (config.t) t = config.t;

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
        title: t('updateInProgressTitle'),
        message: state.checking ? t('updateCheckingMsg') : t('updateDownloadingMsg'),
        buttons: [t('updateBtnOk')],
        noLink: true,
      });
      return;
    }

    if (!app?.isPackaged) {
      await showMessageBox({
        type: 'info',
        title: t('updateDevTitle'),
        message: t('updateDevMsg'),
        buttons: [t('updateBtnOk')],
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
    showCheckingProgress();
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


// macOS 无证书时使用手动更新管理器（打开浏览器），其他平台使用 electron-updater
const defaultUpdateManager = IS_MAC
  ? createMacManualUpdateManager()
  : createUpdateManager();

module.exports = {
  initUpdateManager: defaultUpdateManager.initUpdateManager,
  checkForUpdatesFromTray: defaultUpdateManager.checkForUpdatesFromTray,
  getUpdateMenuState: defaultUpdateManager.getUpdateMenuState,
  classifyUpdateError,
  createUpdateManager,
  createMacManualUpdateManager,
};
