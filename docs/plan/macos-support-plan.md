# macOS 支持适配 - 功能规划

> 状态：Proposed（已提议，待实施）  
> 最后更新：2026-05-09

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
- **Task 1: 隐藏 Dock 图标**
  在 `main.js` 中针对 macOS 平台隐藏 Dock 图标：
  ```javascript
  if (process.platform === 'darwin') {
    app.dock.hide(); 
  }
  ```
- **Task 2: 状态栏图标优化**
  制作 22x22 的透明 PNG，文件命名以 `Template` 结尾（如 `iconTemplate.png`），以利用 macOS 的模板图像特性自动适配深色/浅色菜单栏。
- **Task 3: 重写自启动逻辑**
  修改 `main.js` 中的 `setAutoLaunch` handler，适配 macOS 下的 `app.setLoginItemSettings`。

### Phase 2：打包配置
- **Task 4: 图标转换**：生成 `.icns` 格式图标。
- **Task 5: 配置 electron-builder**
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

- [ ] 启动测试：Dock 栏是否隐藏。
- [ ] 样式测试：MenuBar 图标在深浅色切换下是否清晰。
- [ ] 层级测试：按下 `F3` (Mission Control) 时宠物是否依然可见。
- [ ] 安装测试：`.dmg` 是否能正常拖拽安装。

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

- 是否需要适配 macOS 的视网膜屏幕（Retina）高倍率素材？
- 是否需要在菜单栏显示简易的状态信息（如饱腹度）？

---

*最后更新：2026-05-09*
