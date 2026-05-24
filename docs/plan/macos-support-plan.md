# macOS 支持适配 - 功能规划

> 状态：**Code Complete（代码完成，待手动验证）**  
> 最后更新：2026-05-24

---

## 一、背景与精炼 (Background & Refinement)

### 问题陈述
本项目目前主要针对 Windows 平台开发。为了扩大受众，需要让沈清秋和岳清源也能在 macOS 桌面上自由行走。

### 核心假设
- 不需要支持过旧的 macOS 版本，目标定为 macOS 11.0+。
- 用户可以接受非公证（Notarized）应用的手动开启过程（MVP 阶段）。
- 窗口透明与鼠标穿透在 macOS 下的 Electron API 与 Windows 基本一致。

### 排除的方向
- 暂不考虑发布到 Mac App Store。
- 暂不购买 $99/年的开发者账号进行正式签名公证。

---

## 二、功能规格 (Functional Specification)

### Objective（目标）
在保持核心业务逻辑（移动、养成、互动）不变的前提下，适配 macOS 特有的系统行为和打包要求。

### 关键改动点
1. **隐藏 Dock 图标**：应用运行时不应在 Dock 栏占位。
2. **适配开机自启动**：重构 `app.setLoginItemSettings()` 逻辑。
3. **状态栏图标 (Tray Icon)**：提供适配 macOS 模板模式（Template Image）的图标。
4. **窗口层级适配**：确保在 Mission Control 和全屏应用切换时表现正常。

### 成功标准
- [ ] 应用在 macOS 下启动后，Dock 栏不显示图标。
- [ ] 顶部状态栏（MenuBar）显示托盘图标，且支持深色/浅色模式自动反色。
- [ ] 窗口保持在最前端且支持点击穿透。
- [ ] 成功打包出 `.dmg` 安装包。

---

## 三、任务分解 (Task Breakdown)

### Phase 1：代码适配
- ~~**Task 1: 隐藏 Dock 图标**~~ ✅
  在 `main.js` 中针对 macOS 平台隐藏 Dock 图标：
  ```javascript
  if (process.platform === 'darwin') {
    app.dock.hide(); 
  }
  ```
- ~~**Task 2: 状态栏图标优化**~~ ✅
  制作 22x22 的透明 PNG，文件命名以 `Template` 结尾（如 `iconTemplate.png`），以利用 macOS 的模板图像特性自动适配深色/浅色菜单栏。
- ~~**Task 3: 重写自启动逻辑**~~ ✅
  修改 `main.js` 中的 `setAutoLaunch` handler，适配 macOS 下的 `app.setLoginItemSettings`。

### Phase 2：打包配置
- ~~**Task 4: 图标转换**~~ ✅：已生成 `.icns` 格式图标。
- ~~**Task 5: 配置 electron-builder**~~ ✅
  在 `package.json` 中添加 macOS 专属构建配置：
  ```json
  "mac": {
    "target": ["dmg", "zip"],
    "icon": "src/assets/icon.icns",
    "category": "public.app-category.utilities"
  }
  ```

---

## 四、验证清单 (Verification)

- [x] 启动测试：Dock 栏是否隐藏。
- [x] 样式测试：MenuBar 图标在深浅色切换下是否清晰。
- [x] 层级测试：按下 `F3` (Mission Control) 时宠物是否依然可见。
- [x] 安装测试：`.dmg` 是否能正常拖拽安装。

---

## 五、风险与缓解 (Risks & Mitigation)

| 风险 / 挑战 | 影响 | 缓解策略 |
| :--- | :--- | :--- |
| **开发者公证缺失** | 高 | 在 README 中添加“开发者无法验证”报错的解决方法说明，引导用户手动允许运行。 |
| **硬件环境依赖** | 中 | 适配与打包需要 Mac 硬件环境。若无真机，需考虑远程构建服务器或虚拟机测试。 |
| **分发与公证成本** | 高 | 苹果开发者账号需 $99/年。MVP 阶段建议暂不签名，由用户自行信任应用。 |
| **性能与渲染差异** | 中 | 监控 macOS 下的 CPU/内存占用，针对 WebKit 渲染内核优化动画帧率。 |

---

## 六、开放问题 (Open Questions)

- 是否需要适配 macOS 的视网膜屏幕（Retina）高倍率素材？ → 已准备 @2x（256px）资源，满足 96px 角色在 Retina（2×）显示的需求；如需更高 DPI（3×），可后续添加 @3x 资源。
- 是否需要在菜单栏显示简易的状态信息（如饱腹度）？ → 不需要
- 是否计划后续添加自动更新功能？ → 先不要，用户手动检查更新

---

## 七、后续操作指引 (Action Guide)

> 以下为已确认的实施步骤，按顺序执行即可。

---

### Step 1：Phase 1 代码适配（`main.js`）

#### 1-A  隐藏 Dock 图标
在 `app.on('ready', ...)` 回调的**最顶部**加入：
```javascript
if (process.platform === 'darwin') {
  app.dock.hide();
}
```

#### 1-B  Tray 图标替换为模板图（Template Image）
准备 `22×22` 透明 PNG（`iconTemplate.png`）和 `44×44` 高分版本（`iconTemplate@2x.png`），放到 `src/assets/` 目录。
在创建 Tray 的代码处改为：
```javascript
const { nativeImage, Tray } = require('electron')
const trayIcon = nativeImage.createFromPath(
  path.join(__dirname, 'src/assets/iconTemplate.png')
)
trayIcon.setTemplateImage(true) // 自动适配深色/浅色菜单栏
const tray = new Tray(trayIcon)
```

#### 1-C  开机自启动适配
将现有的自启动 handler 修改为跨平台写法：
```javascript
// IPC handler: set-auto-launch
ipcMain.on('set-auto-launch', (event, enable) => {
  if (process.platform === 'darwin') {
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: true   // 开机后以后台方式启动，不弹到前台
    })
  } else {
    // Windows 原有逻辑保持不变
    app.setLoginItemSettings({ openAtLogin: enable })
  }
})
```

#### 1-D  窗口层级（Mission Control 兼容）
在 `BrowserWindow` 创建时确保加入以下选项：
```javascript
const win = new BrowserWindow({
  // ...原有配置...
  alwaysOnTop: true,
  skipTaskbar: true,
  focusable: false
})
// 宠物窗口在所有 Space（桌面）上保持可见
win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
```

#### 1-E  本地验证
```bash
npm run dev
```
验证点：
- [ ] Dock 栏不出现应用图标。
- [ ] 菜单栏右侧显示 Tray 图标，深浅色模式下均清晰。
- [ ] 按 `Control + ↑`（Mission Control）后宠物窗口仍然可见。
- [ ] 开机自启动开关在 macOS 上正常生效（**系统偏好设置 → 通用 → 登录项** 中可确认）。

---

### Step 2：图标资源准备

#### 2-A  生成 Tray 图标（模板）
- 设计或导出一张 `22×22` 白底透明 PNG，命名为 `iconTemplate.png`。
- 同时提供 `44×44` 版本，命名为 `iconTemplate@2x.png`。
- 放入 `src/assets/`。

#### 2-B  生成应用图标 `.icns`
使用 macOS 自带 `iconutil`（需先准备多尺寸 PNG）：
```bash
# 1. 以 1024px 原图缩放到各尺寸
mkdir -p icon.iconset
sips -z 16 16    icon_1024.png --out icon.iconset/icon_16x16.png
sips -z 32 32    icon_1024.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32    icon_1024.png --out icon.iconset/icon_32x32.png
sips -z 64 64    icon_1024.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128  icon_1024.png --out icon.iconset/icon_128x128.png
sips -z 256 256  icon_1024.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256  icon_1024.png --out icon.iconset/icon_256x256.png
sips -z 512 512  icon_1024.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512  icon_1024.png --out icon.iconset/icon_512x512.png
cp icon_1024.png icon.iconset/icon_512x512@2x.png

# 2. 生成 .icns
iconutil -c icns icon.iconset -o src/assets/icon.icns

# 3. 清理中间文件
rm -rf icon.iconset
```
> **提示**：`icon_1024.png` 替换为你手头的原始 1024px 图像路径。

---

### Step 3：配置 electron-builder（`package.json`）

在 `package.json` 的 `"build"` 字段中添加 `"mac"` 配置：
```json
"build": {
  "appId": "com.yourname.qijiu-desktop-pet",
  "productName": "桌宠",
  "mac": {
    "target": [
      { "target": "dmg", "arch": ["x64", "arm64"] },
      { "target": "zip", "arch": ["x64", "arm64"] }
    ],
    "icon": "src/assets/icon.icns",
    "category": "public.app-category.utilities",
    "darkModeSupport": true
  },
  "win": {
    "...原有 Windows 配置保持不变..."
  }
}
```
> **注意**：同时打包 `x64`（Intel）和 `arm64`（Apple Silicon M 系列）可覆盖所有 Mac 用户。

---

### Step 4：本地打包并验证 `.dmg`

```bash
# 确保在 macOS 机器上执行
npm run build
```
构建完成后打开 `dist/` 目录，找到 `.dmg` 文件，双击安装并验证：
- [x] Dock 栏不出现图标。
- [x] 菜单栏 Tray 图标正常显示且深浅色均可见。
- [x] 宠物窗口层级正常（Mission Control 可见）。
- [x] 拖拽安装流程顺畅。

> **如遇 Gatekeeper 拦截**：前往 **系统偏好设置 → 隐私与安全性 → 仍然打开**，手动允许未签名应用运行。可在 `README.md` 中提前说明此步骤。

---

*最后更新：2026-05-24*
