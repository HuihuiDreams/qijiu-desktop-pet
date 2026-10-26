# 桌宠大小调节计划

> 状态：已确认，实施中
> 最后更新：2026-10-14

## Spec Alignment

### Objective

在系统托盘菜单增加「调整大小…」入口，打开独立的仙侠风格小窗口，用 50%～150% 滑块统一等比缩放两只宠物。拖动时实时预览；「确定」持久化，「取消」/关闭窗口恢复调整前大小；「重置」把滑块拉回 100%（仍需确定才保存）。默认 100%，即当前的 `CONFIG.PET_SIZE = 96`。

### Commands

- Dev: `npm run dev`
- Test all: `npm test`
- Focused tests（示例）: `node --test test/ipcContracts.test.js test/petScale.test.js test/petRenderer.test.js`
- Build（仅在打包验证时）: `npm run build`

### Project Structure（新增 / 修改）

| 层 | 文件 | 职责 |
|---|---|---|
| 契约 | `ipcContracts.js` | `normalizePetScalePercent()`：唯一的取值校验 |
| 主进程 | `src/main/services/PetScaleService.js`（新） | 已确认值的读写（`electron-store`）、预览/确认/取消、广播 `pet-scale-changed` |
| 主进程 | `src/main/windows/PetScaleWindow.js`（新） | 设置小窗生命周期，仿 `CitySettingWindow.js` |
| 主进程 | `src/main/windows/WindowManager.js` | 新增 `petScaleWindow` 槽位 |
| 主进程 | `src/main/TrayManager.js`、`src/main/AppLifecycle.js` | 托盘入口与依赖装配 |
| Preload | `preload.js`、`petScalePreload.js`（新） | 主窗口订阅 API；小窗专用最小 API |
| Renderer | `src/pet/Pet.js`、`src/pet/PetRenderer.js`、`src/index.css`、`src/app.js` | 应用缩放、渲染尺寸、订阅变更 |
| 小窗 UI | `src/pet-scale.html` / `.css` / `src/petScaleWindow.js`（新） | 滑块、百分比、重置/确定/取消 |
| i18n | `src/data/i18n.js` | zh / en / ja 文案 |

### Boundaries

- Always：取值只在主进程校验（`normalizePetScalePercent`），所有新 IPC 通道首行做 sender 鉴权（`isSenderWindow` / `isSenderMainWindow`），并登记到 `test/ipcPermissionMatrix.test.js`。
- Always：预览不落盘；只有「确定」写 `electron-store`。
- Always：新 HTML 带 CSP，小窗 `sandbox: true`、`contextIsolation: true`、禁止导航与新窗口。
- Ask first：改变 bubble / 右键菜单 / 状态面板的字号；给番茄钟内嵌宠物加缩放；新增快捷键。
- Never：renderer 直接写 store；绕过鉴权的调试通道。

### Success Criteria

1. 未设置过时，宠物尺寸与现在逐像素一致（96px × 显示器 `scaleRatio`）。
2. 托盘出现「调整大小…」（三语），点击打开小窗；重复点击只会把已有小窗提到前面。
3. 拖动滑块时两只宠物实时等比缩放，脚底（底边中点）位置保持不动，不会被挤出屏幕。
4. 「确定」后重启应用仍保持该大小；「取消」、右上角关闭、`Esc` 都恢复到打开小窗前的大小。
5. 移动边界、碰撞/互动距离、右键菜单定位、灵气光环、天气粒子、双人互动叠加图都随尺寸正确适配。
6. `npm test` 全绿。

### Testing Strategy

以 small 单测为主（`node:test`，沿用 ADR-046 的 Electron mock 策略）：

- 纯逻辑：`normalizePetScalePercent`、`Pet.applyScale` 的锚点数学。
- Renderer：`PetRenderer` 输出的 `--pet-size` 与叠加图宽度。
- 主进程：`PetScaleService` 用 fake `ipcMain` / fake store / fake windowManager 验证状态机（预览不落盘、确认落盘、取消/关闭回滚、非法 sender 被拒）。
- 静态守卫：preload 暴露面、CSP、IPC 鉴权矩阵、i18n 键完整性、托盘菜单。
- 最后手动在 macOS（必要时 Windows）跑一遍完整流程。

每个任务按 RED → GREEN → REFACTOR 进行：先写失败测试，再写最小实现。

---

## 架构决策

### 决策 1：缩放逻辑尺寸 `pet.size`，而不是叠加到视觉 `transform: scale()`

`pet.size` 已经被 `MovementSystem`（边界/平台/跨屏）、`InteractionSystem`（互动距离）、`StageGeometry`（中心点、双宠布局）、`ContextMenu`、`WeatherParticleLayer`、`PetRenderer.spawnQiAura` 使用。只要让 `pet.size = CONFIG.PET_SIZE × percent / 100`，这些系统自动适配。

被否决的方案：把用户缩放乘进 `getVisualScaleForPet()`。改动更少，但：
- 移动系统仍按 96px 算边界 → 150% 时宠物右/下侧被裁掉，50% 时贴不到边；
- 对话气泡是宠物元素的子节点，会被一起缩到 50%（约 6px 字号），不可读。

后果（已确认）：对话气泡、右键菜单保持原字号，只跟随显示器 `scaleRatio`，不跟随用户缩放。

此决策写入 `docs/decisions/ADR-047-pet-scale-setting.md`。

### 决策 2：整数百分比作为唯一契约

IPC 与存储统一用整数百分比 `petScalePercent`（50～150，步长 5，默认 100），避免浮点比较问题。renderer 只做 `/ 100`。非法值（`null`、`NaN`、字符串、越界）在主进程归一化：非有限数 → 100，越界 → 夹到边界，其余四舍五入到 5 的倍数。

### 决策 3：预览 / 确认 / 取消状态归主进程所有

仿照皮肤选择器的 preview-confirm 流程，但更简单（无异步加载）：

```
committedPercent  ← 启动时从 store 读取（归一化）
previewPercent    ← 小窗拖动时更新，仅广播给主窗口
confirm()         → committed = preview，写 store，关闭小窗
cancel() / closed → preview = committed，广播 committed
```

小窗 `closed` 事件里未确认即回滚 —— 统一覆盖「取消」按钮、右上角关闭、`Esc`、应用退出等所有关闭路径。

### 决策 4：缩放时锚定脚底

`Pet.applyScale()` 保持底边中点不变：`x -= Δsize / 2`，`y -= Δsize`。随后调用现有 `keepPetReachable()` 夹回可行走区域。拖拽中（`pet.isDragging`）只改尺寸不移位，避免宠物从鼠标下跳走。

---

## 依赖图

```
Task 1 normalizePetScalePercent (ipcContracts)
   │
   ├── Task 4 PetScaleService (主进程状态 + store + get-pet-scale)
   │      │
   │      ├── Task 5 preload + app.js 订阅 (启动恢复)
   │      │
   │      └── Task 6 PetScaleWindow 主进程 + 小窗 preload + 预览/确认/取消 IPC
   │             │
   │             ├── Task 7 小窗 UI (html/css/js + i18n)
   │             │
   │             └── Task 8 托盘入口 (TrayManager + AppLifecycle + i18n)
   │
Task 2 Pet.applyScale ──┐
Task 3 PetRenderer + CSS ┴── Task 5
```

风险最高的是 renderer 视觉正确性（Task 2–3），放在最前面先验证。

---

## 任务列表

### Phase 1：Renderer 缩放能力（无 UI，先证明视觉可行）

#### Task 1：取值契约 `normalizePetScalePercent`

**Description：** 在 `ipcContracts.js` 增加常量 `PET_SCALE_MIN_PERCENT = 50`、`PET_SCALE_MAX_PERCENT = 150`、`PET_SCALE_STEP_PERCENT = 5`、`PET_SCALE_DEFAULT_PERCENT = 100` 与 `normalizePetScalePercent(value)`，作为主进程唯一的校验入口。

**Acceptance criteria：**
- [ ] `normalizePetScalePercent(undefined | null | NaN | 'abc')` → `100`
- [ ] `normalizePetScalePercent(10)` → `50`；`(999)` → `150`
- [ ] `normalizePetScalePercent(73)` → `75`；`(120)` → `120`

**Verification：**
- [ ] RED→GREEN：`node --test test/ipcContracts.test.js`

**Dependencies：** None
**Files：** `ipcContracts.js`、`test/ipcContracts.test.js`
**Scope：** XS

---

#### Task 2：`Pet.applyScale(percent)` 与脚底锚点

**Description：** 在 `Pet` 上新增 `applyScale(percent)`：计算 `newSize = CONFIG.PET_SIZE * percent / 100`；非拖拽时保持底边中点不变调整 `x/y`，同步 `targetX/targetY` 的相同偏移，避免行走目标错位。非有限或非正值时不做任何修改（renderer 侧的最后防线）。

**Acceptance criteria：**
- [ ] 96px、位于 (100, 200) 的宠物 `applyScale(150)` 后 `size === 144`、`x === 76`、`y === 152`（底边中点不变）
- [ ] `isDragging === true` 时只改 `size`，`x/y` 不变
- [ ] `applyScale(NaN)` 不改变任何字段

**Verification：**
- [ ] RED→GREEN：`node --test test/petScale.test.js`（新文件）

**Dependencies：** None
**Files：** `src/pet/Pet.js`、`test/petScale.test.js`
**Scope：** S

---

#### Task 3：`PetRenderer` 渲染尺寸 + 叠加图跟随缩放

**Description：** `.pet-body` 的 `96px` / `48px` 改为 `var(--pet-size, 96px)` 与 `calc(var(--pet-size, 96px) / 2)`。`PetRenderer.createPetElement` / `update` 在 `pet.size` 变化时设置 `--pet-size`（缓存 `_renderedSize`，避免每帧写样式）。`showOverlay` 的宽度与顶部偏移再乘以 `pet.size / CONFIG.PET_SIZE`（双宠均值），使亲亲/拥抱叠加图与宠物同比例。

**Acceptance criteria：**
- [ ] 默认尺寸下 `--pet-size` 为 `96px`，`.pet-body` 计算尺寸与现状一致
- [ ] `pet.size = 144` 后下一次 `update()` 写入 `--pet-size: 144px`；尺寸不变时不重复写
- [ ] 双宠 `size = 48` 时叠加图宽度为 `176 × 0.5 × visualScale`

**Verification：**
- [ ] RED→GREEN：`node --test test/petRenderer.test.js test/indexCss.test.js`
- [ ] 手动：`npm run dev`，在 DevTools 里临时对宠物调用 `applyScale(150)` / `applyScale(50)`，检查行走、拖拽、右键菜单、光环、贴边与跨屏
- [ ] 文档：新增 `ADR-047-pet-scale-setting.md`（决策 1、4）

**Dependencies：** Task 2
**Files：** `src/pet/PetRenderer.js`、`src/index.css`、`test/petRenderer.test.js`、`test/indexCss.test.js`、`docs/decisions/ADR-047-pet-scale-setting.md`
**Scope：** M

### Checkpoint 1：Renderer 能力

- [ ] `npm test` 全绿
- [ ] 默认 100% 外观与改动前无差异（截图对比）
- [ ] 50% / 150% 下移动边界、互动距离、菜单、天气粒子目测正确
- [ ] 与你确认视觉效果后再进入 Phase 2

---

### Phase 2：持久化与启动恢复（纵向切片：存了就能生效）

#### Task 4：`PetScaleService` 主进程状态与存储

**Description：** 新建 `src/main/services/PetScaleService.js`（`init(deps)` 模式，deps：`windowManager`、`StoreManager`）。启动时读取并归一化 store 键 `petScalePercent`；导出 `getCommittedPercent()`、`preview(percent)`、`confirm()`、`cancel()`；任一变更通过 `mainWindow.webContents.send('pet-scale-changed', percent)` 广播。注册 `get-pet-scale`（仅主窗口 sender）供 renderer 启动时拉取。

**Acceptance criteria：**
- [ ] store 无值或值非法 → `getCommittedPercent() === 100`
- [ ] `preview(120)` 广播 120 但不写 store；`confirm()` 写 store 为 120
- [ ] `preview(120)` 后 `cancel()` 广播回已确认值，store 不变
- [ ] 非主窗口 sender 调 `get-pet-scale` 被拒

**Verification：**
- [ ] RED→GREEN：`node --test test/petScaleService.behavior.test.js`（新）、`test/ipcPermissionMatrix.test.js`（登记 `get-pet-scale`）
- [ ] 文档：`docs/structure.md` 登记新服务

**Dependencies：** Task 1
**Files：** `src/main/services/PetScaleService.js`、`test/petScaleService.behavior.test.js`、`test/ipcPermissionMatrix.test.js`、`docs/structure.md`
**Scope：** S

---

#### Task 5：主窗口 preload + renderer 订阅 + 装配

**Description：** `preload.js` 暴露 `getPetScale()` 与 `onPetScaleChanged(cb)`（复用 `subscribeIpc`）。`app.js` 启动时拉取百分比并对两只宠物 `applyScale`，订阅变更后同样处理并调用 `keepPetReachable`。`AppLifecycle.js` 初始化 `PetScaleService`。

**Acceptance criteria：**
- [ ] preload 只新增上述两个 API，形状与现有订阅一致（返回取消订阅函数）
- [ ] 收到 `pet-scale-changed` 后两只宠物 `size` 同步更新并被夹回可见区域
- [ ] `AppLifecycle` 测试 mock 覆盖新模块，启动顺序在主窗口创建前完成 `init`

**Verification：**
- [ ] RED→GREEN：`node --test test/preloadSubscriptions.test.js test/appLifecycle.behavior.test.js`，并新增一个 renderer 订阅测试（参照 `weatherRendererSubscription.test.js`）
- [ ] 手动：在 store 里写 `petScalePercent: 150` 后重启，宠物以 150% 出现
- [ ] 文档：`CHANGELOG.md` `Unreleased / Added` 新增一条（后续任务在同一条上补充，不重复建标题）

**Dependencies：** Task 2、3、4
**Files：** `preload.js`、`src/app.js`、`src/main/AppLifecycle.js`、相关测试、`CHANGELOG.md`
**Scope：** M

### Checkpoint 2：持久化

- [ ] `npm test` 全绿
- [ ] 修改 store 值重启生效；非法值（如 `"abc"`、`999`）回落到 100 / 150

---

### Phase 3：设置小窗与托盘入口（用户可见）

#### Task 6：`PetScaleWindow` 主进程 + 小窗 preload + 预览/确认/取消 IPC

**Description：** 新建 `src/main/windows/PetScaleWindow.js`，结构仿 `CitySettingWindow.js`（透明无边框、`sandbox: true`、`setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`、焦点时短暂置顶脉冲，规避 macOS Space/全屏把窗口藏起来）。`WindowManager` 增加 `petScaleWindow`。新建 `petScalePreload.js`，只暴露 `getLocale`、`onLocaleChange`、`getPetScaleSettings`、`previewPetScale`、`confirmPetScale`、`cancelPetScale`。IPC 通道 `pet-scale-get-settings`、`pet-scale-preview`、`pet-scale-confirm`、`pet-scale-cancel` 均限定 sender 为小窗。小窗 `closed` 时若未确认则调用 `PetScaleService.cancel()`。

**Acceptance criteria：**
- [ ] 来自主窗口或其他窗口的 `pet-scale-preview` 被拒，不广播
- [ ] `pet-scale-preview('150')`、`(10)` 等非法输入经归一化后再广播
- [ ] 未确认直接关闭小窗 → 广播已确认值；确认后关闭 → 不回滚
- [ ] 重复打开只聚焦已有窗口，且不会重置「打开前」的已确认值

**Verification：**
- [ ] RED→GREEN：`node --test test/petScaleService.behavior.test.js test/subWindowPreloadSecurity.test.js test/ipcPermissionMatrix.test.js`
- [ ] 文档：`docs/structure.md` 登记新窗口与 preload

**Dependencies：** Task 4
**Files：** `src/main/windows/PetScaleWindow.js`、`src/main/windows/WindowManager.js`、`petScalePreload.js`、`src/main/services/PetScaleService.js`、相关测试
**Scope：** M

---

#### Task 7：小窗 UI

**Description：** `src/pet-scale.html` / `pet-scale.css` / `src/petScaleWindow.js`，视觉沿用 `city-setting` 的 `xianxia-panel`。内容：标题栏（含关闭按钮）、`<input type="range" min="50" max="150" step="5">`、实时百分比文本、「重置为默认」「取消」「确定」。`input` 事件即调用 `previewPetScale`；`Esc` 等同取消。i18n 键 `petScaleTitle`、`petScaleReset`、`petScaleCancel`、`petScaleConfirm`（zh / en / ja）。

**Acceptance criteria：**
- [ ] 打开时滑块与百分比显示当前已确认值
- [ ] 拖动即预览；「重置」把滑块设为 100 并预览，但不保存
- [ ] HTML 带 CSP，按钮有可读 `aria-label`，三语文案完整

**Verification：**
- [ ] RED→GREEN：`node --test test/petScaleWindow.test.js`（新，参照 `citySettingWindow.test.js`）、`test/cspHardening.test.js`、`test/i18nKeyCompleteness.test.js`
- [ ] 手动：键盘可操作（Tab、方向键、Esc）

**Dependencies：** Task 6
**Files：** `src/pet-scale.html`、`src/pet-scale.css`、`src/petScaleWindow.js`、`src/data/i18n.js`、`test/petScaleWindow.test.js`
**Scope：** M

---

#### Task 8：托盘入口

**Description：** `TrayManager` 在「选择皮肤…」下方加入 `trayPetScale`（zh「📏 调整大小…」/ en「📏 Resize Pet…」/ ja「📏 サイズ調整…」），点击调用 `deps.openPetScaleWindow()`；`AppLifecycle` 注入该依赖。

**Acceptance criteria：**
- [ ] 托盘菜单出现该项，点击触发 `openPetScaleWindow`
- [ ] 三语文案完整，`&` 等字符按现有 `trayMenuLabel` 转义

**Verification：**
- [ ] RED→GREEN：`node --test test/trayManager.test.js test/i18nKeyCompleteness.test.js test/appLifecycle.behavior.test.js`

**Dependencies：** Task 6（UI 可与 Task 7 并行）
**Files：** `src/main/TrayManager.js`、`src/main/AppLifecycle.js`、`src/data/i18n.js`、相关测试
**Scope：** S

### Checkpoint 3：完整流程

- [ ] `npm test` 全绿
- [ ] 手动验证（macOS 必做，Windows 有条件时做）：
  1. 首次启动：大小与改动前一致
  2. 托盘 →「调整大小…」→ 拖到 150% → 宠物实时变大，脚底不动
  3. 点「取消」→ 恢复 100%；再次打开拖到 60% → 点右上角关闭 → 恢复 100%；再次打开 → `Esc` → 恢复
  4. 拖到 130% →「确定」→ 退出重启 → 仍是 130%
  5. 打开小窗时切换语言 → 文案即时切换
  6. 多显示器：拖到副屏后缩放，`scaleRatio` 与用户缩放正确叠加
  7. 在全屏 App 所在 Space 打开小窗，窗口可见、可交互
  8. 150% 下双宠互动（亲亲/拥抱）叠加图与气泡位置正常
- [ ] `CHANGELOG.md`、`docs/structure.md`、ADR-047 与实现一致
- [ ] 按 `code-review-and-quality` 自查 diff 后，用 `./push.sh` 提交

---

## 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 某处硬编码 96px 未跟随 | 中 | 已检索：仅 `.pet-body`（Task 3 处理）与番茄钟内嵌宠物（明确不做） |
| 150% 时宠物被挤出可行走区域 | 中 | 脚底锚点 + 复用 `keepPetReachable()`；Checkpoint 1 手测贴边、任务栏平台 |
| 拖动滑块 IPC 频繁 | 低 | 步长 5 → 最多 21 个离散值，无需节流 |
| 关闭路径遗漏导致预览值残留 | 高 | 回滚挂在 `closed` 事件而非按钮上；Task 6 测试覆盖 |
| macOS 全屏/Space 下小窗不可见 | 中 | 复用 `CitySettingWindow` 的 `visibleOnFullScreen` + 置顶脉冲 |
| 新 IPC 通道漏鉴权 | 高 | 登记 `ipcPermissionMatrix.test.js`，测试强制首行 `isSender*` |

## 明确不做

- 宠物右键菜单入口、鼠标滚轮/快捷键缩放
- 两只宠物分别设置大小
- 番茄钟窗口内嵌宠物、屏保场景独立缩放
- 对话气泡 / 右键菜单 / 状态面板字号跟随用户缩放

## 已确认决策（2026-10-14）

1. **步长**：5%（50～150 共 21 档）。
2. **气泡与菜单字号**：不随用户缩放，只跟随显示器 `scaleRatio`。
3. **锚点**：缩放时脚底（底边中点）不动。
