# 已审查面汇总

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Windows 自动更新 / GitHub Releases | 软件更新真实性 / 供应链完整性 | Reported | Windows 发布工作流允许 unsigned 发行，运行时仅信任同通道 `sha512` 后即可安装。 |
| 构建与推送辅助脚本 | 敏感产物暴露 | Reported | `package.json` 打包规则过宽，`push.ps1` / `push.sh` 使用 `git add .`，可把 `.codex/**` 与 `security-scans/**` 暴露出去。 |
| Electron IPC 边界 | XSS 到特权升级 / IPC 滥用 | No issue found | `contextIsolation`、`sandbox`、权限请求拒绝、IPC allowlist 均存在。 |
| Renderer DOM 与窗口页面 | DOM XSS / 导航逃逸 | No issue found | 已审 HTML 有 CSP，UI 动态内容主要通过安全 DOM API 构建。 |
| 会议检测与活动窗口获取 | 命令注入 / PATH 劫持 | No issue found | `execFile` 使用受控参数与已知命令路径，未发现用户可控命令拼接。 |
| 天气同步与城市设置 | SSRF / 远端内容注入 | No issue found | 请求目标固定，返回值主要以文本和数值消费，未发现富内容注入。 |
| `.codex/tmp-baebae-pet/**` 临时目录 | 临时目录误纳入后续链路 | Reported | 该目录不作为运行时代码独立报告，但它被工作集枚举，直接证明了产物暴露面。 |
