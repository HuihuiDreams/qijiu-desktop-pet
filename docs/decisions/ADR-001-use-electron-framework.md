# ADR-001: 使用 Electron 构建桌面透明窗口

## Status
Accepted

## Date
2026-04-28

## Context
需要为《人渣反派自救系统》的岳清源和沈清秋构建一个双角色桌面宠物应用。核心需求包括：
- 透明无边框窗口覆盖整个屏幕
- 鼠标穿透（用户可以正常点击桌面图标）
- 角色可以被用户点击和拖曳
- 两个角色需要共享同一个窗口以实现碰撞检测

两个主要候选方案：Electron 和 Tauri。

## Decision
使用 Electron 33+ 作为桌面框架，前端使用 Vanilla HTML/CSS/JS。

## Alternatives Considered
### Tauri (Rust + WebView)
- Pros: 极轻量（打包 3-10 MB，内存 30-80 MB），启动极快
- Cons: 需要 Rust 工具链，鼠标穿透 API 需通过 Rust 调用，团队缺乏 Rust 经验
- Rejected: 开发门槛过高，选择 Electron 起步，后期成熟后可迁移

### VPet (C# / WPF) 魔改
- Pros: 已有成熟的养成系统（好感度、饥饿、打工等）
- Cons: 核心架构围绕单体宠物设计，双角色需要大量底层重构或进程间通信
- Rejected: 双角色互动是核心需求，在单体框架中改造成本过高

### Shimeji-ee (Java)
- Pros: 原生支持多角色，有物理引擎
- Cons: Java 技术栈，互动逻辑通过 XML 配置，难以实现复杂的养成系统
- Rejected: 扩展性不足以满足修仙养成 + CP 互动需求

## Consequences
- Electron 应用内存占用较高（~150-400 MB），作为常驻后台应用需要关注
- 打包体积较大（~80-200 MB）
- 纯 JS 技术栈降低了开发和维护门槛
- 未来可考虑迁移到 Tauri 以优化资源占用
