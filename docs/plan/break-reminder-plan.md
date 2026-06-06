# 久坐提醒 MVP 实施计划

> 状态：Proposed
> 最后更新：2026-06-01

## Overview

实现一个默认开启的久坐提醒：用户连续活跃 60 分钟后，岳七和沈九瞬移到主显示器中间附近，各说一句提醒用户起身活动的话；系统空闲 5 分钟以上视为已休息并重置连续活跃计时。用户可以在托盘关闭功能，也可以调整提醒间隔，单位为分钟。

这个功能只读取系统级"空闲时长/空闲状态"，不监听键盘内容、鼠标轨迹、点击目标、窗口标题或浏览器 URL。MVP 的目标是做一个可信、低权限、低打扰的健康提醒，而不是生产力监控。

## MVP Behavior

- 默认开启。
- 默认提醒间隔为 60 分钟，可通过托盘菜单调整。
- 托盘固定候选值为 30、45、60、90、120 分钟；MVP 不提供 15 分钟选项。
- 系统空闲 5 分钟以上视为用户已经休息，连续活跃计时清零。
- 触发提醒后重置连续活跃计时器；如果用户继续活跃不休息，下一个 interval 到达时再次提醒。例如间隔 60 分钟时，连续使用 3 小时会在第 60、120、180 分钟各提醒一次。
- 提醒时暂停普通游走，最多展示 20 秒；用户点击小人或提醒气泡后可提前收起。提醒期间把两只小人瞬移到主显示器中心附近，并显示两句对话：岳七一句、沈九一句。对话从提醒文案池中随机选取，保持新鲜感。
- 如果用户隐藏桌宠，则不提示，也不在重新显示后补弹上一次提醒。
- Windows：如果用户处于全屏应用或演示场景，则自动延后提醒，等退出该场景后再重新判断。
- macOS：不做全屏检测（避免触发隐私权限），提醒始终正常触发。
- 如果用户暂停移动、窗口未加载完成或屏幕信息不可用，则不强行打扰；记录状态并等下一轮活跃计时。

## Platform Implementation

### Shared Electron Strategy

使用 Electron 主进程的 `powerMonitor` 作为唯一活跃度来源。官方 API 要点：

- `powerMonitor.getSystemIdleTime()` 返回系统空闲秒数。
- `powerMonitor.getSystemIdleState(idleThreshold)` 返回 `active`、`idle`、`locked` 或 `unknown`。
- `lock-screen` / `unlock-screen` 事件支持 Windows 和 macOS。
- `suspend` / `resume` 可用于处理系统睡眠导致的时间跳变。

参考：Electron `powerMonitor` 官方文档
https://www.electronjs.org/docs/latest/api/power-monitor/

全屏/演示延后不属于活跃度判断，单独封装为 `PresentationGuard`。它只回答"现在是否适合弹提醒"，不参与连续活跃计时，不保存窗口标题、进程名、URL 或历史记录。MVP 中 `PresentationGuard` 只在 Windows 上做全屏检测；macOS 不做全屏检测，始终返回可打断。

### Windows

Windows 版在 `main.js` 中直接使用 Electron `powerMonitor`：

- `app.whenReady()` 后启动 `BreakReminderService`。
- 每 30 秒采样一次：
  - `idleSeconds = powerMonitor.getSystemIdleTime()`
  - `idleState = powerMonitor.getSystemIdleState(300)`
- 当 `idleSeconds < 60` 且状态不是 `locked` 时，累计连续活跃时间。
- 当 `idleSeconds >= 300` 或状态为 `idle` / `locked` 时，视为已休息，清零连续活跃计时。
- 监听 `lock-screen`、`suspend` 时立即暂停/清零计时。
- 监听 `unlock-screen`、`resume` 时重新开始下一段连续活跃计时。
- 触发提醒前调用 `PresentationGuard`：
  - 如果前台窗口接近单个显示器 bounds 且覆盖 workArea，可视为全屏或演示场景。
  - Windows 可复用现有 `activeWindowProvider.js` 的前台窗口 bounds 能力，但 reminder 侧只读取几何信息和 `isFullScreen`，不保存标题、应用名或路径。
  - 若检测到全屏/演示，提醒进入短延后，不发送到 renderer。

Windows 不需要新增全局键盘/鼠标 hook，不需要辅助功能权限，不需要读取前台窗口。这样更不容易被误判为监控软件或恶意行为。

### macOS

macOS 版同样优先使用 Electron `powerMonitor`，保持与 Windows 一致的主进程实现：

- `app.whenReady()` 后启动同一个 `BreakReminderService`。
- 使用 `getSystemIdleTime()` 和 `getSystemIdleState(300)` 判断活跃/空闲/锁屏。
- 监听 `lock-screen`、`unlock-screen`、`suspend`、`resume`。
- 可额外监听 macOS 专有的 `user-did-resign-active` / `user-did-become-active`，用于登录会话切换时暂停或恢复计时。
- **macOS 不做全屏检测**：`PresentationGuard` 在 macOS 上始终返回 `canInterrupt = true`。在不申请 Accessibility / Screen Recording / Input Monitoring 权限的前提下，无法可靠检测其他应用的全屏状态，因此 MVP 直接跳过。

macOS 不使用 Accessibility API，不申请"辅助功能"权限，不使用 `globalShortcut` 或原生输入 hook。若 `getSystemIdleState()` 返回 `unknown`，MVP 采取保守策略：不触发提醒，只继续等待下一轮可用状态。

## Architecture Decisions

- 新增主进程服务 `breakReminderService.js`（项目根目录，与 `activeWindowProvider.js`、`displayBounds.js` 同级），负责计时、配置、系统空闲状态采样和 IPC 事件发送。
- Renderer 只负责表现：收到提醒事件后瞬移宠物、展示气泡、短暂停止普通移动。
- 提醒触发后重置连续活跃计时器，下一个 interval 到达时再次提醒，直到用户休息（空闲 5 分钟）。
- 配置保存在 `electron-store`，新增允许保存的 store key，例如 `breakReminderSettings`。
- 托盘是 MVP 的唯一设置入口，不做额外设置页。
- 新增 `PresentationGuard`（项目根目录）用于提醒前的全屏/演示延后判断，和 `BreakReminderService` 解耦。MVP 中 `PresentationGuard` 只在 Windows 上做全屏检测，macOS 始终返回可打断。
- `BreakReminderService` 平时只做低频 idle 采样，默认 30 秒一次，最小采样间隔不低于 10 秒。
- `PresentationGuard` 只在提醒到期前检查一次（仅 Windows）；若需要延后重试，重试间隔不低于 60 秒，避免额外常驻前台窗口采样。
- Renderer 收到提醒后通过 `break-reminder-dismissed` 回传主进程，主进程据此确认提醒已展示并维护计时器状态。
- 不在 renderer `requestAnimationFrame` 中读取系统状态或前台窗口状态。
- 不在每次 idle 采样时写入 `electron-store`；只在用户修改设置时保存。
- 不复用 `activeWindowProvider.js` 判断工作状态。久坐提醒只关心连续使用电脑，不关心用户在用什么软件。
- Windows 可复用最小化的前台窗口几何能力判断全屏，但不保存、不展示、不分类窗口内容。macOS 不做全屏检测。
- 不监听键盘和鼠标。隐私边界写入文档，后续实现时也要保持这个边界。

## Performance Constraints

- 无提醒、无设置变更时，额外 CPU 占用应接近 0；主进程只做低频 timer 和 `powerMonitor` 查询。
- `powerMonitor.getSystemIdleTime()` / `getSystemIdleState()` 是常规采样路径；不得引入高频键鼠 hook 或 renderer 轮询。
- 前台窗口几何检测只用于 Windows `PresentationGuard` 的"是否延后提醒"判断，不做持续采样，不保留历史。macOS 不做全屏检测。
- 若 Windows 复用 `activeWindowProvider.js`，提醒侧只在到期时调用，不额外启动第二个 10 秒采样器。
- 提醒表现复用现有宠物 DOM、气泡和移动系统，不新增全屏遮罩、复杂 layout 或独立高频动画循环。
- 手动 QA 需要观察任务管理器/活动监视器：无提醒待机时 CPU 不应出现持续可见增长。

## Proposed Data Model

持久化配置（保存到 `electron-store`）：

```js
{
  enabled: true,
  intervalMinutes: 60,
  idleResetMinutes: 5
}
```

运行时状态（不持久化，进程内存中维护）：

```js
{
  activeMs: 0,          // 当前连续活跃毫秒数
  lastReminderAt: 0     // 上次提醒的时间戳，用于计时器重置
}
```

建议约束：

- `intervalMinutes` 最小 5，最大 240。
- 托盘 MVP 只暴露 30、45、60、90、120 分钟。
- `idleResetMinutes` MVP 固定 5，不在托盘暴露。
- 旧数据缺字段时使用默认值。
- `lastReminderAt` 为运行时状态，不写入 `electron-store`；应用重启后计时器自然归零。

## Task List

### Phase 1: 主进程计时基础

#### Task 1: 新增 BreakReminderService 纯逻辑

**Description:** 新增一个可单测的主进程服务，注入 `powerMonitor`、时钟和 timer 实现，输出 `reminder-due` 事件或回调。

**Acceptance criteria:**
- [x] 默认启用，默认间隔 60 分钟。
- [x] 连续活跃达到配置分钟数时触发提醒，触发后重置连续活跃计时器。
- [x] 如果用户继续活跃不休息，下一个 interval 到达时再次提醒（例如 60 分钟间隔，3 小时连续使用会在 60/120/180 分钟各提醒一次）。
- [x] 空闲达到 5 分钟后清零连续活跃计时。
- [x] 提醒被 `PresentationGuard` 延后时不会重复发送 renderer 事件。
- [x] 默认采样间隔为 30 秒，配置或测试环境中不得低于 10 秒。

**Verification:**
- [x] 新增 fake clock 单测覆盖 active、idle、locked、unknown。
- [x] `node --test test/breakReminderService.test.js`

**Dependencies:** None

**Files likely touched:**
- `breakReminderService.js`（项目根目录）
- `test/breakReminderService.test.js`

**Estimated scope:** Medium

#### Task 2: 接入 Electron powerMonitor

**Description:** 在 `main.js` 中启动服务，读取 Windows/macOS 共享的 `powerMonitor` 状态，处理锁屏、解锁、睡眠和恢复事件。

**Acceptance criteria:**
- [x] `app.whenReady()` 后启动服务。
- [x] `lock-screen` / `suspend` 暂停或清零连续活跃计时。
- [x] `unlock-screen` / `resume` 后重新开始下一段计时。
- [x] 非 Windows/macOS 平台安全降级，不触发提醒。

**Verification:**
- [ ] fake `powerMonitor` 集成测试覆盖 Windows/macOS 事件。
- [x] `npm test`

**Dependencies:** Task 1

**Files likely touched:**
- `main.js`
- `breakReminderService.js`
- `test/breakReminderService.test.js`

**Estimated scope:** Medium

#### Task 3: 新增 PresentationGuard 延后判断（Windows-only 全屏检测）

**Description:** 新增提醒前置守卫，用于判断当前是否处于全屏或演示场景。它不负责活跃计时，只返回 `canInterrupt` / `deferReason`。Windows 上基于前台窗口 bounds 判断全屏；macOS 始终返回 `canInterrupt = true`，不做全屏检测。

**Acceptance criteria:**
- [x] Windows 可基于前台窗口 bounds / `isFullScreen` 判断全屏并延后提醒。
- [x] macOS 始终返回 `canInterrupt = true`，不做全屏检测，不引入任何隐私权限请求。
- [x] Windows 无法可靠判断时采取保守延后策略，并在下一轮重新检查。
- [x] 不保存窗口标题、进程名、URL 或历史记录。
- [x] 只在提醒到期或延后重试时运行（仅 Windows），延后重试间隔不低于 60 秒。

**Verification:**
- [x] fake provider 单测覆盖 Windows can interrupt、fullscreen defer、unknown defer。
- [x] 单测覆盖 macOS 始终 canInterrupt。
- [x] `node --test test/presentationGuard.test.js`

**Dependencies:** Task 1

**Files likely touched:**
- `presentationGuard.js`（项目根目录）
- `activeWindowProvider.js`
- `test/presentationGuard.test.js`

**Estimated scope:** Medium

### Checkpoint: 计时基础

- [x] 不需要键鼠监听。
- [x] 不需要 macOS Accessibility 权限。
- [x] Windows/macOS 行为路径在测试中都有覆盖。
- [x] macOS 不做全屏检测，PresentationGuard 始终返回可打断。
- [x] Windows 全屏/演示延后不读取或保存用户内容。
- [x] 平时没有额外前台窗口常驻采样器。

### Phase 2: 配置与托盘入口

#### Task 4: 保存提醒配置

**Description:** 使用 `electron-store` 保存 `breakReminderSettings`，并把 key 加入主进程 store 白名单。

**Acceptance criteria:**
- [x] 首次启动使用默认开启和 60 分钟。
- [x] 读取到非法配置时自动回退默认值。
- [x] 设置变更后立即影响下一轮计时。
- [x] idle 采样不会写入 `electron-store`。

**Verification:**
- [x] 配置 normalize 单测覆盖缺字段、非法分钟数、关闭状态。
- [x] `npm test`

**Dependencies:** Task 1

**Files likely touched:**
- `main.js`
- `breakReminderService.js`
- `test/breakReminderService.test.js`

**Estimated scope:** Small

#### Task 5: 增加托盘菜单控制

**Description:** 在托盘中增加"久坐提醒 开/关"和提醒间隔分钟选项。MVP 使用固定候选值，避免复杂输入窗口。

**Acceptance criteria:**
- [x] 托盘可切换启用/关闭。
- [x] 托盘可选择 30、45、60、90、120 分钟。
- [x] 托盘不提供 15 分钟选项。
- [x] 当前间隔以 radio checked 形式展示。
- [x] 菜单文案进入 i18n 字典。

**Verification:**
- [x] `skinTray.test.js` 或新增托盘测试覆盖菜单项状态。
- [x] `npm test`

**Dependencies:** Task 4

**Files likely touched:**
- `main.js`
- `src/data/i18n.js`
- `test/skinTray.test.js`

**Estimated scope:** Medium

### Checkpoint: 可配置 MVP

- [x] 用户能在托盘关闭功能。
- [x] 用户能以分钟为单位调整提醒间隔。
- [x] 重启后配置保留。

### Phase 3: Renderer 提醒表现

#### Task 6: 暴露安全 IPC

**Description:** 通过 `preload.js` 暴露 `onBreakReminder(callback)`，renderer 只能接收提醒事件，不直接访问 `powerMonitor` 或 Node API。

**Acceptance criteria:**
- [x] 主进程发送 `break-reminder-triggered`。
- [x] Renderer 通过 `break-reminder-dismissed` 回传主进程，通知提醒已展示或被用户关闭。
- [x] preload 返回 unsubscribe，避免重复监听。
- [x] IPC payload 只包含必要字段，例如 `triggeredAt`、`intervalMinutes`。

**Verification:**
- [x] preload/API 相关测试覆盖事件订阅。
- [x] `npm test`

**Dependencies:** Task 2, Task 3

**Files likely touched:**
- `main.js`
- `preload.js`
- `test/mainBreakReminder.test.js`

**Estimated scope:** Small

#### Task 7: 小人瞬移到主显示器中间并说话

**Description:** Renderer 收到提醒后，暂停普通移动，把岳七和沈九瞬移到主显示器中心附近，展示两句休息提醒对话。对话文案从提醒文案池中随机选取。

**Acceptance criteria:**
- [x] 两只小人瞬移到主显示器可行走区域中心附近，分别站在中心左右。
- [x] 多显示器环境下始终使用主显示器（`screen.getPrimaryDisplay()` 对应的 walkArea）。
- [x] 岳七和沈九各显示一句提醒文案，从文案池中随机选取，保持新鲜感。
- [x] 提醒最多展示 20 秒。
- [x] 用户点击小人或提醒气泡后，提醒立即消失，通过 `break-reminder-dismissed` 通知主进程，恢复普通移动。
- [x] 桌宠隐藏时不展示提醒，也不在恢复显示后补弹。
- [x] 提醒期间不触发普通闲聊或状态警告打断。
- [x] 提醒结束后恢复普通移动。

**Verification:**
- [x] 增加 renderer 集成测试或 debug 方法验证坐标和气泡调用。
- [x] 手动检查多显示器和不同 DPI 下主显示器中心位置合理。
- [x] `npm test`

**Dependencies:** Task 6

**Files likely touched:**
- `src/app.js`
- `src/data/dialogues.js`
- `src/ui/DialogBubble.js`
- `test/dialogBubble.test.js`

**Estimated scope:** Medium

#### Task 8: 调试入口与手动触发

**Description:** 增加仅开发环境可用的调试入口，便于不用等待 60 分钟就触发提醒。

**Acceptance criteria:**
- [x] DevTools 可调用 `window.__DEBUG_BREAK_REMINDER.trigger()` 或等价方法。
- [x] 调试触发走同一条 renderer 表现路径。
- [x] 打包环境不暴露危险能力。

**Verification:**
- [x] 手动触发后观察小人移动和气泡。
- [x] `npm test`

**Dependencies:** Task 7

**Files likely touched:**
- `src/app.js`
- `src/debug.js`

**Estimated scope:** Small

### Checkpoint: 端到端提醒

- [x] 主进程能触发提醒。
- [x] renderer 能展示岳七和沈九两句对话。
- [x] 提醒不会破坏鼠标穿透、暂停、隐藏、皮肤切换。

### Phase 4: 跨平台 QA 与文档

#### Task 9: Windows QA

**Description:** 在 Windows 上验证默认路径和锁屏/睡眠路径。

**Acceptance criteria:**
- [ ] 连续活跃达到短测试间隔后触发提醒。
- [ ] 空闲 5 分钟后重置连续活跃。
- [ ] 锁屏后不触发提醒，解锁后重新计时。
- [ ] 睡眠/恢复后不因为时间跳变立刻误触发。
- [ ] 全屏应用或演示场景中自动延后提醒（Windows PresentationGuard），退出后再重新判断。
- [ ] 无提醒待机时任务管理器中 CPU 无持续可见增长。

**Verification:**
- [ ] 使用 1 分钟测试间隔手动验证。
- [x] `npm test`

**Dependencies:** Task 1-8

**Files likely touched:**
- None unless QA finds bugs.

**Estimated scope:** Small

#### Task 10: macOS QA

**Description:** 在 macOS 上验证同一套 `powerMonitor` 路径，并确认不触发额外权限提示。

**Acceptance criteria:**
- [ ] 启动后不请求 Accessibility、Input Monitoring 或 Screen Recording 权限。
- [ ] 连续活跃达到短测试间隔后触发提醒。
- [ ] 锁屏、切换登录会话、睡眠/恢复后计时合理。
- [ ] 若 idle state 返回 `unknown`，不误触发提醒。
- [ ] 全屏场景中提醒正常触发（macOS 不做全屏检测）。
- [ ] 无提醒待机时活动监视器中 CPU 无持续可见增长。

**Verification:**
- [ ] 使用 1 分钟测试间隔手动验证。
- [x] macOS 打包 smoke test。
- [x] `npm test`

**Dependencies:** Task 1-8

**Files likely touched:**
- None unless QA finds bugs.

**Estimated scope:** Small

#### Task 11: 更新文档和变更记录

**Description:** 行为落地后更新项目结构文档、README 或 ADR，并在提交前更新 CHANGELOG。

**Acceptance criteria:**
- [x] `docs/structure.md` 说明 `breakReminderService.js` 和 IPC 边界。
- [x] 若实现确认采用 `powerMonitor`，新增 ADR 记录"不监听键鼠"的隐私边界。
- [x] `CHANGELOG.md` 按 `Added` / `Changed` / `Fixed` / `Removed` 标题记录。

**Verification:**
- [x] 文档链接有效。
- [x] `npm test`

**Dependencies:** Task 1-10

**Files likely touched:**
- `docs/structure.md`
- `docs/decisions/ADR-031-break-reminder-privacy-boundary.md`
- `CHANGELOG.md`

**Estimated scope:** Small

## Risks and Mitigations

| Risk                             | Impact | Mitigation                                                                                                     |
| -------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| 睡眠或系统时间跳变导致误触发     | Medium | 监听 `suspend` / `resume`，恢复后重置连续活跃计时；沿用现有时间跳变思路。                                      |
| macOS 返回 `unknown` 状态        | Medium | 保守处理：不触发提醒，等待下一次有效采样。                                                                     |
| 提醒打断用户演示或全屏工作       | High   | Windows 加入 `PresentationGuard` 做全屏检测并延后；macOS 不做全屏检测，提醒正常触发。                          |
| 托盘间隔输入过于复杂             | Low    | MVP 用固定分钟选项，后续再做自定义输入。                                                                       |
| 用户误以为在监听键鼠             | High   | 文档、ADR、设置文案明确说明只读取系统空闲时长，不记录输入内容。                                                |
| 多显示器中心位置不自然           | Low    | 始终使用主显示器中心，行为可预测。                                                                             |
| 全屏检测扩大隐私边界             | Medium | Windows 只读取几何状态，不保存窗口标题、进程名、URL 或历史；macOS 不做全屏检测，无隐私风险。                   |
| 前台窗口全屏检测造成额外性能开销 | Medium | `PresentationGuard` 只在提醒到期和延后重试时运行（仅 Windows）；不启动第二个常驻采样器，延后重试不低于 60 秒。 |
| Renderer 提醒造成布局或动画开销  | Low    | 复用现有宠物 DOM 和气泡系统，20 秒内展示，点击可提前结束；不新增复杂 overlay。                                 |
| 提醒文案重复导致用户厌烦         | Low    | 维护多条提醒文案池，随机选取。                                                                                 |

## Not Doing in MVP

- 不监听键盘或鼠标事件。
- 不使用全局快捷键判断工作状态。
- 不读取活动窗口标题、进程名、URL 或屏幕内容。
- 不做番茄钟开始/暂停/完成流程。
- 不做自定义提醒文案编辑器。
- 不做复杂设置页，只使用托盘菜单。
- 不做"工作软件/娱乐网站"分类。
- macOS 不做全屏/演示检测。

## Resolved Decisions and Validation Notes

已决策：

- 固定间隔候选值为 30、45、60、90、120 分钟；不提供 15 分钟。
- 提醒最多展示 20 秒；用户点击小人或提醒气泡时提前消失。
- 用户隐藏桌宠时不提示，也不补弹隐藏期间错过的提醒。
- Windows 全屏应用或演示场景自动延后提醒。
- macOS 不做全屏检测，提醒正常触发。
- 提醒触发后重置计时器，用户继续活跃时按 interval 重复提醒。
- 宠物瞬移到主显示器中心，不走过去。
- `lastReminderAt` 为运行时状态，不持久化。
- Renderer 通过 `break-reminder-dismissed` 回传主进程。
- 提醒文案从池中随机选取，保持新鲜感。
