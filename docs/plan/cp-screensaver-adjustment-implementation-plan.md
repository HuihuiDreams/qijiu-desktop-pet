# CP 屏保后续修改实施计划

> 状态：已实施（Task 1–6 全部落地，定向测试与 `npm test` 全绿）。
>
> 基线：[CP 屏保实施计划](./cp-screensaver-plan.md)；现有决策：[ADR-044](../decisions/ADR-044-cp-screensaver-session.md)。

## 概述

本轮只处理试用中已确认的三项体验问题：正常最大化办公窗口不应阻止 CP 屏保、闲置期间应持续循环 CP 连招且输入后可见“被发现”反馈、触发等待档位与 Windows 电源现实相匹配。保持 Windows-only 首发、主进程会话权威、IPC `sessionId` 鉴权、多屏/DPI 几何和所有未知状态 fail-closed 的既有边界。

## 已确定的实施决策

- 最大化的普通窗口允许触发。Windows 前台窗口采样须提供可验证的“真正全屏”信号；守卫不再将覆盖 `workArea` 本身当作演示。无法取得有效采样、显示器数据或时间戳仍一律拒绝。
- 连招采用现有通过素材校验的固定顺序 `shareFood → hug → kiss`；仅在至少两个互动素材可用时，每轮结束后回到中心 idle 并从头开始。可用互动素材为零或一个时，安全地停在中心 idle 等输入，不播放或循环单个互动。
- 普通输入退出采用现有 CSS 文本 `!`，不在本轮新增对话气泡；提示至少保持 600 ms，再执行一次回位动画。静默 cancel 不显示提示。提示位置按目标显示器的视觉缩放计算。
- 触发等待档位改为 `1 / 3 / 5 / 10 / 15 / 30` 分钟，默认仍为 5 分钟。已持久化的旧值 `60` 在首次读取时迁移为 `30` 并回写；其他非白名单值回退默认 5 分钟。
- 等待子菜单加入一条不可点击的三语提示：Windows 关屏/睡眠时间须晚于所选等待时间。应用不读取、修改或阻止系统电源策略。

## 依赖关系

```text
Windows 前台窗口全屏信号
        ↓
资格守卫（允许最大化办公窗口）
        ↓
主进程触发会话 ─────────────┐
                             ↓
渲染器循环状态机 ←────── 输入 / 静默取消

设置白名单与旧值迁移 → 托盘菜单与提示
```

## 任务清单

## Task 1：建立 Windows 真全屏采样契约

**说明：** 扩展 `activeWindowProvider` 的 PowerShell/Win32 采样，使 `isFullScreen` 不再恒为 `false`。用前台窗口矩形、所属显示器完整边界和最大化状态定义可解释的全屏信号：常规最大化窗口与无最大化标记、覆盖完整显示器的全屏窗口必须产生不同结果。

**验收标准：**

- [x] 普通最大化窗口的 payload 保持 `isMaximized: true` 且不被标记为全屏。
- [x] 覆盖显示器完整 bounds 的非最大化全屏窗口被标记为 `isFullScreen: true`。
- [x] 无效矩形、PowerShell 失败和非 Windows provider 仍返回既有 unavailable 形状，不泄漏额外窗口内容。

**验证：**

- [x] `node --test test/activeWindowProvider.test.js`
- [x] Windows 手动探针：最大化 VS Code 与浏览器 F11/PPT 放映的 payload 分别符合上述语义。

**依赖：** 无。

**可能修改文件：**

- `activeWindowProvider.js`
- `test/activeWindowProvider.test.js`
- `docs/decisions/ADR-044-cp-screensaver-session.md`
- `CHANGELOG.md`

**预计范围：** 小（2–4 个文件）。

## Task 2：按新信号重写屏保资格判定

**说明：** 让 `ScreensaverEligibilityGuard` 基于 Task 1 的 `isFullScreen` 与完整 display bounds 拒绝真正全屏，不再把“覆盖工作区”当作 presentation。保留现有 stale、provider、unknown 和 display 查询错误的 fail-closed 行为，并验证 Controller 在触发和 active 轮询中都使用同一结论。

**验收标准：**

- [x] 最大化、覆盖工作区的普通窗口返回 `canInterrupt: true`。
- [x] 真全屏窗口在开始前拒绝，活跃会话中切换为真全屏时发送静默 cancel。
- [x] `stale_cache`、`unknown-state`、`provider-error`、`display-query-failed` 与禁用界面感知的既有行为不回归。

**验证：**

- [x] `node --test test/screensaverEligibilityGuard.test.js test/screensaverController.test.js`
- [x] Windows 手动验证：开启界面感知并最大化 VS Code 后，达到 3 分钟阈值可以触发；浏览器 F11 或 PPT 放映时不触发。

**依赖：** Task 1。

**可能修改文件：**

- `src/main/services/ScreensaverEligibilityGuard.js`
- `test/screensaverEligibilityGuard.test.js`
- `test/screensaverController.test.js`
- `docs/decisions/ADR-044-cp-screensaver-session.md`
- `CHANGELOG.md`

**预计范围：** 中（3–5 个文件）。

### 检查点：触发保护

- [x] Task 1–2 的定向测试通过。
- [x] 最大化办公窗口与真实全屏演示在 Windows 手工探针中可区分。
- [x] 没有放宽任何未知或失败状态的拒绝策略。

## Task 3：使 renderer 连招循环，并可靠显示“被发现”退出（部分完成）

**已完成：** 普通输入后的 `!` 现在先保留一次绘制机会、展示 800ms，且在混合 DPI 下按宠物视觉尺寸定位与缩放；对应状态机、延迟首帧与 150% DPI 回归测试已通过。

**说明：** 将 `ScreensaverSystem` 的 `waiting_for_input` 终态改为循环边界：仅当已校验的可用 Overlay 不少于两个时，最后一个 Overlay 清理、idle 间隔结束后重置 `comboIndex` 并开始下一轮，不重新发起素材校验；零或一个可用 Overlay 则安全停在中心 idle。普通输入将从 entering、任意循环阶段进入一次性的 caught 状态；重复 stop 忽略而非取消该反馈。修正感叹号位置使用 scene 的 display scale，并将 caught 展示时长提高至至少 600 ms；随后复用现有 `runningBack` 归位。静默 cancel 保持直接 reset。

**验收标准：**

- [x] 用户保持闲置时，至少连续播放两轮已校验的 CP 连招，宠物始终停在中心场景而不自动回原位。
- [x] 已校验的可用 Overlay 为零或一个时，不播放或循环单个互动，宠物安全地停在中心场景等待输入。
- [x] 输入发生在 idle、Overlay 播放、caught 或 runningBack 时，感叹号与回位各至多发生一次。
- [x] 感叹号在 100%、150% DPI 都位于双宠视觉上方并持续至少 600 ms。
- [x] 无可用 Overlay、素材校验延迟、session 不匹配和任意静默 cancel 都仍安全收束。

**验证：**

- [x] `node --test test/screensaverSystem.test.js test/screensaverOverlay.test.js test/screensaverEmpiricalVerification.test.js`
- [x] Windows 手动验证：让屏保跨越两整轮；移动鼠标后确认 `!` 可见一次、随后双宠回到入场前位置；锁屏或 F11 取消时不出现 `!`。

**依赖：** 无（可在 Task 1–2 之后独立实施）。

**可能修改文件：**

- `src/systems/ScreensaverSystem.js`
- `test/screensaverSystem.test.js`
- `test/screensaverOverlay.test.js`
- `test/screensaverEmpiricalVerification.test.js`
- `docs/decisions/ADR-044-cp-screensaver-session.md`
- `CHANGELOG.md`

**预计范围：** 中（4–6 个文件）。

## Task 4：收紧等待时间设置并迁移历史 60 分钟值

**说明：** 在 `ScreensaverController` 集中定义允许档位，替换当前仅按 1–60 范围归一化的规则。将持久化的 60 分钟显式迁移为 30 分钟并回写 store；保持默认 5 分钟和启用开关语义不变。

**验收标准：**

- [x] 只接受 `1 / 3 / 5 / 10 / 15 / 30`；其他新输入回退 5。
- [x] 旧 `{ idleThresholdMinutes: 60 }` 在 Controller 启动后变为并持久化为 30。
- [x] 运行时更新、store 的 `onDidChange` 同步和 active 会话的设置禁用取消行为不回归。

**验证：**

- [x] `node --test test/screensaverSettings.test.js test/screensaverController.test.js`
- [x] 用 mock store 验证 60→30 的一次迁移与后续重启稳定性。

**依赖：** 无。

**可能修改文件：**

- `src/main/services/ScreensaverController.js`
- `test/screensaverSettings.test.js`
- `test/screensaverController.test.js`
- `CHANGELOG.md`

**预计范围：** 小（2–4 个文件）。

## Task 5：同步托盘档位与电源时间提示

**说明：** 让 TrayManager 读取 Task 4 的唯一档位来源，展示六个 radio 项而非本地硬编码的旧数组。在同一子菜单加入不可点击的简短提示，并补齐中英日文案；不触碰 Windows 电源设置。

**验收标准：**

- [x] 子菜单只展示 `1 / 3 / 5 / 10 / 15 / 30`，当前值正确勾选，点击后持久化并刷新菜单。
- [x] 三种语言在 README 中都有非空、含义等价的电源时间提示（托盘菜单不再单独提示）。
- [x] 旧值尚未迁移的极短启动窗口中，菜单仍能安全选择有效档位。

**验证：**

- [x] `node --test test/screensaverSettings.test.js test/windowAwarenessControls.test.js`
- [x] Windows 手动验证：切换语言、选择 3 与 15 分钟、重启后检查勾选；并检查三语 README「CP 高甜屏保」一节。

**依赖：** Task 4。

**可能修改文件：**

- `src/main/TrayManager.js`
- `src/data/i18n.js`
- `test/screensaverSettings.test.js`
- `src/main/services/ScreensaverController.js`
- `CHANGELOG.md`

**预计范围：** 中（3–5 个文件）。

### 检查点：行为与设置

- [x] Task 3–5 的定向测试通过。
- [x] 连招循环、普通输入反馈、静默取消和设置迁移互不干扰。
- [x] 两类手工路径均已验证：最大化办公窗口触发、真实全屏演示拒绝。

## Task 6：文档收束、全量回归与变更复核

**说明：** 将已实施的实际行为写回 ADR-044、原 CP 实施计划、结构文档和策略汇总；在 `CHANGELOG.md` 的单一 `Fixed`/`Changed` 小节合并中文条目。复核 IPC 边界、多屏/DPI、timer/监听器释放与未相关改动。

**验收标准：**

- [x] 文档与代码一致，策略汇总标记为已实施或部分已实施，并链接本计划。
- [x] `CHANGELOG.md` 的 `Unreleased` 中没有重复的英文分类标题，新增条目为中文。
- [x] 不新增 Electron/Node 依赖，不修改 renderer 的 Node API 边界。

**验证：**

- [x] `npm test`
- [x] `git diff --check`
- [x] Windows 手动 QA：最大化 VS Code 触发、F11/PPT 拒绝、两轮连招后输入 `!` 回位、静默取消无反馈、3/15 分钟设置持久化。

**依赖：** Task 1–5。

**可能修改文件：**

- `docs/decisions/ADR-044-cp-screensaver-session.md`
- `docs/plan/cp-screensaver-plan.md`
- `docs/plan/cp-screensaver-adjustment-strategy.md`
- `docs/structure.md`
- `CHANGELOG.md`

**预计范围：** 中（3–5 个文件）。

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
| --- | --- | --- |
| Windows 应用的全屏样式各异 | 可能把演示放行或把办公窗口拦截 | 先建立 provider 契约；保留失败即拒绝；以 VS Code、PPT、F11 的 Windows 实测作为发布门槛。 |
| 无限循环导致重复 Overlay 或残留 DOM | 演出重叠、内存/视觉泄漏 | 每次显示前清理 session Overlay；加入跨两轮和重复 IPC 的回归测试。 |
| 输入与 cancel 竞态 | 重复感叹号或重复回位 | 以 sessionId 和明确的 caught/runningBack 幂等分支处理；测试迟到 stop/cancel。 |
| 系统电源时间早于 CP 等待 | 用户看不到演出并误判失败 | 提供 3 分钟档和菜单提示；不越权修改用户电源策略。 |
| 旧 60 分钟持久化值 | 升级后菜单无对应项 | 启动时确定性迁移到 30，并用 store 回归测试锁定。 |

## 实施顺序与并行性

实施顺序为 `Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6`。Task 3 与 Task 1–2 在代码层可并行，但本仓库的“每项完成即全量验证与同步文档”约束下，建议按上述顺序串行执行，避免共享 `CHANGELOG.md` 和 ADR-044 的冲突。

## 开始实施前确认

- [x] 接受本轮只使用 `!` 作为“被发现”反馈；对话气泡留作后续独立需求。
- [x] 接受历史 60 分钟值自动迁移为 30 分钟。
- [x] 在可访问的 Windows 环境中完成最大化 VS Code、浏览器 F11 与 PPT 放映的最终手工验证。
