# Implementation Plan: Surface Awareness

## Overview

Surface Awareness 让桌宠能够感知当前活动窗口和系统任务栏，并在这些稳定边缘上“行走”或“坐下”。当前应用使用一个覆盖虚拟桌面的透明 `BrowserWindow`，宠物坐标和移动范围都在这个大窗口的渲染坐标系内。因此 MVP 不建议先改窗口架构，而是把活动窗口顶部、任务栏可站立边缘转换成临时的 `platform`，交给现有 `MovementSystem` 和渲染循环消费。

目标体验：

- 当用户切换到普通应用窗口时，宠物可以移动到该窗口标题栏/顶部边缘附近。
- 宠物可以沿活动窗口顶部水平走动，或在顶部坐下/停留。
- 当系统底部横向任务栏可见时，宠物可以走到任务栏上边缘附近，并沿任务栏水平走动或坐下。
- 多显示器场景下，每个有可推导任务栏边缘的显示器都可以生成自己的任务栏平台。
- 当活动窗口最小化、全屏、不可用、太小，或是本应用自己的窗口时，宠物回退到现有桌面行走逻辑。
- 当任务栏自动隐藏、位于竖向边缘、几何无法可靠推导，或平台会遮挡不可接受的系统交互时，宠物回退到现有桌面行走逻辑。
- 不影响现有拖拽、点击穿透、多显示器、状态面板、互动动画和皮肤系统。

## Current Codebase Fit

- `main.js` 已经负责显示器信息、主透明窗口尺寸和 IPC，可在这里采样活动窗口信息。
- `displayBounds.js` 已经提供屏幕坐标到主窗口相对坐标的基础模型，可扩展活动窗口矩形转换逻辑，也可从 `display.bounds` 与 `display.workArea` 的差异推导任务栏平台。
- `preload.js` 是渲染进程唯一安全入口，需要暴露活动窗口订阅或拉取 API。
- `src/systems/MovementSystem.js` 已经支持多个 `walkAreas`，但当前 area 是二维矩形；窗口顶部和任务栏边缘更像窄平台，需要补充平台选择策略。
- `src/app.js` 是游戏循环入口，适合维护 `WindowAwarenessSystem` 状态，并决定是否把窗口平台、任务栏平台注入 `MovementSystem`。
- `src/pet/Pet.js` 当前只有 `idle`/`walking` 等状态。MVP 可先复用 `idle` 表示坐下/停留，后续再加专用 `perching` 或 `sitting` 状态和素材。

## Architecture Decisions

- 活动窗口感知放在主进程。渲染进程不直接访问 OS 窗口 API。
- 活动窗口能力拆成共享合同层和平台 provider。共享层定义统一数据结构、几何转换、IPC 和 renderer 行为；平台 provider 只负责各 OS 的真实窗口采样。
- Windows 先实现完整窗口 provider。macOS MVP 先走 unavailable fallback，即应用正常运行、Surface Awareness 的窗口平台不可用，移动系统回退到现有桌面 `walkAreas`。
- 后续 macOS 支持作为单独版本/ADR 处理，通过 `darwin` provider 实现，并必须包含 Accessibility 权限检测、用户授权引导、未授权 fallback 和打包验证。
- Windows MVP 默认开启 Surface Awareness；macOS MVP 不启用窗口平台能力。
- 活动窗口信息使用“低频采样 + 变化推送”，当前 Windows MVP 默认 3000ms 一次，避免高频 Win32 调用。
- 任务栏平台不通过 active window provider 采样，而是随 `screen-info` 从 Electron display metrics 派生。任务栏位置变化、显示器变化和 DPI 变化都跟随现有显示器更新链路。
- 坐标统一在主进程或纯函数中转换成主透明窗口内坐标，再发给渲染进程。
- MVP 将窗口顶部建模为 `platform`：一个窄矩形，宽度等于活动窗口可用顶部范围，高度约为宠物脚下容忍范围。
- MVP 将任务栏建模为 `source: 'taskbar-edge'` 的平台：只支持底部横向任务栏，平台脚线对齐任务栏上边缘。
- 竖向任务栏、顶部任务栏和自动隐藏任务栏不进入默认行为。
- 不把宠物强制吸附到窗口。只有在 idle 选新目标时才有概率选择窗口平台，避免突兀瞬移。
- 不把宠物强制吸附到任务栏。任务栏平台应参与同一套 idle 目标选择，但默认权重低于活动窗口平台，避免宠物长期占据任务栏。
- 窗口平台和任务栏平台共用一个 Surface Awareness 托盘开关，不单独拆开。
- 窗口平台和任务栏平台同时可用时，窗口平台优先；任务栏平台作为低频补充目标。
- 两只宠物独立随机选择是否走向窗口顶部。默认体验是一只上去、另一只继续桌面移动；当时机和空间允许时，不硬性阻止两只同时坐在窗口顶部。
- 两只宠物可以分别选择窗口或任务栏平台；当平台宽度足够时允许同一平台上同时停留，并避免目标重叠。
- 最大化窗口不生成窗口顶部 platform，行为回退到现有桌面行走逻辑。普通非最大化窗口如果生成 platform，应避开系统标题栏按钮区域。
- 窗口顶部停留第一版复用 `idle` 图。专用 sitting/perching 素材留给后续。
- 根据窗口类型触发专属台词不进入第一版 MVP，后续可单独扩展。
- 不感知密码框、窗口内容、文档标题以外的敏感内容。只需要进程名、窗口标题、bounds、状态和采样时间。

## Performance Constraints

Surface Awareness 是行为功能，不是当前内存问题的主要解法。它不应增加新的 `BrowserWindow`，也不应改变现有全桌面透明窗口架构。预计内存增量应接近可忽略；真正需要控制的是活动窗口采样带来的 CPU、IPC 和抖动风险。

必须遵守的性能约束：

- 不允许在正式实现中每 500ms-1000ms 启动一次 PowerShell、cmd 或其它外部进程来获取活动窗口。高频子进程轮询会带来明显 CPU 抖动。
- 当前 Windows MVP 默认采样间隔为 3000ms；允许调试时降低到 500ms，但不应低于 500ms。
- renderer 的 `WINDOW_AWARENESS_PLATFORM_TTL_MS` 必须大于主进程采样间隔；当前为 6500ms，用于覆盖两个采样周期并避免 platform 缓存周期性过期。
- 活动窗口信息必须先在主进程侧去抖和去重。只有 `window id`、进程、bounds、最小化/全屏状态或 platform geometry 实际变化时才推送 IPC。
- 窗口标题变化不应单独触发移动系统更新，避免浏览器/编辑器标题频繁变化造成 IPC 风暴。
- renderer 的 game loop 只能读取 `WindowAwarenessSystem` 缓存；不得每帧查询 OS API、发送 IPC 或重新计算完整显示器几何。
- `MovementSystem` 只能在 idle 重新选择目标时消费 platform，不应在活动窗口每次变化时强行改宠物目标。
- 任务栏平台只在显示器 metrics 变化时重算，不应被活动窗口采样频率驱动。
- Surface Awareness 关闭时，CPU、内存和现有移动行为应与当前版本基本一致。

性能验收基线：

- 开启/关闭 Surface Awareness 分别记录 packaged build 下的 Electron 总内存、主进程 CPU、renderer CPU。
- 开启后 idle 状态不应出现持续 CPU 爬升。
- 快速切换活动窗口时，宠物不能抖动、来回改目标或明显掉帧。
- unsigned dir build 必须通过，避免 native dependency 破坏打包。

## Proposed Data Shape

主进程发送给渲染进程：

```js
{
  active: true,
  sampledAt: 1770000000000,
  source: 'active-window',
  window: {
    id: 'native-window-id-or-null',
    title: 'Visual Studio Code',
    ownerName: 'Code.exe',
    bounds: { x: 120, y: 80, width: 1400, height: 900 },
    isMinimized: false,
    isMaximized: false,
    isFullScreen: false
  },
  platform: {
    x: 120,
    y: 56,
    width: 1400,
    height: 48,
    source: 'active-window-top'
  }
}
```

注意：`platform.x/y/width/height` 应该是主透明窗口内的相对坐标，不是 OS 屏幕绝对坐标。

显示器信息可额外携带任务栏平台：

```js
{
  width: 1920,
  height: 1080,
  walkAreas: [
    { x: 0, y: 0, width: 1920, height: 1040, scaleRatio: 1 }
  ],
  taskbarPlatforms: [
    {
      x: 0,
      y: 1016,
      width: 1920,
      height: 48,
      source: 'taskbar-edge',
      displayId: 'primary'
    }
  ]
}
```

后续如果窗口平台和任务栏平台需要同时参与选择，renderer 可以把它们合并成 `surfacePlatforms` 数组传给移动系统；旧的 `platform` 字段保留为活动窗口 MVP 的兼容入口。

不可用或未支持平台的 fallback shape：

```js
{
  active: false,
  sampledAt: 1770000000000,
  source: 'unavailable',
  reason: 'unsupported-platform',
  window: null,
  platform: null
}
```

renderer 收到 `platform: null` 时必须保持现有桌面行走逻辑，不报错、不改变宠物位置、不触发窗口顶部目标。

## Task List

### Phase 1: Discovery and Contracts

#### Task 1: Define active window provider boundary

**Description:** 新增一个主进程侧 provider 边界，用于获取当前活动窗口信息。先定义接口和 fake provider 测试，不急着绑定真实 OS API。

**Acceptance criteria:**

- [x] 存在 `getActiveWindowInfo()` 风格的 provider 接口。
- [x] provider 返回标准化对象：`title`、`ownerName`、`bounds`、`isMinimized`、`isMaximized`、`isFullScreen`、`sampledAt`。
- [x] provider 失败时返回可识别的 unavailable 状态，而不是抛到渲染进程。

**Verification:**

- [x] 单元测试覆盖 provider 成功、失败、缺失 bounds。
- [x] `npm test` 通过。

**Dependencies:** None

**Files likely touched:**

- `main.js`
- `test/activeWindowProvider.test.js`

**Estimated scope:** Small

#### Task 2: Add active window geometry helpers

**Description:** 在纯函数中处理活动窗口矩形校验、屏幕坐标到主窗口坐标转换，以及顶部平台矩形生成。

**Acceptance criteria:**

- [x] 能把 OS 绝对坐标窗口 bounds 转换为主透明窗口内坐标。
- [x] 能根据宠物尺寸生成顶部平台：`y = windowTop - petFootOffset`，并限制在显示器 workArea 内。
- [x] 太小、离屏、最小化、最大化、全屏、无效 bounds 的窗口会被过滤。
- [ ] 普通非最大化窗口生成 platform 时避开系统标题栏按钮区域。
- [x] 多显示器和负坐标场景有测试。

**Verification:**

- [x] 新增测试覆盖主屏、副屏、负坐标、副屏缩放、窗口部分出屏、最大化窗口过滤。
- [x] `npm test -- --test-name-pattern "active window"` 通过。

**Dependencies:** Task 1

**Files likely touched:**

- `displayBounds.js`
- `test/displayBounds.test.js`
- `test/activeWindowGeometry.test.js`

**Estimated scope:** Medium

#### Task 2b: Add taskbar platform geometry helpers

**Description:** 在 `displayBounds.js` 中从 `display.bounds` 和 `display.workArea` 推导底部横向任务栏平台，并转换成主透明窗口内坐标。竖向和顶部任务栏不生成平台。

**Acceptance criteria:**

- [x] 能从 `bounds.bottom > workArea.bottom` 的显示器推导底部横向任务栏区域。
- [x] 生成 `source: 'taskbar-edge'` 的平台，并让平台脚线对齐任务栏上边缘。
- [x] 平台宽度、高度、最小可用宽度和宠物脚下偏移可配置。
- [x] 自动隐藏任务栏、竖向任务栏、顶部任务栏或无效 display metrics 不生成平台。
- [x] 多显示器场景下，每个符合条件的显示器都可生成独立任务栏平台。

**Verification:**

- [x] 单元测试覆盖主屏底部任务栏、副屏底部任务栏、负坐标显示器、无任务栏差异、竖向任务栏过滤、自动隐藏/厚度过小过滤。
- [x] `npm test -- --test-name-pattern "taskbar platforms"` 通过。

**Dependencies:** Task 2

**Files likely touched:**

- `displayBounds.js`
- `test/displayBounds.test.js`
- `test/taskbarPlatformGeometry.test.js`

**Estimated scope:** Medium

### Checkpoint: Contract

- [x] 活动窗口数据结构稳定。
- [x] 坐标转换不依赖真实 OS API 也能测试。
- [x] 无效窗口都有明确 fallback。

### Phase 2: Main Process Integration

#### Task 3: Add platform provider selection and unavailable fallback

**Description:** 在主进程建立平台 provider 选择层，根据 `process.platform` 选择 Windows provider、macOS provider 或 unavailable provider。MVP 中 Windows 以外的平台先返回稳定 fallback。

**Acceptance criteria:**

- [x] 存在 `createActiveWindowProvider()` 或等价工厂函数。
- [x] `process.platform === 'win32'` 时选择 Windows provider。
- [x] `process.platform === 'darwin'` 时 MVP 返回 unavailable fallback，并标记 `reason: 'unsupported-platform'` 或 `reason: 'permission-required'` 的扩展空间。
- [x] Linux 和其它平台返回 unavailable fallback。
- [x] fallback 不触发移动系统更新、不抛到渲染进程、不影响现有桌面行走。

**Verification:**

- [x] 单元测试覆盖 win32、darwin、linux/unknown 的 provider 选择。
- [x] 单元测试覆盖 unavailable fallback data shape。
- [x] `npm test -- --test-name-pattern "active window"` 通过。

**Dependencies:** Task 1, Task 2

**Files likely touched:**

- `main.js`
- `test/activeWindowProvider.test.js`
- `test/mainWindowAwareness.test.js`

**Estimated scope:** Small

#### Task 4: Implement Windows active window sampling

**Description:** 在主进程实现 Windows 活动窗口采样。优先评估成熟 npm 包；如果引入 native dependency 会影响安装包，则改为 PowerShell/Win32 helper 或轻量 Node native boundary。实现前需要确认 CI 和 electron-builder 能通过。

**Acceptance criteria:**

- [x] Windows 上能获取当前前台窗口 bounds。
- [x] Windows 上能识别最大化窗口并返回 `isMaximized` 或等价状态。
- [x] 忽略本应用自己的 `BrowserWindow`、状态窗口和无标题 shell 窗口。
- [x] 采样失败时不影响桌宠主循环。
- [x] 采样频率可配置，默认不高于每 500ms 一次。
- [x] 正式路径不得通过高频启动 PowerShell/cmd/外部进程实现采样。
- [x] 主进程侧对采样结果做去重，只有可影响 platform 的字段变化时才准备推送。

**Verification:**

- [ ] 本地打开 VS Code、资源管理器、浏览器时能看到窗口信息变化。
- [x] 连续采样 2 分钟，主进程 CPU 没有持续爬升。
- [x] 快速切换窗口 20 次，不出现明显卡顿或推送积压。
- [x] `npm test` 通过。
- [x] `npx electron-builder --win --dir --config.win.signAndEditExecutable=false` 通过。

**Dependencies:** Task 3

**Files likely touched:**

- `main.js`
- `package.json`
- `package-lock.json`
- `test/mainWindowAwareness.test.js`

**Estimated scope:** Medium

#### Task 5: Expose IPC subscription to renderer

**Description:** 通过 `preload.js` 暴露安全的 `onActiveWindowInfo(callback)` 或 `getActiveWindowInfo()`，主进程在窗口信息变化时推送。

**Acceptance criteria:**

- [x] 渲染进程只能收到已标准化的窗口、平台信息或 unavailable fallback。
- [x] IPC 不暴露任意 shell、路径或原始 native handle 操作。
- [x] renderer reload 后不会重复注册导致多次推送。
- [x] IPC 推送是变化驱动的，不按固定采样频率无条件广播。
- [x] 单独的窗口标题变化不会触发 platform 更新推送。
- [x] macOS MVP 上 IPC 返回 unavailable fallback，不影响应用启动和普通移动。

**Verification:**

- [x] preload 测试覆盖 API 暴露。
- [x] main IPC 测试覆盖推送数据 shape 和 unavailable fallback。
- [x] 测试覆盖相同 platform 重复采样时不会重复推送。
- [x] `npm test` 通过。

**Dependencies:** Task 4

**Files likely touched:**

- `preload.js`
- `main.js`
- `test/preload.test.js`
- `test/mainWindowAwareness.test.js`

**Estimated scope:** Small

### Phase 3: Movement Behavior

#### Task 6: Introduce WindowAwarenessSystem in renderer

**Description:** 新增渲染进程系统，保存最近一次活动窗口平台、过期时间、可用性和 debug 状态。它只负责状态，不直接移动宠物。

**Acceptance criteria:**

- [x] 接收 IPC 推送并保存当前 platform。
- [x] 超过 TTL 未更新时自动视为 unavailable。
- [x] 收到 unavailable fallback 时返回 `null` platform，并保留现有桌面行走行为。
- [x] 支持配置开关：Windows MVP 默认开启；macOS MVP 返回 unavailable fallback。
- [x] 提供 `getCurrentPlatform()` 给移动系统或 app 循环读取。
- [x] `getCurrentPlatform()` 为 O(1) 缓存读取，不触发 IPC 或几何重算。

**Verification:**

- [x] fake clock 测试覆盖更新、过期、无效平台。
- [x] 测试覆盖关闭开关和 unavailable fallback 后不再返回 platform。
- [x] `npm test -- --test-name-pattern "WindowAwarenessSystem"` 通过。

**Dependencies:** Task 5

**Files likely touched:**

- `src/systems/WindowAwarenessSystem.js`
- `src/app.js`
- `test/windowAwarenessSystem.test.js`

**Estimated scope:** Medium

#### Task 6b: Carry taskbar platforms through screen-info

**Description:** 让主进程在发送 `screen-info` 时附带 `taskbarPlatforms`，renderer 缓存这些稳定平台，并和活动窗口平台一起提供给移动系统。任务栏平台跟随显示器信息变化，不走活动窗口 IPC。

**Acceptance criteria:**

- [x] `main.js` 在 `sendScreenInfo()` 中发送 `taskbarPlatforms`。
- [x] `src/app.js` 缓存最新 `taskbarPlatforms`，并在每次 game loop 或 screen-info 更新后传给移动系统。
- [x] renderer reload 后不会重复注册或丢失任务栏平台。
- [x] Surface Awareness 关闭时，窗口平台和任务栏平台都停止参与移动目标选择。

**Verification:**

- [x] 单元测试或源码测试覆盖 `screen-info` 包含任务栏平台。
- [ ] 手动测试显示器设置变化后任务栏平台刷新。
- [x] `npm test` 通过。

**Dependencies:** Task 2b, Task 6

**Files likely touched:**

- `main.js`
- `src/app.js`
- `src/systems/MovementSystem.js`
- `test/displayBounds.test.js`
- `test/windowAwarenessRendererIntegration.test.js`

**Estimated scope:** Medium

#### Task 7: Let MovementSystem choose surface platforms

**Description:** 扩展 `MovementSystem`，让 idle 选择目标时有概率选择活动窗口顶部平台或任务栏平台。平台目标应主要沿 X 轴移动，Y 保持在平台脚线附近。

**Acceptance criteria:**

- [x] 当 platform 可用时，宠物 idle 后有配置概率走向窗口顶部。
- [x] 当 taskbar platform 可用时，宠物 idle 后有配置概率走向任务栏上边缘。
- [x] 活动窗口平台和任务栏平台使用同一套 `surfacePlatforms` 选择逻辑，窗口平台优先，任务栏平台低频出现。
- [x] 两只宠物各自独立随机选择 platform 目标；默认不会强制两只同时上窗口顶部。
- [x] 当窗口顶部宽度足够且两只宠物都自然选中 platform 时，允许两只同时停在窗口顶部，并避免目标重叠。
- [x] 宠物不会被瞬移到窗口顶部，仍然通过现有 walking 状态移动。
- [x] 到达平台后 idle 停留一段时间，表现为“坐下/停在窗口或任务栏上”。
- [x] platform 消失时，宠物能回到现有 display walkAreas。
- [x] 活动窗口变化不会立即强制覆盖正在 walking、dragging、interacting 或 busy 的宠物目标。
- [x] 每帧 update 不创建大量临时对象，不遍历历史窗口样本。

**Verification:**

- [x] 单元测试覆盖 platform 目标选择、目标 clamp、platform 消失 fallback。
- [x] 测试覆盖 platform 快速变化时，宠物只在下一次 idle 选目标时采用新平台。
- [ ] 手动测试：切换活动窗口，宠物会自然走到窗口顶部。
- [x] 手动测试：底部横向任务栏可见时，宠物会自然走到任务栏上边缘并停留。
- [x] `npm test` 通过。

**Dependencies:** Task 6, Task 6b

**Files likely touched:**

- `src/systems/MovementSystem.js`
- `src/app.js`
- `src/data/config.js`
- `test/movementSystem.test.js`

**Estimated scope:** Medium

#### Task 8: Add sitting/perching presentation

**Description:** 为窗口顶部和任务栏停留增加轻量表现。MVP 复用 idle 帧；后续有素材时再加专用 sitting/perching sprite。

**Acceptance criteria:**

- [x] 平台停留时不会触发普通随机走动太快离开。
- [ ] 可通过配置控制坐下时间范围。
- [x] 第一版直接使用 idle 图，不要求新增 sitting 素材，也不出现文字 fallback。
- [x] 任务栏停留不改变主透明窗口 click-through 默认策略，避免挡住任务栏点击。

**Verification:**

- [x] SpriteView fallback 测试覆盖新状态。
- [ ] 手动测试：站在窗口顶部时不闪烁、不抖动。
- [x] `npm test` 通过。

**Dependencies:** Task 7

**Files likely touched:**

- `src/pet/Pet.js`
- `src/pet/SpriteView.js`
- `src/data/config.js`
- `test/skinManager.test.js`

**Estimated scope:** Medium

### Checkpoint: MVP

- [x] 活动窗口切换后，宠物可以走到窗口顶部。
- [x] 底部横向任务栏可见时，宠物可以走到任务栏上边缘。
- [x] 最小化、全屏、无效窗口、本应用窗口不会破坏现有移动。
- [x] 多显示器下坐标正确。
- [ ] 拖拽、右键菜单、状态面板、互动动画仍可用。
- [ ] 开启/关闭 Surface Awareness 的 packaged build CPU/内存对比已记录。
- [ ] 快速切换窗口时没有 IPC 堆积、宠物抖动或动画掉帧。
- [x] `npm test` 和 unsigned dir build 通过。

### Phase 4: User Controls and Polish

#### Task 9: Add tray/debug controls

**Description:** 增加开关和调试入口，方便测试和用户关闭该能力。

**Acceptance criteria:**

- [x] 托盘菜单可开启/关闭 Surface Awareness。
- [x] Windows MVP 默认开启 Surface Awareness，用户可通过托盘关闭。
- [x] debug 暴露当前 active window/platform 信息。
- [x] 关闭后完全回到现有桌面行走逻辑。
- [x] macOS MVP 上菜单不暴露该开关，或明确显示该功能暂不可用。

**Verification:**

- [x] 托盘菜单测试覆盖新开关。
- [ ] 手动测试开关立即生效。
- [x] `npm test` 通过。

**Dependencies:** Task 6, Task 7

**Files likely touched:**

- `main.js`
- `preload.js`
- `src/app.js`
- `src/debug.js`
- `test/skinTray.test.js`

**Estimated scope:** Medium

#### Task 10: Document macOS follow-up provider

**Description:** 记录 macOS `darwin` provider 的后续实现边界，包括 Accessibility 权限、授权引导、未授权 fallback、隐私说明和打包验证。

**Acceptance criteria:**

- [x] ADR 或计划文档说明 macOS 支持是单独版本/ADR 范围，不是简单替换 provider，需要用户授权 Accessibility。
- [x] 未授权时返回 unavailable fallback，不弹错误、不影响普通桌宠行为。
- [x] 文档说明 macOS provider 后续需要单独测试多显示器、全屏、最小化和本应用窗口过滤。

**Verification:**

- [x] 文档包含 `darwin provider`、Accessibility 权限和 fallback 行为。
- [x] 与 Task 3 的 provider 选择逻辑一致。

**Dependencies:** Task 3

**Files likely touched:**

- `docs/structure.md`
- `docs/decisions/ADR-025-window-awareness.md`

**Estimated scope:** Small

#### Task 11: Tune behavior and document release notes

**Description:** 根据手动体验调整平台选择概率、停留时长、顶部偏移和边界规则，并补充文档。

**Acceptance criteria:**

- [x] 配置项集中在 `CONFIG` 或明确的系统默认值中。
- [x] `docs/structure.md` 或 ADR 记录主进程窗口感知边界。
- [x] `CHANGELOG.md` 有用户可读条目。
- [x] release notes 明确 Windows 默认开启首发支持，macOS 暂走普通桌面行走 fallback。
- [x] 第一版不加入“根据窗口类型说台词”的行为或配置。

**Verification:**

- [x] 文档和代码配置一致。
- [x] release preflight 相关测试通过。

**Dependencies:** Task 9, Task 10

**Files likely touched:**

- `src/data/config.js`
- `docs/structure.md`
- `docs/decisions/ADR-025-window-awareness.md`
- `CHANGELOG.md`

**Estimated scope:** Small

### Phase 5: macOS Dock Support

#### Task 12: Enable bottom Dock platform on macOS

**Description:** 由于任务栏平台（Taskbar Platform）的推导仅依赖于 `display.workArea` 与 `display.bounds` 的几何差值，不需要操作系统级权限。在 macOS 上解除系统判断限制，使宠物能够感知并走上底部的 macOS Dock。

**Acceptance criteria:**

- [x] `main.js` 中的 `sendScreenInfo()` 解除对 `win32` 的限制，允许 `darwin` 计算 `taskbarPlatforms`。
- [x] 托盘菜单中的 `Surface Awareness` 开关解除仅 `win32` 可用的限制。在 macOS 上开启该功能时，由于 `activeWindowProvider` 仍为 unavailable，其只控制 Dock 的平台推导。
- [x] 在 `displayBounds.js` 中继续保持仅支持底部横向 Dock（`bottomTaskbarHeight`）的逻辑。

**Verification:**

- [x] 测试运行并在主进程中无报错。
- [x] 手动验证：在 macOS 上且 Dock 位于底部且不自动隐藏时，宠物能够停留于 Dock 上边缘。Dock 在两侧或自动隐藏时正常回退至桌面行走逻辑。
- [x] 修正 `test/mainWindowAwareness.test.js` 和 `test/skinTray.test.js` 中关于 macOS 开关不可用的过期断言。

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Windows 前台窗口 API 不稳定或引入 native dependency 影响打包 | High | 先做 provider 边界和 fake tests；真实 provider 单独一 task；每次引入依赖后立刻跑 unsigned dir build |
| macOS 窗口 bounds 读取需要 Accessibility 权限，导致功能不可用或体验割裂 | High | macOS MVP 先 unavailable fallback；后续 `darwin` provider 单独实现权限检测、授权引导和未授权 fallback |
| 高频 PowerShell/外部进程轮询导致 CPU 抖动 | High | 正式路径禁止高频子进程采样；优先 native/Win32 provider 或常驻 helper；Windows MVP 采样间隔默认 3000ms |
| IPC 无条件广播导致 renderer 负载和消息堆积 | Medium | 主进程去重，仅 platform 相关字段变化时推送；标题变化不触发移动更新 |
| gameLoop 中做 OS 查询或复杂几何计算 | High | renderer 只读 `WindowAwarenessSystem` 缓存；几何转换放在采样/推送阶段 |
| 坐标系混乱，尤其多显示器、负坐标、DPI 缩放 | High | 把转换逻辑放纯函数并覆盖现有 displayBounds 测试风格 |
| 宠物站到本应用透明窗口或状态窗口上，形成自我追踪 | Medium | 主进程过滤本应用 BrowserWindow 标题/进程/窗口 id |
| 活动窗口频繁变化导致宠物抖动 | Medium | 采样去抖；platform TTL；只在 idle 重新选目标时采用新平台 |
| 窗口顶部太窄或靠近屏幕边缘导致宠物卡住 | Medium | 最小宽度过滤；目标 clamp；platform 消失后回退 display walkAreas |
| 影响点击穿透和拖拽 | Medium | 不改变主透明窗口 click-through 策略；只改宠物目标位置 |
| 敏感窗口标题被保存或展示 | Medium | 不持久化活动窗口标题；debug 仅开发态展示；日志避免记录完整标题 |
| 任务栏自动隐藏导致平台几何不稳定 | Medium | 第一版不支持自动隐藏任务栏；厚度过小或 workArea 差异不明确时不生成平台 |
| 竖向或顶部任务栏导致宠物可见区域不足 | Medium | 只支持底部横向任务栏；其它方向不生成平台 |
| 宠物停在任务栏上影响用户点击图标 | High | 保持默认点击穿透；只在宠物交互 hover 时短暂接管鼠标；任务栏平台低频出现 |
| 多显示器任务栏策略不一致 | Medium | 从每个 display 的 `bounds/workArea` 独立推导，不假设只有主屏有任务栏 |

## Test Scenarios

- VS Code 活动窗口在主屏：宠物能走到窗口顶部并停留。
- 资源管理器在副屏且副屏有负坐标：platform 坐标正确。
- 浏览器最大化但非全屏：回退到普通桌面行走；全屏视频也应回退。
- 活动窗口最小化或切到桌面：宠物回到普通桌面行走。
- 拖拽宠物时切换窗口：拖拽优先，不被系统吸附。
- 打开状态面板：宠物不把状态面板当活动窗口平台。
- Windows 底部横向任务栏可见：宠物能走到任务栏上边缘并横向移动。
- 多显示器都有底部横向任务栏：每个显示器都能生成独立任务栏平台。
- 任务栏自动隐藏、顶部停靠或竖向停靠：不生成任务栏平台，回退普通桌面行走。
- 关闭 Surface Awareness：窗口平台和任务栏平台都停止参与目标选择，现有移动行为保持不变。
- macOS MVP：应用正常启动，窗口平台返回 unavailable fallback，宠物保持普通桌面行走。

## Resolved Decisions

- Windows MVP 默认开启，托盘提供关闭入口。
- macOS 支持作为单独版本/ADR 处理，当前 MVP 使用 unavailable fallback。
- 窗口顶部停留第一版复用 idle，不新增 sitting 素材。
- 任务栏停留第一版复用 idle，不新增 sitting 素材。
- 两只宠物独立随机选择窗口平台；通常一只上去、另一只继续桌面移动，但允许两只在空间足够时同时坐下。
- 任务栏平台与窗口平台共享移动系统的窄平台模型，但来源独立：任务栏来自 display metrics，窗口来自 active window provider。
- 任务栏平台和窗口平台共用一个 Surface Awareness 托盘开关。
- 窗口平台和任务栏平台同时可用时，窗口平台优先，任务栏平台低频出现。
- 任务栏只支持底部横向形态；顶部或竖向任务栏不生成平台。
- 最大化窗口不作为 platform，回退到现有桌面行走逻辑；普通窗口平台应避开标题栏按钮区域。
- 第一版 MVP 不做“根据窗口类型说台词”，后续可考虑。

## Open Questions

- None.
