# ADR-035: 会议自动隐藏检测

## Status
Accepted

## Date
2026-06-08

## Context
用户在 Teams 开会时，桌宠可能遮挡共享屏幕、会议窗口或注意力焦点。MVP 需要在不请求额外权限、不读取会议内容、不依赖会议软件私有 API 的前提下，尽量判断用户是否正在使用已知会议应用开会，并在会议结束后自动恢复桌宠。

Windows Teams 实测显示，同一环境中未开会时 `ms-teams.exe` 同名进程 UDP 数量为 `0, 2`，会议中和共享屏幕中为 `0, 6`，退出会议后回到 `0, 2`。这说明 UDP 端点数量可以作为当前 Teams 场景的可用 MVP 信号，但不能视为所有会议软件的通用事实。

## Decision
新增 `meetingDetector.js`，由主进程启动并低频轮询已知会议应用进程和 UDP 端点数量。

### Detection Policy

- Windows 使用 `tasklist /fo csv /nh` 获取当前进程（失败则回退至 `powershell.exe`），再使用 `netstat -ano -p udp` 统计当次 PID 的 UDP 端点数量。如果进程查询或 `netstat` 完全失败/超时，将明确报告未知状态 (`isUnknown: true`) 而不是空结果。
- macOS 使用 `pgrep -x` 获取 PID，再使用 `lsof -nP -i UDP -p <pid> -Fn` 统计 UDP 端点数量。
- PID 只用于单次采样中关联进程和 UDP 端点；进程重启后 PID 会变化，不能写死到配置或判断逻辑。
- 默认每 5 秒采样一次。
- 当前 MVP 阈值为任一已知会议进程 UDP 端点数 `>= 5`，连续 2 次采样命中后判定会议中。
- 低于阈值持续 15 秒后判定会议结束。遇到 `isUnknown: true` 状态时，跳过评估，维持原有的“会议中”或“未开会”状态，防止因系统高负载等偶发原因导致会议误判结束。
- 阈值保留为常量，后续根据不同 Teams 版本实测调整。

### Runtime State

`main.js` 新增 `meetingHidden`，与手动隐藏的 `petHidden` 分离：

- 检测到会议开始时，如果桌宠未被用户手动隐藏，则发送 `toggle-pet-visibility(false)`。
- 检测到会议结束时，仅当桌宠是由会议检测隐藏时才自动恢复。
- 用户通过托盘手动显示桌宠时，清除 `meetingHidden`，允许用户主动覆盖自动隐藏。
- 用户手动隐藏桌宠后，会议结束不会自动显示桌宠。

## Alternatives Considered

- **读取窗口标题或会议标题**：放弃。会议标题可能包含敏感信息，且不同会议软件格式不稳定。
- **监听浏览器 URL 以支持 Google Meet**：放弃。URL 和标签页标题属于更敏感的浏览内容，MVP 不做。
- **检测音频设备、摄像头或屏幕共享状态**：放弃。跨平台公开 API 不稳定，且可能需要额外权限或触发安全软件。
- **深度网络流量分析**：放弃。侵入性更高，也更可能触发 EDR。
- **会议软件私有 API**：放弃。维护成本高，且不同软件和版本差异大。

## Consequences

- Teams 当前 Windows 环境可通过实测阈值实现自动隐藏。
- Slack、Discord、Webex 的非通话 UDP 基线仍需 QA，不应把 Teams 实测直接推广为通用结论。
- 检测失败或命令超时不会反转当前会议状态，避免子进程故障导致桌宠突然显示。
- 隐私边界清晰：只读取进程名和 UDP 端点数量，不读取窗口标题、会议标题、URL、音视频内容或屏幕内容。

