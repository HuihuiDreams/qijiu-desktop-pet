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
