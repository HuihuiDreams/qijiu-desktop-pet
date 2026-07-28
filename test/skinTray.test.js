const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { readMainProcessSource } = require('./helpers/sourceCorpus');

// ═══════════════════════════════════════════════════════════════════
//  Phase 2 单元测试：主进程皮肤集成
// ═══════════════════════════════════════════════════════════════════

// 皮肤显示名多语言 key 映射表（文件夹名 → I18N.ui key）
const SKIN_NAME_KEYS = {
  'default': 'skinDefault',
  'birds': 'skinBirds',
  'animal_ears': 'skinAnimalEars',
  'school_au': 'skinSchoolAu',
};

/**
 * 复现 main.js 中 scanAvailableSkins 的核心逻辑，验证其行为
 * @param {string} assetsDir 
 * @returns {string[]}
 */
function scanAvailableSkins(assetsDir) {
  const knownSkinIds = new Set(Object.keys(SKIN_NAME_KEYS));
  try {
    const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
    return entries.filter(dirent => {
      if (!dirent.isDirectory()) return false;
      const entry = path.basename(dirent.name);
      if (!knownSkinIds.has(entry)) return false; // 只允许白名单内的皮肤 ID
      try {
        const fullPath = path.join(assetsDir, entry);
        if (!fullPath.startsWith(assetsDir)) return false;
        return fs.statSync(fullPath).isDirectory();
      } catch {
        return false;
      }
    }).map(dirent => dirent.name).sort((a, b) => {
      const keys = Object.keys(SKIN_NAME_KEYS);
      const indexA = keys.indexOf(a);
      const indexB = keys.indexOf(b);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.localeCompare(b);
    });
  } catch {
    return ['default'];
  }
}

const ASSETS_DIR = path.join(__dirname, '..', 'src', 'assets');

test('main.js escapes literal ampersands in Electron menu labels', () => {
  const mainSource = readMainProcessSource();

  assert.ok(mainSource.includes('function escapeElectronMenuLabel'), 'menu labels should have a dedicated Electron escape helper');
  assert.ok(mainSource.includes("replaceAll('&', '&&')"), 'literal ampersands should be doubled for Electron menus');
});

// --- 目录扫描测试 ---

test('scanAvailableSkins: 能够按 SKIN_NAME_KEYS 中定义的顺序正确排序', () => {
  const skins = scanAvailableSkins(ASSETS_DIR);
  const expectedOrder = ['default', 'birds', 'animal_ears', 'school_au'];
  assert.deepStrictEqual(skins.slice(0, expectedOrder.length), expectedOrder, '皮肤列表应按预设顺序排列');
});

test('scanAvailableSkins: 能扫描到 default 皮肤文件夹', () => {
  const skins = scanAvailableSkins(ASSETS_DIR);
  assert.ok(skins.includes('default'), 'default 文件夹应该被扫描到');
});

test('main.js tray menu includes only one update menu item', () => {
  const mainSource = readMainProcessSource();
  const updateMenuItemCount = (mainSource.match(/label:\s*updateMenuState\.checking/g) || []).length;

  assert.equal(updateMenuItemCount, 1);
});

test('main.js tray menu shows app version at the bottom', () => {
  const mainSource = readMainProcessSource();
  const quitIndex = mainSource.indexOf("trayMenuLabel('trayQuit')");
  const versionLabelIndex = mainSource.indexOf("trayMenuLabel('trayVersion', 'Version')", quitIndex);
  const versionValueIndex = mainSource.indexOf('app.getVersion()', mainSource.indexOf('function buildTrayMenu()'));

  assert.ok(versionValueIndex > -1, 'tray menu should read the runtime app version');
  assert.ok(versionLabelIndex > quitIndex, 'version label should appear after Quit near the bottom of the tray menu');
});

test('scanAvailableSkins: 排除非目录文件 (icon.ico, icon.png)', () => {
  const skins = scanAvailableSkins(ASSETS_DIR);
  assert.ok(!skins.includes('icon.ico'), 'icon.ico 不应出现在皮肤列表中');
  assert.ok(!skins.includes('icon.png'), 'icon.png 不应出现在皮肤列表中');
});

test('scanAvailableSkins: 返回值只包含文件夹', () => {
  const skins = scanAvailableSkins(ASSETS_DIR);
  for (const skinId of skins) {
    const stat = fs.statSync(path.join(ASSETS_DIR, skinId));
    assert.ok(stat.isDirectory(), `${skinId} 应该是一个文件夹`);
  }
});

test('scanAvailableSkins: 不存在的目录返回兜底值 [default]', () => {
  const skins = scanAvailableSkins('/nonexistent/path/to/assets');
  assert.deepEqual(skins, ['default']);
});

test('scanAvailableSkins: 不将非皮肤子目录（如 fonts）识别为皮肤', () => {
  // 回归测试：fonts 目录存在于 src/assets/ 但不在 SKIN_NAME_KEYS 白名单中，不应被当作皮肤列出
  const skins = scanAvailableSkins(ASSETS_DIR);
  assert.ok(!skins.includes('fonts'), 'fonts 目录不应被识别为皮肤');
  assert.strictEqual(skins.length, Object.keys(SKIN_NAME_KEYS).length, '皮肤数量应与白名单中注册的皮肤数量一致');
});

// --- SKIN_NAMES 映射测试（从 main.js 中提取验证） ---

test('main.js 中包含皮肤本地化 key 映射', () => {
  const mainSource = readMainProcessSource();
  assert.ok(mainSource.includes('SKIN_NAME_KEYS'), '托盘皮肤名应通过本地化 key 映射');
  assert.ok(mainSource.includes("'default': 'skinDefault'"), 'default 皮肤应映射到 skinDefault');
  assert.ok(mainSource.includes('getSkinGalleryDisplayName(skinId)'), '皮肤画廊应通过当前语言生成显示名');
});

test('main.js 托盘 tooltip 跟随当前语言标题刷新', () => {
  const mainSource = readMainProcessSource();
  assert.ok(mainSource.includes("tray.setToolTip(trayT('trayTitle'))"), '托盘 tooltip 应使用多语言标题');
});

// --- 托盘菜单结构验证 ---

test('main.js 中 buildTrayMenu 使用皮肤画廊入口替代单选子菜单', () => {
  const mainSource = readMainProcessSource();
  assert.ok(mainSource.includes("trayMenuLabel('trayChooseSkin')"), '托盘菜单应包含选择皮肤入口');
  assert.ok(mainSource.includes('openSkinSelector()'), '选择皮肤入口应打开画廊窗口');
  assert.ok(!mainSource.includes('submenu: skinSubmenu'), '不应继续渲染旧的皮肤单选子菜单');
});

test('main.js 托盘菜单用分割线区分桌宠功能和软件功能', () => {
  const mainSource = readMainProcessSource();
  const resetIndex = mainSource.indexOf("trayMenuLabel('trayResetPos')");
  const softwareSeparatorIndex = mainSource.indexOf("{ type: 'separator' }", resetIndex);
  const autoLaunchIndex = mainSource.indexOf("trayMenuLabel('trayAutoLaunchOn')", softwareSeparatorIndex);
  const devToolsIndex = mainSource.indexOf("trayMenuLabel('trayDevTools')", softwareSeparatorIndex);
  const exitIndex = mainSource.indexOf("trayMenuLabel('trayQuit')", softwareSeparatorIndex);

  assert.ok(resetIndex > -1, '桌宠功能组应包含重置位置');
  assert.ok(softwareSeparatorIndex > resetIndex, '重置位置之后应有分割线');
  assert.ok(autoLaunchIndex > softwareSeparatorIndex, '软件功能组应从分割线后开始');
  assert.ok(devToolsIndex > softwareSeparatorIndex, '开发者工具应位于软件功能组');
  assert.ok(exitIndex > softwareSeparatorIndex, '退出应位于软件功能组');
});

test('main.js 托盘开发者工具只在开发态显示', () => {
  const mainSource = readMainProcessSource();
  const devToolsGuardIndex = mainSource.indexOf("...(!app.isPackaged ? [");
  const devToolsIndex = mainSource.indexOf("trayMenuLabel('trayDevTools')", devToolsGuardIndex);
  const devToolsGuardEndIndex = mainSource.indexOf("] : [])", devToolsIndex);

  assert.ok(devToolsGuardIndex > -1, '开发者工具菜单应受 app.isPackaged 保护');
  assert.ok(devToolsIndex > devToolsGuardIndex, '开发者工具应只在开发态条件块中定义');
  assert.ok(devToolsGuardEndIndex > devToolsIndex, '开发者工具开发态条件块应完整闭合');
});

test('main.js 中 switch-skin IPC 消息在菜单点击时发送', () => {
  const mainSource = readMainProcessSource();
  assert.ok(mainSource.includes("send('switch-skin'"), '点击皮肤菜单应发送 switch-skin IPC');
});

// --- IPC handler 注册验证 ---

test('main.js 注册了 get-available-skins IPC handler', () => {
  const mainSource = readMainProcessSource();
  assert.ok(mainSource.includes("ipcMain.handle('get-available-skins'"), '应注册 get-available-skins handler');
});

test('main.js 注册了 set-current-skin IPC handler', () => {
  const mainSource = readMainProcessSource();
  assert.ok(mainSource.includes("ipcMain.handle('set-current-skin'"), '应注册 set-current-skin handler');
  assert.ok(mainSource.includes("createIpcFailure('VALIDATION_ERROR'"), '无效皮肤应返回结构化 IPC 错误');
  assert.ok(mainSource.includes("createIpcFailure('INTERNAL_ERROR'"), '内部异常应返回结构化 IPC 错误');
  assert.ok(mainSource.includes('createIpcSuccess({ skinId })'), '有效皮肤应返回结构化 IPC 成功结果');
});

// --- preload.js API 暴露验证 ---

test('preload.js 暴露了 getAvailableSkins API', () => {
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.ok(preloadSource.includes('getAvailableSkins'), 'preload 应暴露 getAvailableSkins');
});

test('preload.js 暴露了 onSwitchSkin API', () => {
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.ok(preloadSource.includes('onSwitchSkin'), 'preload 应暴露 onSwitchSkin');
});

test('preload.js 暴露了 setCurrentSkin API', () => {
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.ok(preloadSource.includes('setCurrentSkin'), 'preload 应暴露 setCurrentSkin');
  assert.ok(
    preloadSource.includes("setCurrentSkin: (skinId) => ipcRenderer.invoke('set-current-skin', skinId)"),
    'setCurrentSkin 应通过 invoke 返回结构化 IPC 结果',
  );
});

// --- default 皮肤文件夹完整性验证 ---

test('default 皮肤包含所有必要的图片文件', () => {
  const defaultDir = path.join(ASSETS_DIR, 'default');
  const requiredFiles = [
    'left.webp', 'right.webp',
    'left_cultivate.webp', 'left_eat.webp', 'left_sleep.webp', 'left_hungry.webp', 'left_pat.webp',
    'right_cultivate.webp', 'right_eat.webp', 'right_sleep.webp', 'right_hungry.webp', 'right_pat.webp',
    'shareFood.webp', 'cultivate.webp', 'kiss.webp', 'hug.webp',
  ];

  for (const file of requiredFiles) {
    assert.ok(
      fs.existsSync(path.join(defaultDir, file)),
      `default 皮肤缺少文件: ${file}`
    );
  }
});

test('default 皮肤包含行走帧子目录', () => {
  const defaultDir = path.join(ASSETS_DIR, 'default');
  assert.ok(fs.existsSync(path.join(defaultDir, 'yueqi')), '应包含 yueqi 行走帧目录');
  assert.ok(fs.existsSync(path.join(defaultDir, 'shenjiu')), '应包含 shenjiu 行走帧目录');
});
