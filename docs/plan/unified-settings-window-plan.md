# Implementation Plan: 统一设置窗口与托盘菜单精简

> 状态：代码、文档与自动化验收已完成（待人工实机与 Windows 跨平台验收）
> 最后更新：2026-11-16
> 依据：`/game-ui-ux` 与 `/grill-me` 设计对齐

---

## 1. Overview & Locked Decisions

将目前分散在系统托盘菜单（[TrayManager.js](../../src/main/TrayManager.js)）与多个零散子窗口（`CitySettingWindow.js`、`PetScaleWindow.js`）中的偏好配置收拢至统一的**设置窗口**，同时保持托盘菜单作为“实时桌宠控制 + 高频伴随工具 + 生命周期操作”的极简入口。

### 1.1 托盘菜单 vs 设置窗口分工（严格 1:1 收敛）

| 归属 | 菜单项 / 功能 | 说明 |
| :--- | :--- | :--- |
| **留在托盘** | `岳清源x沈清秋 桌面爱宠` | 禁用态标题 |
| **留在托盘** | `📊 显示/隐藏状态面板` | 高频养成状态查看 |
| **留在托盘** | `🧘🏻‍♂️ 苍穹静修` | 保留实时动态文案（`闭关中 N 分钟` / `静修圆满`） |
| **留在托盘** | `🎨 选择皮肤…` | 保留独立 `800×520` 皮肤画廊窗（[SkinSelectorWindow.js](../../src/main/windows/SkinSelectorWindow.js)）与 `app.openSkinSelectorForQA` |
| **留在托盘** | `⏸️ 暂停走动` / `🚶🏻‍♂️ 恢复走动` | 实时行为控制 |
| **留在托盘** | `👻 隐藏桌宠` / `👻 显示桌宠` | 实时可见性控制 |
| **留在托盘** | `🔄 重置位置` | 应急空间复位快捷操作 |
| **留在托盘** | `🖥️ 切换屏幕` | macOS 多屏即时跳转 |
| **留在托盘** | `⚙️ 设置…` | **新增**：打开统一设置窗口 |
| **留在托盘** | `📦 检查更新` | 维持原位及 `正在检查更新...` / `正在下载更新...` 文案 |
| **留在托盘** | `🛠️ 开发者工具` | 仅 `!app.isPackaged` 显示 |
| **留在托盘** | `❌ 退出` | 保留（配合 macOS 手动更新引导） |
| **留在托盘** | `🏷️ 版本 x.y.z` | 禁用态版本标签 |
| **迁入设置（从托盘移除）** | 📏 调整大小 | `50%–150%`（步进 `5%`），即时预览并松手自动保存 + 「恢复默认 100%」 |
| **迁入设置（从托盘移除）** | 🪟 界面感知 | `win32` / `darwin` 开关；其他平台显示不可用禁用态 |
| **迁入设置（从托盘移除）** | 🌤️ 天气同步 + 城市设置 | 总开关 + 城市输入与地理编码确认 |
| **迁入设置（从托盘移除）** | ⏰ 久坐提醒 + 提醒间隔 | 总开关 + `30 / 45 / 60 / 90 / 120` 分钟 |
| **迁入设置（从托盘移除）** | 💕 高甜屏保 + 触发等待 | 总开关 + `1 / 3 / 5 / 10 / 15 / 30` 分钟 |
| **迁入设置（从托盘移除）** | 🌐 语言 | `中文` / `English` / `日本語` |
| **迁入设置（从托盘移除）** | 🚀 开机自动启动 | 开关（兼容 macOS `SMAppService` `pendingApproval` 提示） |

> 明确非目标：本次严格 1:1 迁移现有 7 项设置，**不**新增会议自动隐藏开关、天气刷新间隔、久坐空闲重置阈值等新配置项；**不**在设置窗口内重复放置「关于 / 检查更新」区块。

### 1.2 UI/UX 与交互规范（`/game-ui-ux`）

1. **顶部 3 标签页分栏**（紧凑尺寸约 `520×456`，免滚动完整呈现各标签页全部设置卡并预留桌面空白以便拖动体型滑块时实时观察桌宠变化；内容区 `.settings-tabpanel` 配置 `flex: 1; min-height: 0; overflow-y: auto; scrollbar-gutter: stable;` 与水墨细滚动条兜底，防止多语言分段换行或引导提示展开时纵向裁切）：
   - **Tab 1 — 外观与交互**：
     - **桌宠体型**：`50%–150%` 滑块实时缩放 + 「恢复默认（100%）」按钮。
     - **皮肤外观快捷卡片**：展示当前已确认皮肤名称 + 「选择皮肤…」按钮（点击唤起独立 `SkinSelectorWindow`，设置窗保持开启；**仅在选肤确认提交后实时刷新皮肤名，忽略预览中与取消回滚状态**；关闭选肤窗且设置窗仍可见时，焦点回传至设置窗及「选择皮肤…」按钮）。
     - **界面感知**：开关；非 `win32`/`darwin` 平台禁用并显示不可用说明。
   - **Tab 2 — 陪伴与守护**：
     - **天气同步**：总开关 + 当前城市显示 + 输入框与「确认」按钮。**城市输入始终可预配置**；若用户在“未设置城市”状态下打开天气同步开关，开关保持开启态（`enabled: true`），自动聚焦到城市输入框并展示温和引导提示；待城市验证通过后立即自动触发首次天气同步，无需二次拨动开关。
     - **久坐提醒**：总开关 + 提醒间隔分段选项（`30/45/60/90/120` 分钟）；总开关关闭时子档位使用原生 `disabled`（配合分组 `aria-disabled="true"`），使 `Tab` 键直接跳过不可用档位。
     - **高甜屏保**：总开关 + 触发等待分段选项（`1/3/5/10/15/30` 分钟）；总开关关闭时子档位使用原生 `disabled`（配合分组 `aria-disabled="true"`）。
   - **Tab 3 — 系统偏好**：
     - **界面语言**：`中文 / English / 日本語` 分段切换，实时同步主窗、状态窗、番茄钟、选肤窗、设置窗自身及托盘菜单。
     - **开机自动启动**：开关；当 [AutoLaunchService.js](../../src/main/services/AutoLaunchService.js) 返回 `pendingApproval: true` 时，展示“请在系统设置 → 登录项中允许”提示；异步调用失败时依据主进程权威快照回弹开关状态。
2. **保存模型**：**即时自动保存（Auto-save）**，仅城市输入框因需异步地理编码验证保留「确认」按钮与 `查找中…` / `已设置为 {city}` / `未找到该城市` 状态反馈；不设全局「确定 / 取消」底栏，关窗即完成。滑块 `input` 触发内存实时预览，`change`（松手或键盘步进）立即调用 `commit` 落盘，关窗时兜底刷入未落盘的 `previewPercent`。
3. **布局、自适应、非颜色编码与无障碍**：
   - 沿用 [index.css](../../src/index.css) `.xianxia-panel` 与 [settings-calligraphy.css](../../src/settings-calligraphy.css)（含七九印章与三语书法标题），使用 Flex/Grid 内容自适应容器，不硬编码像素定位或按钮固定宽度，确保切换 `en` / `ja` 时文本不溢出。
   - 开关控件统一使用 `role="switch"` + `aria-checked`（兼具滑块位移与边框对比）；分段按钮使用 `aria-pressed="true"`（或 `role="radiogroup"` / `role="radio"`），选中态叠加加粗字重、实线玉金边框与内部微光/指示条，不单靠背景色深浅区分状态。
   - Tab 栏遵循 `role="tablist"` / `role="tab"` / `role="tabpanel"` 并采用 **Roving `tabindex`**（激活 Tab `tabindex="0"`，非激活 `tabindex="-1"`），支持左右方向键切换 Tab、`Tab` 键线性穿梭控件（跳过禁用子档位）、清晰的 `:focus-visible` 焦点环、城市输入框内 `Enter` 触发校验，并完整覆盖 `@media (prefers-reduced-motion: reduce)`；全局 `Esc` 关闭窗口必须守卫输入法组合态（`if (event.isComposing || event.keyCode === 229) return;`）。
4. **事件驱动状态同步**：不轮询主进程状态；语言切换、体型变化、皮肤确认（不含未确认预览）及 `store.onDidChange` 均由主进程主动向已打开的设置窗推送更新。

---

## 2. Architecture & Security Boundaries

- **窗口与生命周期**：
  - 新增 `src/main/windows/SettingsWindow.js`，在 [WindowManager.js](../../src/main/windows/WindowManager.js) 注册 `settingsWindow`。
  - 参考 [SkinSelectorWindow.js](../../src/main/windows/SkinSelectorWindow.js) 与 [ADR-041](../decisions/ADR-041-skin-selector-performance-and-scaling.md)：`520×456` 初始尺寸（坐标在 `display.workArea` 内做 `Math.max`/`Math.min` 安全区夹紧）、`transparent: true`、`frame: false`、`alwaysOnTop: false`、`minimizable: true`、`resizable: false`、`hasShadow: false`，打开/聚焦时执行 `180ms` `screen-saver` 级置顶脉冲后恢复 `alwaysOnTop: false`，并支持 macOS `app.focus({ steal: true })` 与全空间可见。
  - 在 [PetWindow.js](../../src/main/windows/PetWindow.js) 中同时将 `windowManager.settingsWindow` 纳入 `getPetSubWindows()`（统一服务于 Windows 全屏 RDP 自动避让恢复与 3 秒 `keepPetWindowOnTop()` 子窗口焦点层级排序）及 `closed` 清理链（主窗口关闭时一并关闭，防止孤儿进程）。
  - `SettingsWindow` `close` 时若存在未落盘的体型 `previewPercent` 则兜底提交保存；通过 `returnFocusToSettings` 标识区分选肤窗入口：仅当从设置窗通过 `settings-open-skin-selector` 唤起 `SkinSelectorWindow` 时置为 `true`，在 `SkinSelectorWindow` `closed` 时若标识为真且设置窗未销毁、可见且未最小化，才聚焦设置窗并发送 `settings-restore-skin-focus`（随后重置标识），防止托盘直接选肤时误抢焦点。
- **最小权限 Preload 与 IPC 鉴权**：
  - 新建 `settingsPreload.js`（`sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`），**绝不**暴露通用 `ipcRenderer`，且暴露给渲染层的 `electronAPI` 属性名**严格避开** [subWindowPreloadSecurity.test.js](../../test/subWindowPreloadSecurity.test.js) 的 `FORBIDDEN_SUBWINDOW_APIS` 黑名单（`saveData`、`loadData`、`setAutoLaunch`、`getAutoLaunch`、`setLocale`、`setCurrentSkin`），统一采用业务语义命名（如 `getSnapshot`、`previewPetScale`、`commitPetScale`、`setWeatherEnabled`、`setCityName`、`setBreakReminder`、`setScreensaver`、`setWindowAwareness`、`changeSettingsLocale`、`changeAutoLaunch`、`openSkinSelector`、`closeSettingsWindow` 及只读事件订阅）。
  - 新建 `src/main/services/SettingsService.js`（或控制器），所有 `settings-*` `ipcMain.handle` 第一行校验 `isSenderWindow(event, windowManager.settingsWindow)`（对齐 [IpcSenderAuthorization.js](../../src/main/services/IpcSenderAuthorization.js) 与 [ipcPermissionMatrix.test.js](../../test/ipcPermissionMatrix.test.js)），所有参数在主进程边界做类型/范围归一化校验；异步变更（如 `settings-set-auto-launch`）返回权威快照供前端异常回弹。
  - [StorageIpc.js](../../src/main/services/StorageIpc.js) 中的 `save-data` / `load-data` / `set-auto-launch` / `get-auto-launch` 仍仅限 `mainWindow` 调用，保持不变。
- **CSP 与 HTML 注入防护**：
  - `src/settings.html` 必须配置严格 CSP（`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self';`，满足 [cspHardening.test.js](../../test/cspHardening.test.js)）。
  - `src/settingsWindow.js` 全程使用 `textContent` / `createElement` 更新动态文本（城市名、皮肤名、状态提示），禁止使用 `innerHTML`（满足 [htmlInjectionHardening.test.js](../../test/htmlInjectionHardening.test.js)）。
- **既有服务最小改造**：
  - [PetScaleService.js](../../src/main/services/PetScaleService.js)：保留 `preview(percent)` 用于拖拽实时广播；将 `confirm(percent)` 扩展为可选接收 `percent` 参数并新增 `flushPreview()`（或 `hasPendingPreview()`），100% 兼容既有单测与主窗口契约的同时支持 `change` 松手/步进直接落盘、`reset()`（`100%`）及 `SettingsWindow` 关窗兜底刷盘。
  - [LocaleService.js](../../src/main/services/LocaleService.js)：抽取统一的 `changeLocale(lang)` 方法，同时服务 `mainWindow`、`settingsWindow` 与托盘菜单（消除当前 [TrayManager.js](../../src/main/TrayManager.js) 与 `LocaleService.js` 中重复的跨窗口 `locale-changed` 广播代码）；`get-locale` 白名单用 `settingsWindow` 替换 `citySettingWindow` / `petScaleWindow`。
  - [WeatherSyncController.js](../../src/main/services/WeatherSyncController.js)：抽取并导出纯服务方法 `setCityName(cityName)` 与 `getCitySettings()`（附状态变更回调），供 `SettingsService` 委托调用，完整保留 `weatherSyncCityRequestId` / `weatherSyncSettingsUpdateId` 防竞态逻辑、内存中最新 `enabled` 合并语义（确保未设城市先开开关后设城市时立即自动触发天气同步）与既有并发单测覆盖，并在城市更新 / 开关更新后广播状态给 `settingsWindow`。
  - [BreakReminderController.js](../../src/main/services/BreakReminderController.js)：将原散落在 [TrayManager.js](../../src/main/TrayManager.js) 中的久坐提醒合并写盘逻辑收拢为 `updateBreakReminderSettings(patch)`（校验 `intervalMinutes` 属于 `BREAK_REMINDER_TRAY_INTERVALS`，保留 `idleResetMinutes` 并同步更新内存、服务与 `electron-store`）。
  - [AutoLaunchService.js](../../src/main/services/AutoLaunchService.js)：导出 `isLoginItemPendingApproval` 或新增 `getAutoLaunchState()`（返回 `{ enabled, preference, pendingApproval }`），供 `SettingsService.getSnapshot()` 与 `settings-set-auto-launch` 统一读取。
  - [SkinService.js](../../src/main/services/SkinService.js)：仅在确认切换皮肤（Confirm）成功后通知 `settingsWindow` 更新当前皮肤名，不响应预览态切换。

---

## 3. Phased Task List

### Phase 1: 主进程设置聚合服务与窗口基座
- [x] **Task 1.1: `WindowManager` 与 `SettingsWindow` 窗口模块**
  - **Description**: 在 [WindowManager.js](../../src/main/windows/WindowManager.js) 增加 `settingsWindow` getter/setter（移除 `citySettingWindow` / `petScaleWindow` 留待 Phase 3 与测试迁移同一原子闭环清理，Phase 1 先并行存在确保可编译）；新建 `src/main/windows/SettingsWindow.js` 与 `settingsPreload.js`。
  - **Context / Pattern to Follow**:
    - 窗口创建、居中、180ms 置顶脉冲、全空间可见与 macOS `app.focus({ steal: true })` 参照原 `PetScaleWindow.js` 模式。
    - `settingsPreload.js` 参照 [pomodoroPreload.js](../../pomodoroPreload.js#L1-L17) 的 `subscribeIpc` 订阅与取消订阅清理模式。
  - **Acceptance criteria**:
    - [x] `SettingsWindow` 尺寸为 `520×456`，支持 `openSettingsWindow(initialTab)`（支持指定初始 Tab，默认 `'appearance'`；窗口已打开时同步切换激活 Tab 并移交焦点）、在鼠标所在显示器 `workArea` 内居中并通过 `Math.max`/`Math.min` 安全区夹紧、180ms 置顶脉冲、`alwaysOnTop: false`、`minimizable: true`。
    - [x] `SettingsWindow` `close` 时调用 `PetScaleService.flushPreview()`（或等价兜底刷盘）持久化未落盘预览值；`SkinSelectorWindow` 维护 `returnFocusToSettings` 标识，仅当从设置窗通过 `settings-open-skin-selector` 唤起时置 `true`，`closed` 且设置窗未销毁、可见、未最小化时才聚焦设置窗并派发 `settings-restore-skin-focus`（随后重置标识），避免从托盘直接选肤时误抢焦点。
    - [x] `settingsPreload.js` 严格通过 `contextBridge` 暴露窄 API，且暴露对象属性名严禁命中 `FORBIDDEN_SUBWINDOW_APIS`（不使用 `saveData`/`loadData`/`setAutoLaunch`/`getAutoLaunch`/`setLocale`/`setCurrentSkin`，改为 `getSnapshot`、`changeSettingsLocale`、`changeAutoLaunch` 等语义化名称）。
    - [x] `webContents` 拦截 `setWindowOpenHandler` 与 `will-navigate`。
    - [x] [PetWindow.js](../../src/main/windows/PetWindow.js) 同时将 `windowManager.settingsWindow` 纳入 `getPetSubWindows()`（覆盖 Windows 全屏 RDP 避让恢复与 `keepPetWindowOnTop()` 焦点层级排序）及 `closed` 清理链。
  - **Verification**:
    - [x] 新增单元测试（如 `test/settingsWindow.test.js`）覆盖 `SettingsWindow` 生命周期、单实例复用与 `initialTab` 切换、`workArea` 夹紧、macOS `app.focus`、置顶脉冲、关窗兜底落盘、`returnFocusToSettings` 双路径隔离（设置窗唤起回传 vs 托盘唤起不误抢）、`PetWindow` 子窗集合与连带关闭及 preload 安全边界（不含 `FORBIDDEN_SUBWINDOW_APIS` 禁用键名）。
    - [x] 聚焦验证命令：`node --test test/settingsWindow.test.js test/subWindowActivation.test.js test/subWindowPreloadSecurity.test.js test/petWindow.test.js`（先测新增与相关窗口基座，不跑全量 `npm test`）。
  - **Dependencies**: None
  - **Files likely touched**:
    - `src/main/windows/WindowManager.js`
    - `src/main/windows/SettingsWindow.js` (NEW)
    - `src/main/windows/SkinSelectorWindow.js`
    - `settingsPreload.js` (NEW)
    - `src/main/windows/PetWindow.js`

- [x] **Task 1.2: 后端服务小幅适配与 `SettingsService` 聚合控制器**
  - **Description**: 适配 [PetScaleService.js](../../src/main/services/PetScaleService.js)、[LocaleService.js](../../src/main/services/LocaleService.js)、[WeatherSyncController.js](../../src/main/services/WeatherSyncController.js)、[BreakReminderController.js](../../src/main/services/BreakReminderController.js)、[AutoLaunchService.js](../../src/main/services/AutoLaunchService.js) 与 [SkinService.js](../../src/main/services/SkinService.js)；新建 `src/main/services/SettingsService.js` 统一注册与鉴权设置窗口的全部 IPC。
  - **Acceptance criteria**:
    - [x] `AutoLaunchService.js` 导出 `isLoginItemPendingApproval` / `getAutoLaunchState()`（返回 `{ enabled, preference, pendingApproval }`）；`SettingsService.getSnapshot()` 汇总 7 项配置当前值 + 当前已确认皮肤展示名/ID + 平台能力标识（嵌套字段 `windowAwareness.supported`、`autoLaunch.pendingApproval`；顶层同名冗余字段已在 R5 移除）。
    - [x] `PetScaleService.js` 将 `confirm(percent)` 扩展为可选接收 `percent` 并提供 `flushPreview()`（兼容既有无参 `confirm()` 契约）；`BreakReminderController.js` 新增内聚方法 `updateBreakReminderSettings(patch)`（校验 `intervalMinutes` 属于 `BREAK_REMINDER_TRAY_INTERVALS` 并保留 `idleResetMinutes`）；`WeatherSyncController.js` 抽取并导出纯方法 `setCityName(cityName)` 与 `getCitySettings()`（及状态变更回调），保留两套防竞态计数逻辑与并发测试契约。
    - [x] 每条 `settings-*` IPC handler 均首先调用 `isSenderWindow(event, windowManager.settingsWindow)`，拒绝一切非设置窗或已销毁窗口的调用；异步设置接口返回最新权威快照以支持异常回滚。
    - [x] `settings-preview-pet-scale` 实时缩放、`settings-commit-pet-scale` 持久化（规范化 `50–150`）；`settings-set-weather-enabled`、`settings-set-city-name`（委托 `WeatherSyncController.setCityName` 并保留未设城市开启后设城市立即同步语义）、`settings-set-break-reminder`（委托 `BreakReminderController.updateBreakReminderSettings`）、`settings-set-screensaver`、`settings-set-window-awareness`、`settings-set-locale`、`settings-set-auto-launch`、`settings-open-skin-selector` 均经主进程边界校验并同步刷新托盘/主窗口。
    - [x] `SkinService` 仅在皮肤**确认提交**后向 `settingsWindow` 推送当前皮肤更新（忽略 `isPreview` 预览阶段及取消回滚过程）。
    - [x] 语言切换逻辑统一收口至 `LocaleService.changeLocale(lang)`，向所有存活窗口（含 `settingsWindow`）与托盘广播。
  - **Verification**:
    - [x] 新增单元测试（如 `test/settingsService.test.js`）覆盖所有 `settings-*` IPC 的 sender 越权拦截、参数归一化/非法输入拒绝、`autoLaunch` 失败快照返回、`AutoLaunchService.getAutoLaunchState()` 传递、`BreakReminderController.updateBreakReminderSettings` 合法间隔校验与 `idleResetMinutes` 保留、`PetScaleService.confirm(percent)`/`flushPreview()`、城市编码竞态与皮肤仅确认刷新不响应预览。
    - [x] 聚焦验证命令：`node --test test/settingsService.test.js test/petScaleService.behavior.test.js test/weatherSyncController.behavior.test.js test/ipcPermissionMatrix.test.js`，Phase 1 收尾执行 `npm test`。
  - **Dependencies**: Task 1.1
  - **Files likely touched**:
    - `src/main/services/SettingsService.js` (NEW)
    - `src/main/services/PetScaleService.js`
    - `src/main/services/LocaleService.js`
    - `src/main/services/WeatherSyncController.js`
    - `src/main/services/BreakReminderController.js`
    - `src/main/services/AutoLaunchService.js`
    - `src/main/services/SkinService.js`
    - `src/main/AppLifecycle.js`

### Phase 2: 统一设置窗口 UI/UX 实现与三语 I18N
- [x] **Task 2.1: 补齐三语字典（`zh` / `en` / `ja`）**
  - **Description**: 在 [i18n.js](../../src/data/i18n.js) 为统一设置窗口补充完整三语文案（窗口标题、3 个 Tab 名称、各分组标签、皮肤快捷卡片、平台不可用提示、macOS 登录项授权提示、未设城市引导提示、时间单位等），复用既有校验/提示文案（如 `citySetting*`、`petScale*`、`lang*`）。
  - **Context / Line Slices（防 Context Flooding，勿整文件读取 1,222 行）**:
    - 仅读取并编辑三语 `ui` 对象切片：`zh.ui`（[i18n.js#L22-L180](../../src/data/i18n.js#L22-L180)，建议插在 `L66–L120` 附近）、`en.ui`（[i18n.js#L414-L572](../../src/data/i18n.js#L414-L572)，`L458–L512` 附近）、`ja.ui`（[i18n.js#L807-L965](../../src/data/i18n.js#L807-L965)，`L851–L905` 附近），跳过后半段角色对话气泡台词。
  - **Acceptance criteria**:
    - [x] `zh` / `en` / `ja` 的 `ui` key 完全对齐，无空值、无 raw key 回退、无 `U+FFFD`。
    - [x] 聚焦验证命令：`node --test test/i18nKeyCompleteness.test.js test/i18n.test.js test/i18nFallback.test.js test/citySettingI18n.test.js` 全通过。
  - **Dependencies**: None
  - **Files likely touched**:
    - `src/data/i18n.js`

- [x] **Task 2.2: `settings.html` / `settings.css` / `settingsWindow.js` 前端实现**
  - **Description**: 基于 `.xianxia-panel` 与 `settings-calligraphy.css` 构建顶部 3 标签页的设置界面，满足 `/game-ui-ux` 布局、键盘导航、非颜色状态编码、即时自动保存与事件驱动更新规范。
  - **Context / Pattern to Follow**:
    - HTML 与面板结构参照原 `src/pet-scale.html`；标题栏拖拽区、关闭按钮与玉金滑块样式复用原 `src/pet-scale.css`；城市输入行、确认按钮、状态脉冲与 `prefers-reduced-motion` 复用原 `src/city-setting.css`。
    - Fake-DOM 渲染测试参照原 `test/petScaleWindowRenderer.behavior.test.js` 的 `vm.runInNewContext` 桩模式。
  - **Acceptance criteria**:
    - [x] 严格 CSP（含 `font-src 'self'`），引入 `index.css` 与 `settings-calligraphy.css`，标题使用 `class="settings-calligraphy-title"`；`.settings-tabpanel` 配置 `flex: 1; min-height: 0; overflow-y: auto; scrollbar-gutter: stable;` 及水墨细滚动条兜底，防止多语言分段换行或提示展开时纵向裁切。
    - [x] 顶部 3 个 Tab（`role="tablist"`）采用 **Roving `tabindex`**（激活 Tab `tabindex="0"`，其余 `tabindex="-1"`），支持鼠标点击与键盘左右箭头切换，初始聚焦激活 Tab（且窗口已打开时接收 `initialTab` 同步切换与移交焦点）；各控件支持 `Tab` 遍历与 `:focus-visible` 样式；全局 `Esc` 关闭窗口带输入法组合态守卫（`if (event.isComposing || event.keyCode === 229) return;`）；城市输入框内 `Enter` 触发验证。
    - [x] 开关控件使用 `role="switch"` + `aria-checked` 并具备滑块位移与边框对比；分段按钮使用 `aria-pressed="true"`（或 `role="radiogroup"` / `role="radio"`），选中态叠加加粗字重、实线玉金边框与内部微光/指示条（非颜色编码）。
    - [x] **外观与交互 Tab**：体型滑块 `input` 事件触发 `previewPetScale` 实时缩放、`change` 事件（松手或键盘步进）立即 `commitPetScale` 持久化、「恢复默认」一键回 `100%`；皮肤卡片展示当前已确认皮肤名，点击 `#settings-open-skin-button` 唤起独立选肤窗并支持选肤窗关闭后接收焦点回传；界面感知开关在不支持平台禁用。
    - [x] **陪伴与守护 Tab**：天气开关打开且城市为空时保持开关开启态（`enabled: true`），自动聚焦城市输入框并显示引导；城市输入框与确认按钮始终可用，验证通过后立即自动触发首次天气同步；久坐提醒与高甜屏保开关关闭时，子档位按钮使用原生 `disabled`（配合分组 `aria-disabled="true"`），使 `Tab` 键直接跳过。
    - [x] **系统偏好 Tab**：三语分段切换即时刷新当前设置窗及全应用文案；开机自启开关在 `pendingApproval: true` 时展示提示，异步操作失败时依据主进程权威快照回弹。
    - [x] 全程零 `innerHTML`，包含 `@media (prefers-reduced-motion: reduce)`；切换 `en` / `ja` 时窗口内容区不截断、不溢出。
  - **Verification**:
    - [x] Fake-DOM 行为测试（如 `test/settingsWindowRenderer.behavior.test.js`）覆盖：3 Tab Roving `tabindex` 切换与键盘导航、`Esc` 关闭及 IME `isComposing`/`keyCode === 229` 拦截、体型滑块 `input` 预览 / `change` 立即提交 / 重置、未设城市开天气同步保持开启并自动聚焦、城市验证状态流转、子档位原生 `disabled` 联动、`autoLaunch` 失败回弹、语言实时刷新、外部状态推送同步及选肤窗关闭焦点回传。
    - [x] 聚焦验证命令：`node --test test/settingsWindowRenderer.behavior.test.js test/cspHardening.test.js test/htmlInjectionHardening.test.js test/reducedMotionCss.test.js test/calligraphyDecoration.test.js`，Phase 2 收尾执行 `npm test`。
  - **Dependencies**: Task 1.2, Task 2.1
  - **Files likely touched**:
    - `src/settings.html` (NEW)
    - `src/settings.css` (NEW)
    - `src/settingsWindow.js` (NEW)

### Phase 3: 托盘菜单瘦身、旧独立窗口退场与测试矩阵迁移（原子提交闭环）
> 原子性约束：下线旧窗口文件（Task 3.2）与迁移引用旧窗口的单元测试/集成测试（Task 3.3）**必须在同一次提交闭环内完成**（先更新/迁移测试或同步提交），确保 Phase 3 结束时 `npm test` 与 `npm run test:integration` 全绿，绝不允许中间提交出现 `ENOENT` 或 `MODULE_NOT_FOUND`。

- [x] **Task 3.1: 重构 `TrayManager` 菜单模板**
  - **Description**: 在 [TrayManager.js](../../src/main/TrayManager.js) 移除已迁入设置窗口的菜单项（`调整大小`、`久坐提醒`+子菜单、`高甜屏保`+子菜单、`天气同步`+`修改城市`、`界面感知`、`语言`+子菜单、`开机自动启动`），在「重置位置 / 切换屏幕」之后增加 `⚙️ 设置…`（调用 `deps.openSettingsWindow()`），保留 `🎨 选择皮肤…`、`📦 检查更新`、`❌ 退出` 等全部保留项。
  - **Acceptance criteria**:
    - [x] 托盘菜单分组结构清晰、禁用态与平台分支（macOS 多屏切换、`!app.isPackaged` 开发者工具、番茄钟隐藏时禁用暂停/隐藏）均正确保留。
    - [x] 不再直接持有重复的 `langSubmenu` 广播逻辑，也不再直接拼接 `breakReminderSettings` 写盘。
  - **Verification**:
    - [x] 聚焦验证命令：`node --test test/trayManager.test.js`（验证瘦身后托盘菜单结构、`⚙️ 设置…` 点击行为、`🎨 选择皮肤…` 保留、已迁移项不再出现）。
  - **Dependencies**: Task 2.2
  - **Files likely touched**:
    - `src/main/TrayManager.js`
    - `src/main/AppLifecycle.js`

- [x] **Task 3.2: 下线废弃的独立 `CitySettingWindow` / `PetScaleWindow` 及 `preload.js` 死通道**
  - **Description**:
    - 从 [AppLifecycle.js](../../src/main/AppLifecycle.js)、[WindowManager.js](../../src/main/windows/WindowManager.js)、[PetWindow.js](../../src/main/windows/PetWindow.js)（同步清理 `getPetSubWindows()` 与 `closed`）、[LocaleService.js](../../src/main/services/LocaleService.js) 和 [WeatherSyncController.js](../../src/main/services/WeatherSyncController.js) 移除对 `CitySettingWindow` / `PetScaleWindow` 的引用与旧 IPC。
    - 清理主窗口 [preload.js](../../preload.js) 中历史残留但从未被主窗调用的 3 个旧城市设置死方法（`getCitySettings`、`setCityName`、`closeCitySettingWindow`）。
    - 删除废弃文件：
      - `src/main/windows/CitySettingWindow.js`、`citySettingPreload.js`、`src/city-setting.html`、`src/city-setting.css`、`src/citySettingWindow.js`
      - `src/main/windows/PetScaleWindow.js`、`petScalePreload.js`、`src/pet-scale.html`、`src/pet-scale.css`、`src/petScaleWindow.js`
  - **Acceptance criteria**:
    - [x] 全局 `grep` 确认无残留死引用或孤立 IPC handler（`close-city-setting-window`、`get-city-settings`、`set-city-name`、`pet-scale-get-settings`、`pet-scale-preview`、`pet-scale-confirm`、`pet-scale-cancel` 已全面收口至 `settings-*`）。
    - [x] 确认 `PetScaleService` 面向主窗口的 `get-pet-scale` / `pet-scale-changed` 契约保持完全兼容（[ADR-047](../decisions/ADR-047-pet-scale-setting.md) 的脚底锚定、多屏 DPI 与渲染端行为零回归）。
  - **Dependencies**: Task 3.1
  - **Files likely touched**:
    - `preload.js`
    - 上述待删文件及引用方

- [x] **Task 3.3: 迁移与补全单元测试 & 集成测试（与 Task 3.2 同批提交）**
  - **Description**:
    - 更新以下强绑定旧窗口/旧通道的测试与集成桩文件，将旧窗用例平稳迁移至 `SettingsWindow` / `SettingsService` / `settingsPreload.js`（保留 `PetScaleService` 与 `WeatherSyncController` 核心行为与并发竞态覆盖）：
      - [subWindowPreloadSecurity.test.js](../../test/subWindowPreloadSecurity.test.js)（替换旧窗 preload 检查，新增 `settingsPreload.js` 与 `FORBIDDEN_SUBWINDOW_APIS` 校验）
      - [ipcPermissionMatrix.test.js](../../test/ipcPermissionMatrix.test.js)（替换旧通道为全部 `settings-*` 通道）
      - [calligraphyDecoration.test.js](../../test/calligraphyDecoration.test.js)、[reducedMotionCss.test.js](../../test/reducedMotionCss.test.js)、[indexCss.test.js](../../test/indexCss.test.js)（从 `city-setting.html`/`pet-scale.html`/`.css` 迁移至 `settings.html`/`settings.css`）
      - [subWindowActivation.test.js](../../test/subWindowActivation.test.js)、[petWindow.test.js](../../test/petWindow.test.js)（覆盖 `SettingsWindow` 脉冲激活、`getPetSubWindows()`、RDP 抑制与连带关闭）
      - [appLifecycle.behavior.test.js](../../test/appLifecycle.behavior.test.js)、[preloadSubscriptions.test.js](../../test/preloadSubscriptions.test.js)（移除旧窗模块依赖与旧城市死方法断言）
      - [weatherSyncController.behavior.test.js](../../test/weatherSyncController.behavior.test.js)（将对 `citySettingWindow` IPC 的调用迁移至 `WeatherSyncController.setCityName` / `getCitySettings` 或 `SettingsService` 委托测试，完整保留 20+ 并发用例）
      - `test/citySettingTray.test.js`、`test/citySettingWindow.test.js`、`test/petScaleWindow.test.js`、`test/petScaleWindow.behavior.test.js`、`test/petScaleWindowRenderer.behavior.test.js`（清理或重命名为 `settingsWindow*` 测试）
      - [createIntegrationHarness.js](../../test/integration/harness/createIntegrationHarness.js) 与 [petScale.integration.test.js](../../test/integration/petScale.integration.test.js)（`windowManager` 桩增加 `settingsWindow: null` 并迁移集成测试）
    - 保留并复跑 `test/petScale.test.js`、`test/petScaleMovement.behavior.test.js`、`test/petScaleService.behavior.test.js`、`test/skinTray.test.js`、`test/skinSelectorIntegration.test.js`、`test/cspHardening.test.js`、`test/htmlInjectionHardening.test.js`。
  - **Acceptance criteria**:
    - [x] 先运行聚焦回归验证迁移后测试集：`node --test test/subWindowPreloadSecurity.test.js test/ipcPermissionMatrix.test.js test/appLifecycle.behavior.test.js test/preloadSubscriptions.test.js test/petWindow.test.js test/weatherSyncController.behavior.test.js`。
    - [x] Phase 3 收尾全量验证：`npm test && npm run test:integration && npm run check:adrs` 全部通过且无 skipped 降级断言、无死文件引用报错。

### Phase 4: 文档与 ADR 同步及实机验证
- [x] **Task 4.1: 文档、ADR 与发布说明同步**
  - **Description**:
    - 新建 ADR-050（`docs/decisions/ADR-050-unified-settings-window.md`），记录托盘瘦身边界、3 Tab 架构、即时自动保存 vs 城市校验模型、安全边界及废弃独立小窗的决策取舍；同步更新 [docs/decisions/README.md](../decisions/README.md) 索引表（并标明相对 ADR-039 / ADR-047 窗口形态的演进）。
    - **按局部行号切片更新 [structure.md](../structure.md)**（该文件 ~83 KB，严禁整文件读取，仅分段读取/修改以下 5 处区间）：
      - Mermaid 架构图（[structure.md#L40-L95](../structure.md#L40-L95)）
      - 主进程目录树（[structure.md#L118-L136](../structure.md#L118-L136)）
      - 渲染进程目录树（[structure.md#L194-L204](../structure.md#L194-L204)）
      - 职责与子窗口 UI 说明（[structure.md#L290-L300](../structure.md#L290-L300) 与 [structure.md#L474-L520](../structure.md#L474-L520)）
      - ADR 索引列表（[structure.md#L635-L655](../structure.md#L635-L655)）
    - 更新 [CHANGELOG.md](../../CHANGELOG.md)（`## [Unreleased]` 下按规范分组记录变更并关联 ADR-050）。
    - 检查并更新三语说明文本（`readme_zh.txt`、`readme_en.txt`、`readme_ja.txt`）中关于托盘路径与「设置」窗口的操作指引。
  - **Acceptance criteria**:
    - [x] 聚焦验证命令：`npm run check:adrs && node --test test/docLinks.test.js` 全部通过。

- [ ] **Task 4.2: 实机与跨平台手动验收（macOS + Windows）**
  - **Automated Status**: `npm run qa:electron:smoke`、`npm test`、`npm run test:integration`、`npm run check:adrs` 与 `test/docLinks.test.js` 已在 macOS 验证通过；以下交互式与 Windows 实机项留待人工验收。
  - **Description**: 启动 `npm run dev`（及可选 `npm run qa:electron:smoke`），逐项人工验证：
    1. 托盘菜单精简后各项展示与三语切换正常；`⚙️ 设置…` 能稳定唤起并前置窗口；`🎨 选择皮肤…` 独立打开、换肤后设置窗同步刷新当前皮肤名。
    2. 体型滑块 `50%–150%` 实时脚底锚定缩放、松手持久化、重启应用保持；设置窗不长期置顶阻挡其他应用。
    3. 天气开关关闭时城市仍可预编辑验证；未设城市开天气同步自动聚焦输入框；久坐/屏保开关关闭时子档位禁用。
    4. `Tab` / 方向键 / `Esc` / `Enter` 键盘操作顺畅；切换 `zh` / `en` / `ja` 无文字截断或溢出。
    5. 主窗口退出时设置窗口随同关闭，无残留后台进程。

---

## 4. Risks & Mitigations

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| 删除 `CitySettingWindow` / `PetScaleWindow` 导致大量既有回归测试直接报错 | High | 将旧窗下线（Task 3.2）与受影响 15+ 测试及集成桩迁移（Task 3.3）纳入同一原子提交闭环内完成，先确保核心服务（`PetScaleService`、`WeatherSyncController`、`AutoLaunchService`、`BreakReminderController`）接口抽离并保留并发测试，防止任何中间提交红灯。 |
| `settingsPreload.js` 权限过宽或键名误触 `FORBIDDEN_SUBWINDOW_APIS` 破坏隔离边界（`subWindowPreloadSecurity.test.js`） | High | 设置窗不复用 `save-data` / `load-data` / `set-current-skin` / `setLocale` / `setAutoLaunch` 等禁用键名与通道，仅开放受 `isSenderWindow(settingsWindow)` 守卫的 `settings-*` 语义化通道。 |
| 拖动体型滑块时频繁写盘或关窗瞬间丢帧 / 未保存 | Med | 滑块 `input` 事件仅触发内存 `preview` 实时渲染；原生 `change`（松手或键盘步进）立即调用 `commit` 写入 `electron-store`，且 `SettingsWindow` 在 `close` 时兜底刷入未落盘的 `previewPercent`。 |
| 切换 `en` / `ja` 后 Tab 栏、分段按钮宽度溢出或 Tab 2 纵向裁切 | Med | 窗口扩至 `520×456` 并夹紧在 `workArea` 安全区内，同时采用内联城市徽章与单行 CSS Grid 等分分段控件，确保 3 标签页（含高甜屏保）免滚动展示；`.settings-tabpanel` 仍保留 `min-height: 0; overflow-y: auto; scrollbar-gutter: stable;` 水墨细滚动条兜底，并在三语下核验。 |
| 托盘已移除语言切换后，用户不慎切到陌生语言找不到入口 | Low | 设置入口在托盘保留固定齿轮图标 `⚙️`，且设置窗口三语 Tab 与系统语言分段按钮直观可见（`中文` / `English` / `日本語` 始终用各自母语展示，不随当前语言翻译）。 |

---

## 5. Verification Commands

- 全部单元测试：`npm test`
- 跨模块集成测试：`npm run test:integration`
- ADR 格式与文档链接校验：`npm run check:adrs && node --test test/docLinks.test.js`
- 开发态实机启动：`npm run dev`
- Electron 冒烟（含选肤 QA 钩子）：`npm run qa:electron:smoke`

---
## 6. Post-Review Remediation（四提交代码审核后的修复）
- [x] **R1 文档对齐**：界面感知所在标签页、`settingsAPI` 命名、城市按钮文案与三语 readme 标签页名称。
- [x] **R2 渲染端点击错误兜底与串行化**：所有设置提交经 `runSetting` 按控件串行，IPC 抛错或失败无快照时回读主进程快照，`scale-reset` 失败回滚乐观显示。
- [x] **R3 滑块拖动期间不接受快照回写**：`pointerdown` 置位，`pointerup` / `pointercancel` / `blur` / `change` 清除，避免「拖走再拖回原值不触发 `change`」导致标记卡死。
- [x] **R4 `settings-updated` 单 tick 合并推送**（`notifySettingsUpdated()` 经 `queueMicrotask` 合并）。
- [x] **R5 快照去除顶层冗余字段**（`windowAwarenessSupported`、`autoLaunchPendingApproval`）。
- [x] **R6 新增 `app.openSettingsForQA` E2E 入口**。
- [ ] **R7 清理托盘精简后的无调用方方法与孤立 i18n 键**。
