# ADR-043: 按需启动缓存清理策略 (Conditional Startup Cache Clearing)

## Status (状态)
Accepted (已接受)

## Date (日期)
2026-07-23

## Context (背景)
在 DeskPet 的早期版本中，我们在主窗口创建期间（以前在 `AppLifecycle.js`，现在在 `PetWindow.js` 中）无条件地调用 `session.clearCache()`。这最初是为了确保任何更新的皮肤图像（特别是 `pet-asset://` 协议资源）或 HTML/CSS 文件能够正确使本地缓存失效，从而展示最新的变更。

然而，无条件的缓存清理对每次应用程序的“热启动”都造成了性能惩罚。性能分析表明，清理缓存大约需要 45ms，而整个从 `createWindow` 到 `did-finish-load` 的耗时大约为 190ms。对于每天启动应用且不手动修改游戏资产的普通用户来说，每次启动都承受缓存未命中是不必要的。

## Decision (决策)
我们决定用**按需的条件缓存清理策略**来取代无条件的 `clearCache`：

1. **基于版本的失效 (Version-based Invalidation)**：我们在 `electron-store` 中存储最后一次运行的应用程序版本（`lastCacheVersion`）。在启动时，如果 `app.getVersion()` 与 `lastCacheVersion` 不匹配，我们会清理缓存并更新存储。这确保了在应用程序更新后，所有内置资产都能被刷新。
2. **开发模式 (Development Mode)**：如果应用处于未打包状态（`!app.isPackaged`），我们总是清理缓存，允许开发者在不增加版本号的情况下立即看到资产变更。
3. **CLI 后备 (CLI Fallback)**：我们引入了一个隐藏的 `--clear-cache` CLI 标志。如果传入该标志，则显式清理缓存。这为高级用户或在不干扰系统托盘 UI 的情况下进行故障排查提供了后备机制。

## Consequences (后果)
- **正面影响 (Positive)**:
  - 热启动性能得到改善。A/B 测试显示 `clearCache` 耗时降至 0ms，整体窗口加载时间降至约 151ms（提升约 39ms / 20.6%）。
  - 普通用户避免了启动时非必要的磁盘 I/O。
- **负面影响 (Negative)**:
  - 如果高级用户在不更新版本号或不传入 CLI 标志的情况下，手动修改 `app.asar.unpacked` 的内容，可能会看到过时的图像。所提供的 CLI 标志就是针对这一场景的指定解决方案。

## Alternatives Considered (考虑过的替代方案)
- **在托盘菜单中添加“清除缓存”按钮**：被拒绝，因为它会使 UI 变得杂乱，并使不知道何时或为什么使用它的普通用户感到困惑。CLI 标志对于高级故障排查来说已经足够了。
- **通过 IPC 和 UI 警告进行缓存失效**：对于罕见的边缘情况来说过于复杂。一个简单的 CLI 参数能保持代码库的轻量级。
