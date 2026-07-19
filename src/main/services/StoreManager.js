/**
 * src/main/services/StoreManager.js
 * 负责 electron-store 的初始化和全局访问
 */

let store = null;

async function initStore() {
  if (store) return store;
  try {
    const Store = (await import('electron-store')).default;
    store = new Store();
  } catch (error) {
    console.error('Failed to init electron-store:', error);
  }
  return store;
}

function getStore() {
  return store;
}

module.exports = {
  initStore,
  getStore,
};
