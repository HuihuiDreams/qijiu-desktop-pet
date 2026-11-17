# ADR-050: 统一设置窗口与托盘菜单精简

## Status
Accepted

## Date
2026-11-16

## Context
此前桌宠应用的偏好配置分散在系统托盘菜单（[TrayManager.js](../../src/main/TrayManager.js)）与两个独立小窗（原 `CitySettingWindow` 与 `PetScaleWindow`）中：
- 托盘菜单承载了体型调节、界面感知开关、天气同步开关与城市设置、久坐提醒开关与 5 档间隔子菜单、高甜屏保开关与 6 档等待子菜单、三语子菜单及开机自启 7 组持久偏好，菜单过长且多层嵌套子菜单难以快速定位。
- 体型调节与城市设置分别维护独立窗口、preload 与渲染端文件，视觉与键鼠交互虽各自完备，却造成窗口基座、CSP、关闭连带与测试套件的重复维护成本。
- 部分功能已形成明确设计约束：[ADR-038](./ADR-038-weather-sync.md) 定义了天气隐私开关与 Open-Meteo 地名解析并发策略；[ADR-041](./ADR-041-skin-selector-performance-and-scaling.md) 确立了独立 `800×520` 选肤画廊与 `app.openSkinSelectorForQA` 钩子；[ADR-047](./ADR-047-pet-scale-setting.md) 定义了 `50%~150%` 逻辑尺寸缩放与脚底中点锚定；[ADR-048](./ADR-048-modern-web-standards-adoption.md) 确立了零外部 Polyfill、严格 CSP 与现代 ARIA 规范。

因此，需要引入统一设置窗口收口全部偏好配置并精简托盘菜单，同时保留既有主窗口契约、安全隔离边界与选肤画廊体验。

## Decision

1. **托盘菜单瘦身与功能边界**：
   - [TrayManager.js](../../src/main/TrayManager.js) 收敛为“实时桌宠控制 + 高频伴随工具 + 生命周期操作”极简入口：保留应用标题、显示/隐藏状态面板、专注（番茄钟）动态条目、选择皮肤、暂停/恢复走动、隐藏/显示桌宠、重置位置、macOS 切换屏幕、新增的 **`⚙️ 设置…`**、检查更新、开发者工具、退出与版本号。
   - 上述 7 类持久偏好及其子菜单全部移除出托盘，统一迁入设置窗口。托盘中的 `⚙️ 设置…` 保留固定齿轮符号前缀，避免用户切换至不熟悉语言后迷失入口。

2. **3 标签统一设置窗口 (`SettingsWindow`) 与生命周期**：
   - 新增 [SettingsWindow.js](../../src/main/windows/SettingsWindow.js)，创建默认 `520×456`（位置与宽高均按当前显示器 `workArea` 安全夹紧：标准屏幕下 3 个标签页含“高甜屏保”在内的全部卡片一屏免滚动展示；极端小屏或高 DPI 缩小至 `workArea` 尺寸后由 `.settings-tabpanel` 的 `overflow-y: auto` 内部滚动兜底访问）的透明无边框单实例窗口（`alwaysOnTop: false`、`minimizable: true`、`hasShadow: false`、`resizable: false`）。
   - 窗口唤起、复用或恢复时提升至 `screen-saver` 层级并在 macOS 上守卫式调用 `app.focus({ steal: true })`；**聚焦期间持续保持 `screen-saver` 级**，由 `PetWindow.keepPetWindowOnTop()` 在 3 秒巡检中连同其他置顶子窗排在透明主窗之上（防止桌宠精灵、气泡与粒子压住或截断设置窗点击）；失去焦点（`blur`）、最小化（`minimize`）或隐藏（`hide`）时立即回落 `alwaysOnTop: false` 以允许外部应用正常遮挡（若显示/恢复时未实际取得焦点，则在 180ms 后兜底回落普通层级）；不因 `blur` 自动隐藏。
   - 界面采用顶部 3 标签结构：**外观**（宠物体型滑块 `50%~150%` 含恢复默认、当前皮肤展示与“打开选肤画廊”按钮、界面感知开关及平台不支持说明）、**陪伴**（天气同步开关与城市设置表单、久坐提醒开关与 `[30, 45, 60, 90, 120]` 分钟间隔、高甜屏保开关与 `[1, 3, 5, 10, 15, 30]` 分钟等待时间）、**系统**（`中文` / `English` / `日本語` 固定母语标签、开机自动启动开关与 macOS `requires-approval` 待批准提示）。
   - 选肤画廊保留 [SkinSelectorWindow.js](../../src/main/windows/SkinSelectorWindow.js) 独立 `800×520` 窗口与 `app.openSkinSelectorForQA`。仅当通过设置窗触发 `settings-open-skin-selector` 时标记 `returnFocusToSettings`，在选肤窗关闭后安全恢复设置窗焦点并派发 `settings-restore-skin-focus`，从托盘直接开选肤窗不误唤回设置窗。
   - [PetWindow.js](../../src/main/windows/PetWindow.js) 在 `closed` 与 Windows 全屏 RDP 抑制时连带管理 `settingsWindow`；`SettingsWindow` 在自身 `close` 时调用 [PetScaleService.js](../../src/main/services/PetScaleService.js) 的 `flushPreview()` 落盘未提交预览值。

3. **混合提交语义（即时自动保存 vs 城市名异步校验）**：
   - **开关与分段选择**：切换后立即通过对应 `settings-*` 通道写入持久化存储并触发 `settings-updated` 推送。
   - **体型滑块**：拖动 `input` 实时调用 `settings-preview-pet-scale` 仅刷新桌宠逻辑尺寸与脚底锚定渲染（兼容主窗口 `get-pet-scale` 与 `pet-scale-changed` 契约，保留 [ADR-047](./ADR-047-pet-scale-setting.md) 算法）；松手或键盘步进触发 `change` 时立即调用 `settings-commit-pet-scale`（`PetScaleService.confirm(percent)`）持久化。
   - **天气与城市**：支持在关闭天气同步时预填或更新城市，仅通过点击“确认”或在城市输入框按非 IME 组合态 `Enter` 触发 Open-Meteo 地名解析，保留 [ADR-038](./ADR-038-weather-sync.md) 并发取消与最新开关仲裁语义；开启天气同步但尚未配置城市时，前端自动聚焦并定位城市输入框。
   - 城市输入框处于 IME 组合态时按 `Esc` 不关闭设置窗口；非输入/非 IME 状态下按 `Esc` 或点击关闭按钮安全关闭窗口并自动刷入未提交体型预览。

4. **最小权限 Preload 与主进程聚合安全边界**：
   - 新增独立沙盒 [settingsPreload.js](../../settingsPreload.js)，严禁复用 `preload.js` 或暴露 `FORBIDDEN_SUBWINDOW_APIS`（如 `saveData`、`loadData`、`setLocale`、`setAutoLaunch`、`setCurrentSkin`），仅通过 `window.electronAPI` 暴露语义化窄接口（与 `windowI18n.js` 的 `getLocale` / `onLocaleChange` 约定对齐）。
   - 新增 [SettingsService.js](../../src/main/services/SettingsService.js) 作为主进程聚合控制器，统一提供快照 `getSnapshot()`、参数边界校验、全部 `settings-*` IPC 注册（逐条经 `isSenderWindow(event, settingsWindow)` 鉴权），并订阅 `store.onDidChange` 与各子服务回调双向推送 `settings-updated`（同一 tick 内多源触发合并为一次最新快照推送；快照仅在 `windowAwareness.supported` / `autoLaunch.pendingApproval` 嵌套字段暴露平台能力，不再保留顶层重复字段）。设置窗仅能由托盘打开，因此与 `app.openSkinSelectorForQA` 并列保留主进程 QA 入口 `app.openSettingsForQA(initialTab?)`，它不经过 renderer IPC 鉴权，也不获得通用 IPC 绕过能力。
   - 渲染端（[settings.html](../../src/settings.html)、[settings.css](../../src/settings.css)、[settingsWindow.js](../../src/settingsWindow.js)）遵循 [ADR-048](./ADR-048-modern-web-standards-adoption.md)：严格 CSP（含 `font-src 'self'`）、零 `innerHTML` 拼接、顶部 Tab 采用 Roving `tabindex` 与 `ArrowLeft`/`ArrowRight`/`Home`/`End` 键盘导航、`role="switch"` 与非纯色 `aria-pressed` 分段控件、`prefers-reduced-motion` 覆盖与 `.xianxia-panel` + `settings-calligraphy-title` 统一风格。因设置窗口为两只桌宠共用，内容区左右下角以 `.settings-body::before/::after` 分立「岳清源」「沈清秋」竖排书法底纹（`mask` 着青墨色，`z-index: -1`、`pointer-events: none`，打开时落笔遮罩扫出，减弱动态模式下直接显示）；选肤窗口仍只保留「七九」印。

5. **下线旧独立设置窗口与死通道**：
   - 移除原 `CitySettingWindow`、`PetScaleWindow` 及其 preload、HTML、CSS、渲染脚本与独占通道（`close-city-setting-window`、`get-city-settings`、`set-city-name`、`pet-scale-get-settings`、`pet-scale-preview`、`pet-scale-confirm`、`pet-scale-cancel`），同步移除主窗口 `preload.js` 中未曾使用的 3 个旧城市设置方法（`getCitySettings`、`setCityName`、`closeCitySettingWindow`）。
   - [PetScaleService.js](../../src/main/services/PetScaleService.js) 与 [WeatherSyncController.js](../../src/main/services/WeatherSyncController.js) 保留核心状态机与服务方法供 `SettingsService` 调用，主窗口缩放与天候契约零变更。

## Alternatives Considered

- **继续扩展托盘子菜单并保留两套独立设置小窗**：实现改动最小，但托盘菜单持续膨胀，用户无法在一处浏览完整偏好状态，跨语言切换也容易丢失入口。放弃。
- **把“选择皮肤”卡片画廊塞入设置窗标签页或取消 2 步预览确认**：设置窗空间有限（`520×456`），强行塞入多套大卡片会挤占预览对比与扩展空间，且会破坏既有的选肤暂存/回滚流与 `app.openSkinSelectorForQA`。改为保留独立选肤画廊并用 `returnFocusToSettings` 联动衔接。
- **全表单统一采用底部“确定 / 取消”事务缓冲**：语言切换、开启提醒与系统自启属于即时偏好，而城市地理编码存在异步网络耗时，强行事务缓冲会导致操作预期割裂；同时体型拖动预览已在 `change` 与关窗时兜底落盘，故采用分段混合持久策略。

## Consequences

- **Positive**：
  - 7 项偏好集中呈现，托盘回归高频桌面控制；新增三语无障碍控件与键盘导航体验一致。
  - 安全边界统一收口至 `SettingsService` 与最小权限 `settingsPreload.js`，消除多套小窗的重复窗口逻辑、preload 桥接与 CSS 维护成本。
  - 保留 `PetScaleService` 主窗口 `get-pet-scale`/`pet-scale-changed`、脚底锚定、[WeatherSyncController.js](../../src/main/services/WeatherSyncController.js) 并发竞态控制与 [AutoLaunchService.js](../../src/main/services/AutoLaunchService.js) macOS 待批准态语义。
- **Supersedes (Window Form)**：
  - 本 ADR 在设置窗口载体与 IPC 交互形态上取代 [ADR-039](./ADR-039-city-setting-ui-window.md) 的独立城市小窗以及 [ADR-047](./ADR-047-pet-scale-setting.md) 第 4 节的独立体型调节小窗；两份历史 ADR 所确立的天气地理编码隐私/并发策略、逻辑尺寸与脚底锚定算法、渲染与字号分层机制继续有效。
- **Trade-offs**：
  - 即时自动保存减少取消负担，但也意味着语言或开关联动即时作用于桌面；若用户未来需要一键复位更多偏好，可再于对应板块按需补充独立恢复按钮。
