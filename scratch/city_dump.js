725:function createCitySettingWindow() {
726-  if (windowManager.citySettingWindow && !windowManager.citySettingWindow.isDestroyed()) return windowManager.citySettingWindow;
727-
728-  const width = 360;
729-  const height = 200;
730-  const cursor = screen.getCursorScreenPoint();
731-  const display = screen.getDisplayNearestPoint(cursor);
732-  const { x, y, width: areaWidth, height: areaHeight } = display.workArea;
733-
734-  windowManager.citySettingWindow = new BrowserWindow({
735-    width,
736-    height,
737-    x: Math.round(x + (areaWidth - width) / 2),
738-    y: Math.round(y + (areaHeight - height) / 2),
739-    transparent: true,
740-    frame: false,
741-    alwaysOnTop: false,
742-    skipTaskbar: false,
743-    resizable: false,
744-    minimizable: false,
745-    maximizable: false,
746-    hasShadow: false,
747-    webPreferences: {
748-      preload: path.join(__dirname, 'preload.js'),
749-      contextIsolation: true,
750-      nodeIntegration: false,
751-      sandbox: true,
752-    },
753-  });
754-
755-  windowManager.citySettingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
756-  windowManager.citySettingWindow.loadFile(path.join(__dirname, 'src', 'city-setting.html'));
757-
758-  windowManager.citySettingWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
759-  windowManager.citySettingWindow.webContents.on('will-navigate', (event) => event.preventDefault());
760-  windowManager.citySettingWindow.on('focus', () => {
761-    pulseCitySettingWindowTop();
762-  });
763-  windowManager.citySettingWindow.on('show', () => {
764-    pulseCitySettingWindowTop();
765-  });
766-  windowManager.citySettingWindow.on('restore', () => {
767-    raiseCitySettingWindow();
768-  });
769-  windowManager.citySettingWindow.on('closed', () => {
770-    if (citySettingTopPulseTimer) {
771-      clearTimeout(citySettingTopPulseTimer);
772-      citySettingTopPulseTimer = null;
773-    }
774-    windowManager.citySettingWindow = null;
775-  });
776-
777-  return windowManager.citySettingWindow;
778-}
779-
780-function openCitySettingWindow() {
781-  createCitySettingWindow();
782-  return raiseCitySettingWindow();
783-}
784-
785-function closeCitySettingWindow() {
786-  if (windowManager.citySettingWindow && !windowManager.citySettingWindow.isDestroyed()) {
787-    windowManager.citySettingWindow.close();
788-  }
789-}
790-
791-function resolvePomodoroAsset(skinId, filename) {
792-  const safeSkinId = isAllowedSkinId(skinId, scanAvailableSkins()) ? skinId : 'default';
793-  const protectedAssetId = `skin/${safeSkinId}/${filename}`;
794-  if (hasProtectedAsset(protectedAssetId, { appRoot: __dirname, resourcesPath: process.resourcesPath })) {
795-    return createAssetUrl(protectedAssetId);
796-  }
797-
798-  const candidatePath = path.join(__dirname, 'src', 'assets', safeSkinId, filename);
799-  if (fs.existsSync(candidatePath)) {
800-    return createAssetUrl(protectedAssetId);
801-  }
802-  return createAssetUrl(`skin/default/${filename}`);
803-}
804-
805-let cachedPomodoroAssets = null;
806-let cachedPomodoroAssetsSkinId = null;
807-
808-function getPomodoroAssets() {
809-  if (cachedPomodoroAssets && cachedPomodoroAssetsSkinId === currentSkinId) {
810-    return cachedPomodoroAssets;
811-  }
812-  const assets = {
813-    yueqi: resolvePomodoroAsset(currentSkinId, 'left_cultivate.webp'),
814-    shenjiu: resolvePomodoroAsset(currentSkinId, 'right_cultivate.webp'),
815-    cultivate: resolvePomodoroAsset(currentSkinId, 'cultivate.webp'),
816-    kiss: resolvePomodoroAsset(currentSkinId, 'kiss.webp'),
817-  };
818-  cachedPomodoroAssets = assets;
819-  cachedPomodoroAssetsSkinId = currentSkinId;
820-  return assets;
821-}
822-
823-function getPomodoroSnapshot(now) {
824-  const snapshot = pomodoroSystem.getSnapshot(now);
825-  return {
