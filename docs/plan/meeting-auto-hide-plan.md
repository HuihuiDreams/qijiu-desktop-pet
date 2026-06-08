# 会议自动隐藏桌宠 MVP 实施计划

> 状态：Proposed
> 最后更新：2026-06-01

## Spec Alignment

### Objective

实现会议自动隐藏桌宠 MVP：当已知会议应用进入疑似会议状态时自动隐藏桌宠，会议结束并经过防抖确认后恢复；手动隐藏状态必须优先于自动隐藏。

### Commands

- Dev: `npm run dev`
- Test all: `npm test`
- Focused tests: `node --test test/meetingDetector.test.js`
- Build: `npm run build`

### Project Structure

- `meetingDetector.js`: 主进程纯检测逻辑，注入平台命令执行器和计时器。
- `main.js`: 启停 detector，并协调 `meetingHidden` 与手动 `petHidden` 状态。
- `tools/measure-meeting-udp.js`: 本机阈值测量脚本。
- `test/meetingDetector.test.js`: 检测、超时、防抖和平台 fallback 测试。
- `docs/structure.md` / `CHANGELOG.md`: 行为和架构记录。

### Code Style

使用现有 vanilla JavaScript 风格：检测器写成可注入 `execFile`、timer 和 platform 的纯服务；命令参数用数组表达，不拼 shell 字符串；状态名保持显式布尔值，如 `meetingHidden` 和 `petHidden`，避免含糊的三态标记。

### Boundaries

- Always: 只检测进程名和 UDP 连接数量，不读取窗口内容、会议标题、聊天内容或 URL。
- Always: 自动隐藏不得覆盖用户手动隐藏/显示意图。
- Always: 子进程命令必须使用 `execFile` 或等价参数化调用，避免 shell 拼接。
- Ask first: 增加新会议软件列表、引入原生模块、读取屏幕/麦克风/摄像头权限。
- Never: 为识别会议内容申请 Accessibility、Screen Recording、麦克风或摄像头权限。

### Success Criteria

- Windows/macOS 已知会议应用在达到 UDP 阈值时触发自动隐藏。
- 会议结束后经过 15 秒稳定确认再自动恢复。
- 用户手动隐藏时，会议结束不会自动显示桌宠。
- 检测命令失败、超时或非支持平台时采用保守 fallback，不崩溃。
- `npm test` 和 `node --test test/meetingDetector.test.js` 通过。

### Testing Strategy

先用 fake `execFile` 覆盖进程存在、无 UDP、有 UDP、命令失败、超时和防抖，再用 `tools/measure-meeting-udp.js` 在真实 Teams/Zoom 场景校准阈值。最后用 `npm run dev` 手动验证手动隐藏与自动隐藏状态互不覆盖。

## Overview

当用户正在使用 Zoom、Teams、WebEx、Slack 或 Discord 进行在线会议时，自动隐藏桌宠；会议结束后自动恢复。检测方式为定期轮询已知会议应用的进程状态和活跃 UDP 连接数，判断用户是否正在开会。

此功能始终开启，无需用户手动操作。它不监听屏幕内容、窗口标题或 URL，只读取进程名和网络连接状态。由于 Windows/macOS 均无公开 API 区分"在开会"和"正在共享屏幕"，MVP 采取保守策略：开会即隐藏。

## MVP Behavior

- 始终开启，不做为可选开关。
- 每 5 秒检测一次已知会议应用的进程和 UDP 连接状态。
- 当已知会议应用进程存在且有活跃非本地 UDP 连接时，判定为"在会议中"。
- 判定为在会议中时，自动隐藏桌宠（等同于托盘"隐藏桌宠"功能）。
- 不再检测到活跃会议时，等待 15 秒确认状态稳定（防抖），然后自动恢复桌宠。
- 如果用户已手动隐藏桌宠，会议检测不干扰手动状态；会议结束后也不自动恢复。
- 会议隐藏期间，久坐提醒不触发表现，但主进程计时器继续运行。
- Google Meet（浏览器进程）无法检测，这是已知限制。

## Platform Implementation

### Windows

在主进程中使用 PowerShell 或 `netstat` 子进程检测：

- 使用 `tasklist` 检查已知会议应用进程是否存在。
- 使用 `netstat -anop udp` 检查对应 PID 的活跃 UDP 连接数。
- 判定条件：进程存在 **且** 有 ≥N 个非本地 UDP 端点（N 为可调阈值，初始值通过实测确定）。
- 不使用 `Get-NetUDPEndpoint`（可能被 EDR 检测），改用系统自带 `netstat` 命令。

### macOS

在主进程中使用 `pgrep` 和 `lsof` 子进程检测：

- 使用 `pgrep -x <进程名>` 检查已知会议应用进程是否存在。
- 使用 `lsof -i UDP -p <pid> -Fn` 检查对应 PID 的活跃 UDP 连接数。
- `lsof` 对用户自己的进程不需要 sudo。
- 判定条件与 Windows 一致。

### 已知会议应用进程名

| 应用 | macOS 进程名 | Windows 进程名 |
|---|---|---|
| Zoom | `zoom.us` | `Zoom.exe` |
| Microsoft Teams | `Teams` | `ms-teams.exe`, `Teams.exe` |
| Cisco WebEx | `Cisco Webex Meetings` | `CiscoCollabHost.exe` |
| Slack | `Slack` | `slack.exe` |
| Discord | `Discord` | `Discord.exe` |

> 注意：进程名可能随版本更新变化。新版 Teams（基于 Edge WebView2）使用 `ms-teams.exe`，旧版使用 `Teams.exe`。

## Architecture Decisions

- 新增主进程模块 `meetingDetector.js`（项目根目录，与 `activeWindowProvider.js` 同级），负责会议检测逻辑。
- `meetingDetector.js` 不依赖 `activeWindowProvider.js` 或 `activeWindowAwareness.js`；它是独立的轮询模块，模式类似但职责不同。
- 检测到会议状态变化时通过回调通知 `main.js`，由 `main.js` 控制桌宠的显示/隐藏。
- 隐藏行为复用现有 `toggle-pet-visibility` IPC 通道，不新增 IPC 事件。
- 新增一个状态标记 `meetingHidden`，与手动 `petHidden` 区分，避免状态冲突。
- 使用 `child_process.execFile` 执行平台命令，设置超时保护，避免子进程挂起。
- 所有检测逻辑可注入依赖（`execFile`、`timer`），便于单元测试。
- UDP 连接数阈值作为可配置常量，初期通过实测确定后硬编码，后续可按需调整。
- 恢复桌宠使用 15 秒防抖：连续 15 秒未检测到会议才恢复，避免网络抖动导致桌宠闪烁。

## Performance Constraints

- 轮询间隔为 5 秒，每次启动一个轻量子进程（`netstat` / `pgrep` + `lsof`）。
- 子进程执行超时设为 3 秒，避免阻塞。
- 无会议运行时（所有进程不存在），只执行进程检查，不执行 UDP 查询，减少开销。
- 不在 renderer 中做任何轮询或检测。
- 手动 QA 需要观察任务管理器/活动监视器：无会议时 CPU 不应出现持续可见增长。

## Proposed Data Model

运行时状态（不持久化，进程内存中维护）：

```js
{
  isInMeeting: false,       // 当前是否检测到活跃会议
  meetingHidden: false,     // 是否因会议检测而隐藏桌宠
  lastMeetingDetectedAt: 0, // 上次检测到会议的时间戳（用于防抖）
  detectedApps: []          // 当前检测到的会议应用名列表（调试用）
}
```

不需要持久化配置，功能始终开启。

## Task List

### Phase 1: 检测逻辑基础

#### Task 1: 新增 meetingDetector.js 纯逻辑

**Description:** 新增一个可单测的主进程模块，注入平台命令执行器和 timer 实现，输出会议状态变化回调。

**Acceptance criteria:**
- [ ] 接收平台类型（`win32` / `darwin`）和依赖注入。
- [ ] Windows 上执行 `tasklist` + `netstat` 检测已知会议进程及 UDP 连接。
- [ ] macOS 上执行 `pgrep` + `lsof` 检测已知会议进程及 UDP 连接。
- [ ] 检测到会议开始时触发 `onMeetingStart` 回调。
- [ ] 检测到会议结束（且经过 15 秒防抖确认）时触发 `onMeetingEnd` 回调。
- [ ] 子进程执行超时 3 秒，超时视为检测失败，不改变当前状态。
- [ ] 不支持的平台（非 win32/darwin）安全降级，不执行检测。

**Verification:**
- [ ] 新增 fake execFile 单测覆盖：进程存在+有 UDP、进程存在+无 UDP、进程不存在、超时、错误返回。
- [ ] 单测覆盖防抖逻辑：短暂断开后恢复、连续断开超过 15 秒后触发 onMeetingEnd。
- [ ] `node --test test/meetingDetector.test.js`

**Dependencies:** None

**Files likely touched:**
- `meetingDetector.js`（项目根目录）
- `test/meetingDetector.test.js`

**Estimated scope:** Medium

#### Task 2: 实测 UDP 阈值

**Description:** 编写调试脚本，在实际环境中测量已知会议应用在不同状态下的 UDP 连接数，确定阈值。

**Acceptance criteria:**
- [ ] 提供一个可在终端运行的调试脚本 `tools/measure-meeting-udp.js`。
- [ ] 脚本输出格式：进程名、PID、UDP 连接数、连接详情。
- [ ] 记录测量结果：应用打开未开会 vs 开会中 vs 共享屏幕中的 UDP 连接数差异。
- [ ] 根据测量结果确定 `meetingDetector.js` 中的阈值常量。

**Verification:**
- [ ] 手动运行脚本，分别在以下状态下记录：
  - Teams 打开但未开会
  - Teams 在会议中（未共享屏幕）
  - Teams 在会议中（共享屏幕）
  - Teams 未打开
- [ ] 将测量结果记录到实施文档或 PR 描述中。

**Dependencies:** Task 1（需要了解命令格式）

**Files likely touched:**
- `tools/measure-meeting-udp.js`

**Estimated scope:** Small

### Checkpoint: 检测基础

- [ ] 单测覆盖 Windows 和 macOS 检测路径。
- [ ] 防抖逻辑在测试中有覆盖。
- [ ] 实测数据确认 UDP 阈值合理。
- [ ] 子进程超时和错误处理在测试中有覆盖。

### Phase 2: 接入主进程

#### Task 3: 在 main.js 中集成 meetingDetector

**Description:** 在主进程中启动会议检测器，检测到会议时隐藏桌宠，会议结束后恢复。

**Acceptance criteria:**
- [ ] `app.whenReady()` 后启动 `meetingDetector`。
- [ ] 新增 `meetingHidden` 状态标记，与 `petHidden`（手动隐藏）区分。
- [ ] 检测到会议开始：若桌宠未手动隐藏，则设置 `meetingHidden = true` 并发送 `toggle-pet-visibility(false)`。
- [ ] 检测到会议结束：若 `meetingHidden === true`，则设置 `meetingHidden = false` 并发送 `toggle-pet-visibility(true)`。
- [ ] 用户手动隐藏桌宠时，`meetingHidden` 不受影响；会议结束后不恢复手动隐藏的桌宠。
- [ ] 用户手动显示桌宠时，清除 `meetingHidden` 状态。
- [ ] 托盘菜单的"隐藏/显示桌宠"正确反映综合状态。
- [ ] 应用退出时调用 `meetingDetector.stop()` 清理资源。

**Verification:**
- [ ] 单测覆盖状态交互矩阵：
  - 会议开始 → 桌宠隐藏
  - 会议结束 → 桌宠恢复
  - 手动隐藏 → 会议开始 → 会议结束 → 桌宠仍隐藏
  - 会议隐藏 → 手动显示 → 会议结束 → 桌宠仍显示
- [ ] `npm test`

**Dependencies:** Task 1, Task 2

**Files likely touched:**
- `main.js`

**Estimated scope:** Medium

### Checkpoint: 核心功能

- [ ] 能在真实环境中打开 Teams/Zoom 开始会议，桌宠自动隐藏。
- [ ] 结束会议后桌宠自动恢复。
- [ ] 手动隐藏/显示与会议检测互不干扰。

### Phase 3: 跨平台 QA 与文档

#### Task 4: Windows QA

**Description:** 在 Windows 上使用 Teams 验证完整流程。

**Acceptance criteria:**
- [ ] 打开 Teams 未开会 → 桌宠不隐藏。
- [ ] 加入 Teams 会议 → 桌宠自动隐藏。
- [ ] 离开 Teams 会议 → 等待约 15 秒后桌宠自动恢复。
- [ ] 会议中网络短暂断开（< 15 秒） → 桌宠不闪烁。
- [ ] `netstat` 命令不被 EDR 拦截。
- [ ] 无会议时任务管理器中 CPU 无持续可见增长。
- [ ] 与久坐提醒功能互不干扰。

**Verification:**
- [ ] 使用 `tools/measure-meeting-udp.js` 确认阈值合理。
- [ ] 手动加入/离开 Teams 会议，观察桌宠状态变化。
- [ ] 打开任务管理器，确认无会议待机时桌宠应用 CPU 无异常增长。
- [ ] `npm test`

**Dependencies:** Task 1-3

**Files likely touched:**
- None unless QA finds bugs.

**Estimated scope:** Small

#### Task 5: macOS QA

**Description:** 在 macOS 上验证检测逻辑，确认不触发额外权限提示。

**Acceptance criteria:**
- [ ] 启动后不请求额外系统权限。
- [ ] `pgrep` 和 `lsof` 命令正常执行，无权限弹窗。
- [ ] 打开会议应用未开会 → 桌宠不隐藏。
- [ ] 加入会议 → 桌宠自动隐藏。
- [ ] 离开会议 → 桌宠自动恢复。
- [ ] 无会议时活动监视器中 CPU 无持续可见增长。

**Verification:**
- [ ] 手动加入/离开会议，观察桌宠状态变化。
- [ ] 打开活动监视器，确认无会议待机时桌宠应用 CPU 无异常增长。
- [ ] `npm test`

**Dependencies:** Task 1-3

**Files likely touched:**
- None unless QA finds bugs.

**Estimated scope:** Small

#### Task 6: 更新文档和变更记录

**Description:** 更新项目结构文档和 CHANGELOG。

**Acceptance criteria:**
- [ ] `docs/structure.md` 说明 `meetingDetector.js` 的职责和边界。
- [ ] `CHANGELOG.md` 按 `Added` 标题记录新功能。
- [ ] 若有 ADR 需要，新增 ADR 记录会议检测的隐私边界（只读取进程名和网络连接状态）。

**Verification:**
- [ ] 文档中新增文件的描述与实际一致。
- [ ] CHANGELOG 条目格式正确。
- [ ] `npm test`

**Dependencies:** Task 1-5

**Files likely touched:**
- `docs/structure.md`
- `CHANGELOG.md`

**Estimated scope:** Small

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| UDP 阈值不准确导致误判 | High | 实测确定阈值（Task 2）；阈值作为可调常量，后续可根据反馈调整。 |
| EDR 拦截 `netstat` 或 `tasklist` | Medium | 使用系统自带命令而非 PowerShell cmdlet；`netstat` 和 `tasklist` 是最基础的系统工具，被拦截概率极低。 |
| 新版会议应用改变进程名 | Medium | 进程名列表集中管理，更新方便；用户可提 issue 反馈。 |
| 子进程执行延迟或挂起 | Medium | 设置 3 秒超时，超时不改变状态；不影响主进程。 |
| 5 秒轮询的 CPU 开销 | Low | 轮询操作轻量（启动一个子进程），远低于现有的 10 秒 activeWindowSampler。无会议进程时只执行 `tasklist`/`pgrep`，跳过 UDP 查询。 |
| 防抖延迟导致恢复不及时 | Low | 15 秒防抖是合理折中；隐藏是即时的，只有恢复有延迟。 |
| Google Meet 无法检测 | Low | 已知限制，记录在文档中。浏览器进程无法区分标签页用途。 |
| 会议应用在后台运行但有 UDP 连接（如通知推送） | Medium | 依赖阈值过滤；实测阶段重点关注此场景。 |
| 与手动隐藏/显示的状态冲突 | Medium | 引入 `meetingHidden` 独立标记，与 `petHidden` 分离，状态交互在 Task 3 中有详细测试矩阵。 |

## Not Doing in MVP

- 不检测 Google Meet（浏览器进程无法区分）。
- 不区分"在会议中"和"正在共享屏幕"（OS 无公开 API）。
- 不提供用户可配置的会议应用列表。
- 不提供开关（始终开启）。
- 不使用 `setContentProtection`（会影响用户自己的截图）。
- 不做网络流量深度分析（可能触发 EDR）。
- 不监听屏幕内容、窗口标题或 URL。
- 不在 renderer 中做检测逻辑。

## Open Questions

- UDP 连接数阈值具体应该设为多少？需通过 Task 2 实测确定。
- `netstat -anop udp` 在用户的企业 Windows 环境中是否正常执行？
- Slack 和 Discord 在非通话状态下是否也有大量 UDP 连接？需实测。
