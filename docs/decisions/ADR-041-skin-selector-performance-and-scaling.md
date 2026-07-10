# ADR-041: 选肤窗口性能测评与长远扩展优化策略

## Status (状态)
已接受 / 记录为长远架构优化储备 (Accepted & Technical Backlog)

## Date (日期)
2026-07-10

## Context (背景)
使用 `performance-optimization` 技能对桌面宠物可视化选择皮肤窗口（Skin Selector Window）及切肤全链路进行了多层级测评与反模式诊断。

核心测量与现状说明：
1. **轻量与高响应速度**：选肤窗口在首次创建（`150ms ~ 350ms`）后采用 `hide()` 复用策略；配合 `pet-asset:` 协议层为 `webp` 图片附加的 `Cache-Control: public, max-age=31536000, immutable` 强缓存及 `loadProtectedAssetAsync` 的 `inFlightLoads` 去重机制，再次呼唤选肤窗口的响应时间（INP/LCP）能够控制在 `16ms` 以内，对 `app.js` 的游戏主循环与交互帧率无卡顿影响。
2. **两类性能提升瓶颈识别**：
   - **当下即存在的冗余计算（与皮肤数量无关）**：卡片点击预览（`previewSkin` $\rightarrow$ `selectSkin` $\rightarrow$ `mainWindow` 渲染侧 `applySkinById` $\rightarrow$ 回发 `set-current-skin` IPC）不仅会在主进程连续向系统申请并重建原生托盘上下文菜单 `Menu.buildFromTemplate` **2 次**，还在试穿期每次点击都会执行主窗口的 `saveCurrentState()` 写盘存档。
   - **面向未来皮肤增多（10～30+ 套长列表）的扩展瓶颈**：卡片封面 `<img>` 标签缺失 `loading="lazy"` 与 `decoding="async"` 属性；隐藏状态下的 `skinSelectorWindow` 在遇到托盘切换多语言 (`locale-changed`) 时，仍会在后台接收数据并全量重建卡片 DOM；开发或未加密模式下每次扫描需在主线程执行多达 $4N$ 次同步 `fs.existsSync`。

## Decision (决策)
1. **维持当前生产逻辑稳定**：当下项目仅内置少量皮肤（如 `default`、`qijiu`、`shenjiu` 等），一屏即可完整展示，且实测中用户试穿与选肤流畅无感。对现有 IPC 与窗口生命周期保持稳定，不作盲目重构。
2. **记录并确认三项技术债务与长远优化策略（Backlog）**：
   - **优化点 A（卡片 DOM 异步与懒加载 —— 面向将来多皮肤长列表）**：未来当皮肤数量增加至需分页或滚动展示时，在 `skinSelectorWindow.js` 中创建 `<img class="skin-card-preview">` 元素时，显式设置 `preview.loading = 'lazy'`、`preview.decoding = 'async'` 以及固定的 `width = 144`、`height = 132` 属性，消除长画廊挂载瞬间同步解码大量图片所引发的首屏 Layout Janking。
   - **优化点 B（试穿预览链路解耦 —— 面向当下预览冗余）**：重构 `selectSkin(skinId)` 与主窗口 `applySkinById(skinId, options)` 的职责边界，将「临时试看预览 (`previewSkin`)」与「最终确定与应用 (`confirmSkin`)」严格分离。临时试看只需驱动主窗体换图和高亮当前卡片，**不再回发 `setCurrentSkin` IPC、不触发 `refreshTrayMenu()` 的 2 次菜单销毁重建、不执行 `saveCurrentState()` 硬盘存档**；待最终确定或窗口退出时，再统一执行持久化和托盘状态刷新。
   - **优化点 C（后台窗体多语言防抖更新）**：主进程响应 `locale-changed` 时，判断若 `skinSelectorWindow` 处于 `!isVisible()` 隐藏状态，只更新窗口语言标记，不发送 `skin-selector-data`，将画廊 DOM 的全量重构 (`replaceChildren`) 延后至用户下次 `win.show()` 真正唤起窗口时按需执行。

## Consequences (影响)
- 为 `docs/plan/visual-skin-selector-plan.md` 与 `docs/structure.md` 建立了清晰的切肤与画廊窗口性能基准记录与演进指引。
- 明确区分了“当下局部冗余”与“未来长列表瓶颈”，避免了在需求或物料尚未变庞大前过早优化（Premature Optimization）带来的代码复杂性。
- 保留了 `createSkinSelectorWindow()` 的后台隐藏常驻策略，确认 `30MB ~ 60MB RSS` 内存代价换取 `<16ms` 瞬时呼出速度是针对当前跨平台桌面应用的正确工程权衡。

## Alternatives Considered (替代方案)
- **立即可行性改造（立刻改写预览期 IPC 和菜单重构）**：虽然可以立刻减少菜单 `buildFromTemplate` 的次数，但需要改动前端持久化契约和已有的数十个单元及集成测试预期，当前实际体验完全足够流畅，延后到下一期 UI 架构升级或多皮肤包上线前实施风险最小。
- **每次关闭窗口时直接 `destroy()` 释放内存**：虽然可彻底节约隐藏渲染进程占用的 `30MB ~ 60MB` 物理内存，但用户后续点开选肤窗都要重新申请原生窗口与启动 Blink 渲染引擎，`150ms ~ 350ms` 的等待将导致交互不够爽快，最终决定继续采用现有 `hide()` / `show()` 复用设计。
