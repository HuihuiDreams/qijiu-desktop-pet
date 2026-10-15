'use strict';

const EventEmitter = require('node:events');

/**
 * Creates an in-memory Store double mimicking electron-store API.
 */
function createInMemoryStore(initialData = {}) {
  const store = new Map(Object.entries(initialData));
  return {
    get(key, defaultValue) {
      return store.has(key) ? store.get(key) : defaultValue;
    },
    set(key, value) {
      store.set(key, value);
    },
    has(key) {
      return store.has(key);
    },
    delete(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    get raw() {
      return Object.fromEntries(store.entries());
    },
  };
}

/**
 * Creates a simulated WebContents object capable of capturing sent messages.
 */
function createMockWebContents(id = 1) {
  const emitter = new EventEmitter();
  const sentMessages = [];
  let destroyed = false;

  return {
    id,
    isDestroyed: () => destroyed,
    destroy() {
      destroyed = true;
    },
    send(channel, ...args) {
      if (destroyed) return;
      sentMessages.push({ channel, args, timestamp: Date.now() });
      emitter.emit(channel, ...args);
    },
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    setWindowOpenHandler: () => {},
    getSentMessages(channel) {
      if (!channel) return [...sentMessages];
      return sentMessages.filter((m) => m.channel === channel);
    },
    getLastMessage(channel) {
      const messages = this.getSentMessages(channel);
      return messages.length > 0 ? messages[messages.length - 1] : null;
    },
    clearSentMessages() {
      sentMessages.length = 0;
    },
  };
}

/**
 * Creates a simulated BrowserWindow instance.
 */
function createMockWindow(id = 1, options = {}) {
  const webContents = createMockWebContents(id);
  const listeners = {};
  let destroyed = false;
  let visible = options.show ?? false;
  let minimized = false;

  const win = {
    id,
    webContents,
    options,
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    isMinimized: () => minimized,
    show() {
      visible = true;
    },
    hide() {
      visible = false;
    },
    restore() {
      minimized = false;
    },
    minimize() {
      minimized = true;
    },
    focus() {},
    moveTop() {},
    loadFile: () => Promise.resolve(),
    on(event, handler) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    },
    emit(event, ...args) {
      const handlers = listeners[event] || [];
      for (const h of handlers) {
        h(...args);
      }
    },
    close() {
      this.emit('close');
      destroyed = true;
      visible = false;
      webContents.destroy();
      this.emit('closed');
    },
    destroy() {
      destroyed = true;
      visible = false;
      webContents.destroy();
      this.emit('closed');
    },
  };

  return win;
}

/**
 * Resolves a WebContents sender from either a BrowserWindow or direct WebContents.
 */
function resolveSenderWebContents(sender) {
  if (sender?.webContents) {
    return sender.webContents;
  }
  if (sender && typeof sender.id !== 'undefined') {
    return sender;
  }
  return createMockWebContents(-1);
}

/**
 * Creates a simulated ipcMain that captures handlers and allows invoking them.
 */
function createMockIpcMain() {
  const handlers = new Map();
  const listeners = new Map();

  return {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    on(channel, listener) {
      if (!listeners.has(channel)) {
        listeners.set(channel, []);
      }
      listeners.get(channel).push(listener);
    },
    removeHandler(channel) {
      handlers.delete(channel);
    },
    /**
     * Invoke an ipcMain handler as if called from a renderer webContents.
     */
    async invoke(channel, senderWindow, ...args) {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No IPC handler registered for channel "${channel}"`);
      }
      const event = {
        sender: resolveSenderWebContents(senderWindow),
      };
      return handler(event, ...args);
    },
    /**
     * Emit an ipcMain event as if sent from a renderer webContents.
     */
    send(channel, senderWindow, ...args) {
      const channelListeners = listeners.get(channel) || [];
      const event = {
        sender: resolveSenderWebContents(senderWindow),
      };
      for (const listener of channelListeners) {
        listener(event, ...args);
      }
    },
    hasHandler(channel) {
      return handlers.has(channel);
    },
    getRegisteredChannels() {
      return Array.from(handlers.keys());
    },
    clear() {
      handlers.clear();
      listeners.clear();
    },
  };
}

/**
 * Assembles the full integration test harness.
 */
function createIntegrationHarness(initialStoreData = {}) {
  const store = createInMemoryStore(initialStoreData);
  const StoreManager = {
    initStore: async () => {},
    getStore: () => store,
  };

  const ipcMain = createMockIpcMain();

  const mainWindow = createMockWindow(1, { show: true });
  const windowManager = {
    mainWindow,
    statusWindow: null,
    petScaleWindow: null,
    skinSelectorWindow: null,
    pomodoroWindow: null,
    citySettingWindow: null,
    updateProgressWindow: null,
  };

  return {
    store,
    StoreManager,
    ipcMain,
    mainWindow,
    windowManager,
    createMockWindow,
    createMockWebContents,
  };
}

module.exports = {
  createInMemoryStore,
  createMockWebContents,
  createMockWindow,
  createMockIpcMain,
  createIntegrationHarness,
};
