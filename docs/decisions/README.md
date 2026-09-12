# 架构决策记录 (Architecture Decision Records, ADR)

本项目使用 ADR 记录关键的技术选型、架构设计与演进决策。所有 ADR 文件遵循统一标准模板，保存在 `docs/decisions/` 目录下。

## ADR 规范与生命周期

- **状态流转**：`Proposed`（提议中）→ `Accepted`（已采纳）→ `Superseded by ADR-XXX`（被替代）或 `Deprecated`（已弃用）。
- **标准章节**：`## Status`、`## Date`、`## Context`、`## Decision`、`## Alternatives Considered`、`## Consequences`（可选后续演进 `## Amendments`）。

## 架构决策目录

| 编号 | 决策标题 | 状态 | 日期 | 文件 |
|------|----------|------|------|------|
| ADR-001 | 使用 Electron 构建桌面透明窗口 | Accepted | 2026-04-28 | [ADR-001-use-electron-framework.md](./ADR-001-use-electron-framework.md) |
| ADR-002 | 鼠标穿透与交互区域切换策略 | Accepted | 2026-04-28 | [ADR-002-mouse-clickthrough-strategy.md](./ADR-002-mouse-clickthrough-strategy.md) |
| ADR-003 | 修仙风格养成数值体系设计 | Accepted | 2026-04-28 | [ADR-003-xianxia-nurture-system.md](./ADR-003-xianxia-nurture-system.md) |
| ADR-004 | 拖曳实现方案 | Accepted | 2026-04-28 | [ADR-004-drag-implementation.md](./ADR-004-drag-implementation.md) |
| ADR-005 | 游戏循环异常防护策略 | Accepted | 2026-04-28 | [ADR-005-gameloop-crash-protection.md](./ADR-005-gameloop-crash-protection.md) |
| ADR-006 | 状态持久化与离线收益/衰减机制 (State Persistence & Offline Decay) | Accepted | 2026-04-28 | [ADR-006-state-persistence-and-offline-decay.md](./ADR-006-state-persistence-and-offline-decay.md) |
| ADR-007 | 动态交互菜单名称设计 (Dynamic Interaction Menu Text) | Accepted | 2026-04-28 | [ADR-007-dynamic-interaction-menu-text.md](./ADR-007-dynamic-interaction-menu-text.md) |
| ADR-008 | Git 提交强制验证工作流 (Git Push Validation Workflow) | Accepted | 2026-04-28 | [ADR-008-git-push-validation-workflow.md](./ADR-008-git-push-validation-workflow.md) |
| ADR-009 | 采用全局覆盖层实现特殊互动（Kiss） | Accepted | 2026-04-30 | [ADR-009-kiss-interaction-overlay.md](./ADR-009-kiss-interaction-overlay.md) |
| ADR-010 | 保留历史 ADR 编号空缺 | Accepted | 2026-06-01 | [ADR-010-reserve-historical-adr-number.md](./ADR-010-reserve-historical-adr-number.md) |
| ADR-011 | 增加隐藏/显示桌宠及游戏逻辑暂停机制 | Accepted | 2026-05-01 | [ADR-011-hide-show-pet-functionality.md](./ADR-011-hide-show-pet-functionality.md) |
| ADR-012 | 渲染层性能优化与防抖 | Accepted | 2026-05-01 | [ADR-012-render-performance-optimization.md](./ADR-012-render-performance-optimization.md) |
| ADR-013 | 移除自动挂载 DevTools 以优化基础内存占用 | Accepted | 2026-05-01 | [ADR-013-devtools-memory-optimization.md](./ADR-013-devtools-memory-optimization.md) |
| ADR-014 | Electron 安全加固 (Security Hardening) | Accepted | 2026-05-01 | [ADR-014-electron-security-hardening.md](./ADR-014-electron-security-hardening.md) |
| ADR-015 | 代码质量与性能优化 (Code Quality Optimizations) | Accepted | 2026-05-01 | [ADR-015-code-quality-optimizations.md](./ADR-015-code-quality-optimizations.md) |
| ADR-016 | 前端视觉重构与水墨仙侠美学 (Frontend Visual Redesign) | Accepted | 2026-05-01 | [ADR-016-frontend-visual-redesign.md](./ADR-016-frontend-visual-redesign.md) |
| ADR-017 | 引入 SpriteView 重构多帧动画系统 | Accepted | 2026-05-06 | [ADR-017-migrate-to-spriteview.md](./ADR-017-migrate-to-spriteview.md) |
| ADR-018 | 窗口始终置顶可靠性增强策略 | Accepted | 2026-05-07 | [ADR-018-always-on-top-reliability.md](./ADR-018-always-on-top-reliability.md) |
| ADR-019 | 处理系统休眠后的时间跳跃 (Handling Time Jumps After System Sleep) | Accepted | 2026-05-10 | [ADR-019-handling-time-jumps-after-system-sleep.md](./ADR-019-handling-time-jumps-after-system-sleep.md) |
| ADR-020 | Windows Release 与代码签名发布策略 | Accepted | 2026-05-11 | [ADR-020-windows-release-and-code-signing.md](./ADR-020-windows-release-and-code-signing.md) |
| ADR-021 | 使用 Electron 单实例锁防止重复启动 | Accepted | 2026-05-11 | [ADR-021-single-instance-launch-lock.md](./ADR-021-single-instance-launch-lock.md) |
| ADR-022 | 多显示器支持边界 | Accepted | 2026-05-12 | [ADR-022-multi-display-support-boundary.md](./ADR-022-multi-display-support-boundary.md) |
| ADR-023 | 稳定静止到行走的精灵帧切换 | Accepted | 2026-05-13 | [ADR-023-stabilize-sprite-frame-transition.md](./ADR-023-stabilize-sprite-frame-transition.md) |
| ADR-024 | 多语言支持 (i18n) | Accepted | 2026-05-20 | [ADR-024-i18n-multilingual-support.md](./ADR-024-i18n-multilingual-support.md) |
| ADR-025 | 更新进度弹窗与本地打包更新测试 | Accepted | 2026-05-22 | [ADR-025-visible-update-progress-and-local-update-testing.md](./ADR-025-visible-update-progress-and-local-update-testing.md) |
| ADR-026 | macOS 手动更新启动兼容性与包内可执行文件命名 | Accepted | 2026-05-26 | [ADR-026-macos-manual-update-executable-name.md](./ADR-026-macos-manual-update-executable-name.md) |
| ADR-027 | 修仙状态窗口宽度自动增大修复 | Accepted | 2026-05-27 | [ADR-027-status-window-width-growth-fix.md](./ADR-027-status-window-width-growth-fix.md) |
| ADR-028 | 合并显示器指标事件后再适配桌宠窗口 | Accepted | 2026-05-27 | [ADR-028-coalesce-display-metrics-window-fit.md](./ADR-028-coalesce-display-metrics-window-fit.md) |
| ADR-029 | 安全审计与本地硬化 | Accepted | 2026-05-27 | [ADR-029-security-audit-and-local-hardening.md](./ADR-029-security-audit-and-local-hardening.md) |
| ADR-030 | 窗口感知平台采样 | Accepted | 2026-05-28 | [ADR-030-window-awareness.md](./ADR-030-window-awareness.md) |
| ADR-031 | 久坐提醒设计 | Accepted | 2026-06-01 | [ADR-031-break-reminder.md](./ADR-031-break-reminder.md) |
| ADR-032 | IPC 返回形状统一 | Accepted | 2026-06-04 | [ADR-032-ipc-result-shape.md](./ADR-032-ipc-result-shape.md) |
| ADR-033 | Frontend UI Engineering & Theme Color Swap | Accepted | 2026-06-06 | [ADR-033-frontend-ui-engineering-and-color-swap.md](./ADR-033-frontend-ui-engineering-and-color-swap.md) |
| ADR-034 | UI Performance & Visual Upgrades | Accepted | 2026-06-06 | [ADR-034-ui-performance-and-visual-upgrades.md](./ADR-034-ui-performance-and-visual-upgrades.md) |
| ADR-035 | 会议自动隐藏检测 | Accepted | 2026-06-08 | [ADR-035-meeting-auto-hide.md](./ADR-035-meeting-auto-hide.md) |
| ADR-036 | CP 互动防交叠机制 | Accepted | 2026-06-08 | [ADR-036-cp-interaction-anti-overlap.md](./ADR-036-cp-interaction-anti-overlap.md) |
| ADR-037 | 轻量番茄钟陪伴模式 | Accepted | 2026-06-17 | [ADR-037-lightweight-pomodoro-companion.md](./ADR-037-lightweight-pomodoro-companion.md) |
| ADR-038 | 天气感知与时空同步系统架构与隐私边界 (Weather Sync System) | Accepted | 2026-06-18 | [ADR-038-weather-sync.md](./ADR-038-weather-sync.md) |
| ADR-039 | 城市设置UI窗口 | Accepted | 2026-06-19 | [ADR-039-city-setting-ui-window.md](./ADR-039-city-setting-ui-window.md) |
| ADR-040 | 加密皮肤资产 | Accepted | 2026-07-09 | [ADR-040-encrypted-skin-assets.md](./ADR-040-encrypted-skin-assets.md) |
| ADR-041 | 选肤窗口性能测评与长远扩展优化策略 | Accepted | 2026-07-10 | [ADR-041-skin-selector-performance-and-scaling.md](./ADR-041-skin-selector-performance-and-scaling.md) |
| ADR-042 | 主进程与渲染进程巨石文件拆分方案（Main & Renderer Module Decomposition） | Accepted | 2026-07-20 | [ADR-042-main-and-renderer-module-decomposition.md](./ADR-042-main-and-renderer-module-decomposition.md) |
| ADR-043 | 按需启动缓存清理策略 (Conditional Startup Cache Clearing) | Accepted | 2026-07-23 | [ADR-043-conditional-startup-cache-clearing.md](./ADR-043-conditional-startup-cache-clearing.md) |
| ADR-044 | CP 局部屏保采用独立的主进程会话 | Accepted | 2026-07-27 | [ADR-044-cp-screensaver-session.md](./ADR-044-cp-screensaver-session.md) |
| ADR-045 | Keep AI diary provider credentials outside distributed clients | Proposed | 2026-08-12 | [ADR-045-ai-diary-credential-boundary.md](./ADR-045-ai-diary-credential-boundary.md) |
| ADR-046 | 主进程测试的 Electron Mock 拦截策略 | Accepted | 2026-08-27 | [ADR-046-electron-mock-testing-strategy.md](./ADR-046-electron-mock-testing-strategy.md) |
