# Implementation Plan: Window Awareness

## Overview

Window Awareness 让桌宠能够感知当前活动窗口，并在活动窗口顶部边缘“行走”或“坐下”。当前应用使用一个覆盖虚拟桌面的透明 `BrowserWindow`，宠物坐标和移动范围都在这个大窗口的渲染坐标系内。因此 MVP 不建议先改窗口架构，而是把活动窗口顶部转换成一条临时的 `walkArea/platform`，交给现有 `MovementSystem` 和渲染循环消费。

目标体验：

- 当用户切换到普通应用窗口时，宠物可以移动到该窗口标题栏/顶部边缘附近。
- 宠物可以沿活动窗口顶部水平走动，或在顶部坐下/停留。
- 当活动窗口最小化、全屏、不可用、太小，或是本应用自己的窗口时，宠物回退到现有桌面行走逻辑。
- 不影响现有拖拽、点击穿透、多显示器、状态面板、互动动画和皮肤系统。

## Current Codebase Fit

- `main.js` 已经负责显示器信息、主透明窗口尺寸和 IPC，可在这里采样活动窗口信息。
- `displayBounds.js` 已经提供屏幕坐标到主窗口相对坐标的基础模型，可扩展活动窗口矩形转换逻辑。
- `preload.js` 是渲染进程唯一安全入口，需要暴露活动窗口订阅或拉取 API。
- `src/systems/MovementSystem.js` 已经支持多个 `walkAreas`，但当前 area 是二维矩形；窗口顶部更像窄平台，需要补充平台选择策略。
- `src/app.js` 是游戏循环入口，适合维护 `WindowAwarenessSystem` 状态，并决定是否把窗口平台注入 `MovementSystem`。
- `src/pet/Pet.js` 当前只有 `idle`/`walking` 等状态。MVP 可先复用 `idle` 表示坐下/停留，后续再加专用 `perching` 或 `sitting` 状态和素材。

## Architecture Decisions

- 活动窗口感知放在主进程。渲染进程不直接访问 OS 窗口 API。
- 活动窗口能力拆成共享合同层和平台 provider。共享层定义统一数据结构、几何转换、IPC 和 renderer 行为；平台 provider 只负责各 OS 的真实窗口采样。
- Windows 先实现完整 provider。macOS MVP 先走 unavailable fallback，即应用正常运行、Window Awareness 不启用、移动系统回退到现有桌面 `walkAreas`。
- 后续 macOS 支持作为单独版本/ADR 处理，通过 `darwin` provider 实现，并必须包含 Accessibility 权限检测、用户授权引导、未授权 fallback 和打包验证。
- Windows MVP 默认开启 Window Awareness；macOS MVP 不启用该能力。
- 活动窗口信息使用“低频采样 + 变化推送”，当前 Windows MVP 默认 3000ms 一次，避免高频 Win32 调用。
- 坐标统一在主进程或纯函数中转换成主透明窗口内坐标，再发给渲染进程。
- MVP 将窗口顶部建模为 `platform`：一个窄矩形，宽度等于活动窗口可用顶部范围，高度约为宠物脚下容忍范围。
- 不把宠物强制吸附到窗口。只有在 idle 选新目标时才有概率选择窗口平台，避免突兀瞬移。
- 两只宠物独立随机选择是否走向窗口顶部。默认体验是一只上去、另一只继续桌面移动；当时机和空间允许时，不硬性阻止两只同时坐在窗口顶部。
- 最大化窗口不生成窗口顶部 platform，行为回退到现有桌面行走逻辑。普通非最大化窗口如果生成 platform，应避开系统标题栏按钮区域。
- 窗口顶部停留第一版复用 `idle` 图。专用 sitting/perching 素材留给后续。
- 根据窗口类型触发专属台词不进入第一版 MVP，后续可单独扩展。
- 不感知密码框、窗口内容、文档标题以外的敏感内容。只需要进程名、窗口标题、bounds、状态和采样时间。

## Performance Constraints

Window Awareness 是行为功能，不是当前内存问题的主要解法。它不应增加新的 `BrowserWindow`，也不应改变现有全桌面透明窗口架构。预计内存增量应接近可忽略；真正需要控制的是活动窗口采样带来的 CPU、IPC 和抖动风险。

必须遵守的性能约束：

- 不允许在正式实现中每 500ms-1000ms 启动一次 PowerShell、cmd 或其它外部进程来获取活动窗口。高频子进程轮询会带来明显 CPU 抖动。
- 当前 Windows MVP 默认采样间隔为 3000ms；允许调试时降低到 500ms，但不应低于 500ms。
- 活动窗口信息必须先在主进程侧去抖和去重。只有 `window id`、进程、bounds、最小化/全屏状态或 platform geometry 实际变化时才推送 IPC。
- 窗口标题变化不应单独触发移动系统更新，避免浏览器/编辑器标题频繁变化造成 IPC 风暴。
- renderer 的 game loop 只能读取 `WindowAwarenessSystem` 缓存；不得每帧查询 OS API、发送 IPC 或重新计算完整显示器几何。
- `MovementSystem` 只能在 idle 重新选择目标时消费 platform，不应在活动窗口每次变化时强行改宠物目标。
- Window Awareness 关闭时，CPU、内存和现有移动行为应与当前版本基本一致。

性能验收基线：

- 开启/关闭 Window Awareness 分别记录 packaged build 下的 Electron 总内存、主进程 CPU、renderer CPU。
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

- [ ] Windows 上能获取当前前台窗口 bounds。
- [x] Windows 上能识别最大化窗口并返回 `isMaximized` 或等价状态。
- [x] 忽略本应用自己的 `BrowserWindow`、状态窗口和无标题 shell 窗口。
- [x] 采样失败时不影响桌宠主循环。
- [x] 采样频率可配置，默认不高于每 500ms 一次。
- [x] 正式路径不得通过高频启动 PowerShell/cmd/外部进程实现采样。
- [x] 主进程侧对采样结果做去重，只有可影响 platform 的字段变化时才准备推送。

**Verification:**

- [ ] 本地打开 VS Code、资源管理器、浏览器时能看到窗口信息变化。
- [ ] 连续采样 2 分钟，主进程 CPU 没有持续爬升。
- [ ] 快速切换窗口 20 次，不出现明显卡顿或推送积压。
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
- [ ] renderer reload 后不会重复注册导致多次推送。
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

#### Task 7: Let MovementSystem choose active window platforms

**Description:** 扩展 `MovementSystem`，让 idle 选择目标时有概率选择活动窗口顶部平台。平台目标应主要沿 X 轴移动，Y 保持在窗口顶部附近。

**Acceptance criteria:**

- [ ] 当 platform 可用时，宠物 idle 后有配置概率走向窗口顶部。
- [ ] 两只宠物各自独立随机选择 platform 目标；默认不会强制两只同时上窗口顶部。
- [ ] 当窗口顶部宽度足够且两只宠物都自然选中 platform 时，允许两只同时停在窗口顶部，并避免目标重叠。
- [ ] 宠物不会被瞬移到窗口顶部，仍然通过现有 walking 状态移动。
- [ ] 到达平台后 idle 停留一段时间，表现为“坐下/停在窗口上”。
- [x] platform 消失时，宠物能回到现有 display walkAreas。
- [x] 活动窗口变化不会立即强制覆盖正在 walking、dragging、interacting 或 busy 的宠物目标。
- [ ] 每帧 update 不创建大量临时对象，不遍历历史窗口样本。

**Verification:**

- [x] 单元测试覆盖 platform 目标选择、目标 clamp、platform 消失 fallback。
- [x] 测试覆盖 platform 快速变化时，宠物只在下一次 idle 选目标时采用新平台。
- [ ] 手动测试：切换活动窗口，宠物会自然走到窗口顶部。
- [x] `npm test` 通过。

**Dependencies:** Task 6

**Files likely touched:**

- `src/systems/MovementSystem.js`
- `src/app.js`
- `src/data/config.js`
- `test/movementSystem.test.js`

**Estimated scope:** Medium

#### Task 8: Add sitting/perching presentation

**Description:** 为窗口顶部停留增加轻量表现。MVP 复用 idle 帧；后续有素材时再加专用 sitting/perching sprite。

**Acceptance criteria:**

- [ ] 平台停留时不会触发普通随机走动太快离开。
- [ ] 可通过配置控制坐下时间范围。
- [ ] 第一版直接使用 idle 图，不要求新增 sitting 素材，也不出现文字 fallback。

**Verification:**

- [ ] SpriteView fallback 测试覆盖新状态。
- [ ] 手动测试：站在窗口顶部时不闪烁、不抖动。
- [ ] `npm test` 通过。

**Dependencies:** Task 7

**Files likely touched:**

- `src/pet/Pet.js`
- `src/pet/SpriteView.js`
- `src/data/config.js`
- `test/skinManager.test.js`

**Estimated scope:** Medium

### Checkpoint: MVP

- [ ] 活动窗口切换后，宠物可以走到窗口顶部。
- [x] 最小化、全屏、无效窗口、本应用窗口不会破坏现有移动。
- [x] 多显示器下坐标正确。
- [ ] 拖拽、右键菜单、状态面板、互动动画仍可用。
- [ ] 开启/关闭 Window Awareness 的 packaged build CPU/内存对比已记录。
- [ ] 快速切换窗口时没有 IPC 堆积、宠物抖动或动画掉帧。
- [x] `npm test` 和 unsigned dir build 通过。

### Phase 4: User Controls and Polish

#### Task 9: Add tray/debug controls

**Description:** 增加开关和调试入口，方便测试和用户关闭该能力。

**Acceptance criteria:**

- [x] 托盘菜单可开启/关闭 Window Awareness。
- [x] Windows MVP 默认开启 Window Awareness，用户可通过托盘关闭。
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

## Test Scenarios

- VS Code 活动窗口在主屏：宠物能走到窗口顶部并停留。
- 资源管理器在副屏且副屏有负坐标：platform 坐标正确。
- 浏览器最大化但非全屏：回退到普通桌面行走；全屏视频也应回退。
- 活动窗口最小化或切到桌面：宠物回到普通桌面行走。
- 拖拽宠物时切换窗口：拖拽优先，不被系统吸附。
- 打开状态面板：宠物不把状态面板当活动窗口平台。
- 关闭 Window Awareness：现有移动行为保持不变。
- macOS MVP：应用正常启动，Window Awareness 返回 unavailable fallback，宠物保持普通桌面行走。

## Resolved Decisions

- Windows MVP 默认开启，托盘提供关闭入口。
- macOS 支持作为单独版本/ADR 处理，当前 MVP 使用 unavailable fallback。
- 窗口顶部停留第一版复用 idle，不新增 sitting 素材。
- 两只宠物独立随机选择窗口平台；通常一只上去、另一只继续桌面移动，但允许两只在空间足够时同时坐下。
- 最大化窗口不作为 platform，回退到现有桌面行走逻辑；普通窗口平台应避开标题栏按钮区域。
- 第一版 MVP 不做“根据窗口类型说台词”，后续可考虑。

## Open Questions

- None.
