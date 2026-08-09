# ADR-040: 加密皮肤资产

## Status
已接受

## Date
2026-07-09

## Context
运行时皮肤图片原本直接从 `src/assets/{skinId}/**/*.webp` 加载。这样在打包后很容易检查和提取：只要解包 `app.asar`，明文皮肤 WebP 文件就会直接暴露。

本项目不追求 DRM 级别的强防护，但需要阻止普通解包场景下的一次性明文素材提取，并继续保持 renderer 不直接访问 Node 文件系统的安全边界。

## Decision
在打包前生成受保护皮肤资产：

- `scripts/protect-assets.js` 扫描 `src/assets/{skinId}/**/*.webp`，使用 AES-256-GCM 加密每个资源，并写入 `protected-assets/*.dat` 与 `protected-assets/manifest.json`。
- `protectedAssetLoader.js` 校验 manifest 资源 ID，在主进程中解密资源，校验 size 与 SHA-256，使用有大小上限的内存缓存避免重复解密，并从 manifest 中列出可用皮肤 ID。
- `protectedAssetProtocol.js` 注册 `pet-asset://skin/...`，只允许返回 manifest 中存在的 WebP 资源，并设置 `Content-Type: image/webp`。
- renderer 路径统一改为 `pet-asset://skin/{skinId}/...`；renderer 仍然没有直接 Node 或文件系统访问能力。
- `npm run build` 会先运行资源保护脚本，electron-builder 会从打包产物中排除明文运行时皮肤 WebP。应用图标仍保持普通明文资源，因为操作系统和安装器需要直接读取图标文件。

密钥随应用内置并在本地派生。这是面向普通解包的混淆与提取门槛，不声明可以抵御有经验的逆向工程。

## Consequences
- 打包构建中，主宠物、互动覆盖图和番茄钟图片都使用同一套 `pet-asset://` 协议路径。
- 开发流程保持简单：源 WebP 仍保留在仓库中，便于编辑和测试；生成目录 `protected-assets/` 可通过 `npm run protect:assets` 重建。
- 校验和解密由主进程负责；非法 host、非法路径、路径穿越、缺失 manifest 条目或被篡改的密文都会失败关闭。
- `readManifest` 优先检查内存中 `manifestCache` / `manifestNotFound` 缓存，并在 `main.js` 缓存 `getPomodoroAssets()` 映射与皮肤扫描结果，避免心跳计时器或高频路径解析触发重复同步磁盘 I/O。
- `registerProtectedAssetProtocol` 中的 `protocol.handle` 与 `loadProtectedAssetAsync` 均采用异步读盘和在途请求合并 (`inFlightLoads` Promise 去重)，防止多个组件或窗口同时请求同一素材时引发阻塞或重复解密。
- 渲染进程侧优化：`SkinManager.applySkin` 切换皮肤时触发两只宠物与 `PetRenderer` 互动覆盖层 (`cultivate.webp`, `kiss.webp`) 的并发预加载；同时 `SpriteView` 与 `PetRenderer` 在进行新图片预加载时主动解绑并清理旧 `Image` 对象的事件监听器 (`onload`/`onerror`)，彻底消除多宠并发加载卡顿与 DOM 内存残留隐患。
- 未来新增皮肤时需要继续保持 `src/assets/{skinId}` 的命名结构，并在发布构建前重新运行 `npm run protect:assets`。

## Alternatives Considered
- **继续发布明文 WebP**：实现最简单，但无法满足素材保护目标。
- **远程下载素材**：可以避免本地携带明文源素材，但会增加可用性、隐私和更新复杂度；对这个桌面应用来说成本过高。
- **renderer 侧解密**：协议层代码会更少，但会把更多解密行为暴露给 sandboxed renderer，并重复边界校验逻辑。
