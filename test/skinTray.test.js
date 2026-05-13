const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════
//  Phase 2 单元测试：主进程皮肤集成
// ═══════════════════════════════════════════════════════════════════

// 复现 main.js 中 scanAvailableSkins 的核心逻辑，验证其行为
function scanAvailableSkins(assetsDir) {
  try {
    const entries = fs.readdirSync(assetsDir);
    return entries.filter(entry => {
      try {
        return fs.statSync(path.join(assetsDir, entry)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return ['default'];
  }
}

const ASSETS_DIR = path.join(__dirname, '..', 'src', 'assets');

// --- 目录扫描测试 ---

test('scanAvailableSkins: 能扫描到 default 皮肤文件夹', () => {
  const skins = scanAvailableSkins(ASSETS_DIR);
  assert.ok(skins.includes('default'), 'default 文件夹应该被扫描到');
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

// --- SKIN_NAMES 映射测试（从 main.js 中提取验证） ---

test('main.js 中包含 SKIN_NAMES 映射且 default 有中文名', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
  assert.ok(mainSource.includes("'default': '默认·仙侠水墨'"), 'SKIN_NAMES 应包含 default 的中文映射');
});

// --- 托盘菜单结构验证 ---

test('main.js 中 buildTrayMenu 包含皮肤切换子菜单', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
  assert.ok(mainSource.includes("'🎨 切换皮肤'"), '托盘菜单应包含切换皮肤入口');
  assert.ok(mainSource.includes("submenu: skinSubmenu"), '应使用 submenu 展示皮肤列表');
  assert.ok(mainSource.includes("type: 'radio'"), '皮肤菜单项应使用 radio 类型');
});

test('main.js 中 switch-skin IPC 消息在菜单点击时发送', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
  assert.ok(mainSource.includes("send('switch-skin'"), '点击皮肤菜单应发送 switch-skin IPC');
});

// --- IPC handler 注册验证 ---

test('main.js 注册了 get-available-skins IPC handler', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
  assert.ok(mainSource.includes("ipcMain.handle('get-available-skins'"), '应注册 get-available-skins handler');
});

test('main.js 注册了 set-current-skin IPC listener', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
  assert.ok(mainSource.includes("ipcMain.on('set-current-skin'"), '应注册 set-current-skin listener');
});

// --- preload.js API 暴露验证 ---

test('preload.js 暴露了 getAvailableSkins API', () => {
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf-8');
  assert.ok(preloadSource.includes('getAvailableSkins'), 'preload 应暴露 getAvailableSkins');
});

test('preload.js 暴露了 onSwitchSkin API', () => {
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf-8');
  assert.ok(preloadSource.includes('onSwitchSkin'), 'preload 应暴露 onSwitchSkin');
});

test('preload.js 暴露了 setCurrentSkin API', () => {
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf-8');
  assert.ok(preloadSource.includes('setCurrentSkin'), 'preload 应暴露 setCurrentSkin');
});

// --- default 皮肤文件夹完整性验证 ---

test('default 皮肤包含所有必要的图片文件', () => {
  const defaultDir = path.join(ASSETS_DIR, 'default');
  const requiredFiles = [
    'left.png', 'right.png',
    'left_cultivate.png', 'left_eat.png', 'left_sleep.png', 'left_hungry.png', 'left_pat.png',
    'right_cultivate.png', 'right_eat.png', 'right_sleep.png', 'right_hungry.png', 'right_pat.png',
    'shareFood.png', 'cultivate.png', 'kiss.png', 'hug.png',
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
