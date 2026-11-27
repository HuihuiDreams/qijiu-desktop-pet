# ADR-031: 久坐提醒设计

## Status
Accepted

## Date
2026-06-01

## Context
用户长时间使用电脑时缺少休息提示。桌宠作为始终可见的伙伴，是传达健康提醒的天然载体。

## Decision
### 核心原则

- **仅限健康提醒**：这是一个休息提示功能，不是生产力监控。
- **隐私优先**：不监听键鼠事件、不保存窗口标题/进程名/URL。
- **低侵入性**：macOS 不请求辅助功能权限；不新增常驻采样窗口。

### 技术选型

1. **计时基础**：使用 Electron 的 `powerMonitor.getSystemIdleTime()` 低频采样（默认 30 秒），累计连续活跃时间。不使用 `keyboard`/`mouse` 事件。

2. **空闲重置**：空闲超过配置阈值（默认 5 分钟）时自动归零计时器。系统锁屏/挂起事件也重置。

3. **全屏/演示延后**：
   - macOS：不做全屏检测，始终允许提醒（避免请求 Accessibility 权限）。
   - Windows：触发前检查前台窗口几何，全屏或覆盖 workArea 时延后 60 秒重试。

4. **表现**：两个小人瞬移到主显示器中心面对面，各自显示随机对话气泡。20 秒自动消失或点击小人提前关闭。

5. **配置**：通过 `electron-store` 持久化。托盘菜单可开关功能和选择间隔（30/45/60/90/120 分钟）。

### 架构边界

| 层 | 职责 |
|---|---|
| `breakReminderService.js` | 纯逻辑计时，依赖注入 powerMonitor、clock、回调 |
| `presentationGuard.js` | 按需查询，不持续采样；仅在提醒到期时调用 |
| `main.js` | 生命周期管理、IPC、配置持久化 |
| `preload.js` | `onBreakReminder` + `dismissBreakReminder` |
| `src/app.js` | 渲染表现、自动/手动消失、game loop 暂停 |

## Alternatives Considered

- **监听键鼠事件**：放弃，侵入性太高且 macOS 需要权限。
- **macOS 全屏检测**：放弃，需要 Accessibility/Input Monitoring 权限。
- **独立提醒窗口**：放弃，利用现有桌宠窗口和对话气泡系统即可。
- **精确分钟级计时**：放弃，30 秒采样足够且更省资源。

## Consequences
- 新增 2 个核心模块文件（`breakReminderService.js`、`presentationGuard.js`）与 3 个测试文件。
- 对 `main.js`、`preload.js`、`app.js`、`debug.js`、`i18n.js`、`dialogues.js`、`displayBounds.js`、`MovementSystem.js` 有增量修改。
- 提醒定位优化：通过 `displayBounds.js` 标记主显示器（`isPrimary`），确保多屏环境下桌宠始终瞬移到主屏中心进行提醒。
- 与窗口感知（Window Awareness）解耦：当用户在托盘关闭“界面感知”时，Windows 的前台窗口探测器返回 `disabled`，此时 `PresentationGuard` 会安全降级，始终允许提醒打断，确保久坐提醒功能不受感知开关影响。
- 不影响现有宠物普通移动、交互、皮肤切换等功能。

## Amendments

### 2026-10-06：修复 Windows 坐标转换接线（R1）

`BreakReminderController` 向统一 `PresentationGuard` 注入的适配器改为 `screen.screenToDipRect(null, rect)`，补齐 Electron 必需的首个参数。`null` 表示按前台窗口矩形选择显示器，避免绑定跨屏的桌宠窗口。原单参数调用会抛错，使提醒守卫跳过演示窗口的几何保护。

新增 `test/presentationGuardWiring.test.js`，执行生产初始化接线与真实守卫，严格校验原生 API 的两个参数，并覆盖普通窗口放行、演示窗口拒绝及全屏前置拒绝。修复与验证记录见[审查复核报告 R1](../archive/code-review-recheck-2026-10-06.md#r1--p1screentodiprect-接线遗漏首个参数)。

### 2026-11-13：设置变更与时钟回拨边界（审核复核 L6）
`updateSettings()` 在提醒被关闭（`enabled: false`）时会取消仍在等待重试的延后定时器并清除 `reminderPending`，不再等 60 秒后的回调自行收尾；采样间隔 `rawElapsed` 增加 `Math.max(0, …)`，系统时钟回拨时按 0 累计，避免 `activeMs` 被扣减。详见 [审核复核 L6](../archive/code-review-audit-verification-2026-11-13.md)。

### 2026-11-20：混合 DPI 间距缩放、自发互动取消与目标坐标同步
`StageGeometry.getCenteredPairLayout()` 在未传入 `options.visualScale` 时优先回退目标区域 `area.scaleRatio`（再回退 `1`），使混合 DPI 主屏上的久坐提醒双宠间距与视觉体型一致；`BreakReminderPresenter.handleTriggered()` 注入并调用 `interactionSystem?.cancel?.()` 终止进行中的自发互动并同步 `pet.targetX` / `pet.targetY`，避免互动状态冻结或结束提醒后宠物沿旧目标漂移。`InteractionSystem.cancel()` 会清零冷却，因此 presenter 在取消后补回冷却：被打断的互动恢复完整 `INTERACTION_COOLDOWN`，未互动时保留原剩余冷却，避免提醒结束后面对面的两只宠物立刻再次触发互动。

### 2026-11-27：全屏 RDP 推迟、macOS 防休眠断言与模块位置
- 「Consequences」中「关闭界面感知时 `PresentationGuard` 始终允许提醒」不再完全成立：Windows 全屏 RDP 原生隐藏主窗口期间，`BreakReminderController` 在调用守卫前先以 `fullscreen-rdp` 推迟提醒（`4bb3af8`），沿用 60 秒重试，避免提醒发往不可见窗口（[ADR-018](./ADR-018-always-on-top-reliability.md)）。其余情况下采样为 `disabled` 时仍放行。
- 「Decision」第 3 条「macOS 不做全屏检测」已不准确：开启窗口感知时，macOS 每 30 秒读取 `pmset -g assertions`，存在 `PreventUserIdleDisplaySleep` 断言（全屏视频、演示等）时守卫按 `fullscreen` 推迟提醒（[ADR-030](./ADR-030-window-awareness.md)）。该方式不需要辅助功能权限；provider 不可用或尚无采样时仍放行。
- 「Decision」第 5 条的开关与间隔已从托盘移到统一设置窗口「陪伴与守护」标签页（[ADR-050](./ADR-050-unified-settings-window.md)）。
- 「架构边界」表中的 `presentationGuard.js` 现为 `src/main/services/PresentationGuard.js`，`main.js` 的生命周期、IPC 与配置职责现由 `src/main/services/BreakReminderController.js` 承担，渲染表现位于 `src/ui/BreakReminderPresenter.js`（[ADR-042](./ADR-042-main-and-renderer-module-decomposition.md)）。
