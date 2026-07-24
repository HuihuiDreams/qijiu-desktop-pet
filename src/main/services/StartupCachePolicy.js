function shouldClearStartupCache({
  isDevelopment = false,
  forceClear = false,
  lastCacheVersion = null,
  currentVersion = null,
} = {}) {
  return Boolean(isDevelopment || forceClear || lastCacheVersion !== currentVersion);
}

module.exports = {
  shouldClearStartupCache,
};
