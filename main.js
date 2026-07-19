const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function configureQaUserDataPath() {
  const qaUserDataDir = process.env.DESKTOP_PET_USER_DATA_DIR;
  if (!qaUserDataDir) return;

  const resolvedDir = path.resolve(qaUserDataDir);
  fs.mkdirSync(resolvedDir, { recursive: true });
  app.setPath('userData', resolvedDir);
}

configureQaUserDataPath();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  const AppLifecycle = require('./src/main/AppLifecycle');
  AppLifecycle.init(app);
}
