# 实施计划：皮肤资源加密保护方案 B (Encrypted Skin Assets Protection)

> 状态：建议 (Proposed)  
> 最后更新时间：2026-07-07

## 概述 (Overview)

本计划将当前随安装包明文发布的 `src/assets/{skinId}/` 运行时皮肤素材，迁移为构建期加密、运行时按需解密的资源加载方案。目标不是实现绝对防逆向，而是防止普通用户通过复制安装目录、解包 `app.asar` 或直接打开资源文件夹一次性取得全部可用图片。应用仍保持离线可用，Windows 与 macOS 共用同一套主进程解密和自定义协议加载逻辑。

## 目标 (Goals)

- 打包产物中不再包含可直接打开的角色皮肤 `.webp` 明文文件。
- 渲染进程通过统一的资源 URL 加载图片，不关心开发环境明文资源或生产环境加密资源的差异。
- 资源只在首次请求时解密，复用内存缓存，避免动画播放期间重复解密。
- 保持现有皮肤切换、番茄钟窗口、互动叠加图和 fallback 行为可用。
- 让 Windows 与 macOS 使用相同的资源加密格式、manifest 格式和运行时解析代码。

## 非目标 (Non-goals)

- 不承诺防专业逆向、内存抓取、调试器注入或手动还原客户端密钥。
- 不引入远程登录、授权服务器、在线皮肤商城或按需下载。
- 不把解密后的图片落盘到临时目录或用户数据目录。
- 不改变皮肤素材命名契约、图片尺寸规范或美术生产流程。
- 不在本计划中实现设备绑定密钥、付费授权、水印追踪或截图防护。

## 架构决策 (Architecture Decisions)

- 采用构建期加密：新增脚本读取 `src/assets/**.webp` 角色素材，输出 `protected-assets/**.dat` 与 `protected-assets/manifest.json`。
- 开发环境继续允许读取 `src/assets/` 明文素材，降低本地调试和美术替换成本。
- 打包环境通过主进程注册自定义协议加载资源，例如 `pet-asset://skin/default/left.webp`。
- 解密逻辑放在主进程边界，使用 Node `crypto` 与内存 LRU/Map 缓存；渲染进程不直接读文件系统。
- 加密格式优先采用认证加密，例如 AES-256-GCM；manifest 记录资源 ID、加密文件名、iv、authTag、contentType、size 和可选 hash。
- 打包配置排除角色明文 `.webp`，但保留应用图标 `icon.ico`、`icon.icns`、`icon.png` 和托盘模板图等非皮肤运行素材。
- 所有平台路径通过 `app.isPackaged`、`process.resourcesPath` 和 `__dirname` 统一解析，避免硬编码 Windows 或 macOS 安装目录。

## 依赖图 (Dependency Graph)

```text
资源清单与加密格式定义
    |
    v
构建期加密脚本与 manifest 生成
    |
    v
主进程资源解析、解密和自定义协议
    |
    +--> Renderer 皮肤路径迁移
    |       |
    |       +--> SkinManager / SpriteView / PetRenderer
    |
    +--> 番茄钟窗口资源路径迁移
    |
    v
打包排除明文资源与安装包验证
    |
    v
文档、ADR、CHANGELOG
```

## 任务列表 (Task List)

### 阶段 1：资源保护基础 (Phase 1: Protection Foundation)

## 任务 1：定义加密资源清单与路径契约

**描述：** 明确哪些资源需要保护、哪些资源保留明文，并定义稳定的资源 ID 到加密文件的 manifest 契约。资源 ID 应保持接近现有路径语义，例如 `skin/default/left.webp`，以便业务代码迁移时仍能表达“皮肤 + 文件名”的意图。

**验收标准：**
- [x] 明确保护范围包含 `src/assets/{skinId}/**/*.webp` 角色皮肤素材。
- [x] 明确排除范围包含应用图标、托盘模板图和非角色运行资源。
- [x] manifest 格式包含资源 ID、加密文件名、iv、authTag、contentType、原始大小和完整性校验字段。
- [x] 文档说明开发环境与打包环境的加载差异。

**验证方式：**
- [x] 新增或更新单元测试覆盖 manifest schema 校验。
- [x] 人工审查 manifest 示例能表达所有现有皮肤素材路径。

**依赖关系：** 无

**涉及文件：**
- `docs/plan/encrypted-skin-assets-protection-plan.md`
- `docs/structure.md`
- `docs/decisions/ADR-0xx-encrypted-skin-assets.md`

**预估工作量：** 小型：2-3 个文件

## 任务 2：实现构建期资源加密脚本

**描述：** 新增 Node 脚本扫描 `src/assets/` 下的皮肤目录，将受保护 `.webp` 输出为加密 `.dat` 文件，并生成 manifest。脚本需要可重复运行，输出路径稳定，且在资源缺失或 manifest 冲突时失败退出。

**验收标准：**
- [x] 脚本能递归处理现有 `default`、`birds`、`animal_ears`、`school_au` 皮肤素材。
- [x] 输出目录不包含明文角色 `.webp`。
- [x] 每个 manifest 条目都能定位到一个存在的 `.dat` 文件。
- [ ] 缺失必需资源或重复资源 ID 时，脚本以非零退出码失败。

**验证方式：**
- [x] 专项测试通过：`node --test test/protectedAssetsBuild.test.js`
- [x] 手动运行加密脚本后检查 `protected-assets/manifest.json` 与 `.dat` 文件存在。

**依赖关系：** 任务 1

**涉及文件：**
- `scripts/protect-assets.js`
- `test/protectedAssetsBuild.test.js`
- `package.json`

**预估工作量：** 中型：3 个文件

### 里程碑检查点：构建基础 (Checkpoint: Build Foundation)

- [x] 加密脚本可重复运行且输出稳定。
- [x] manifest 覆盖现有全部皮肤素材。
- [x] 明文开发素材仍保留在仓库中，便于本地开发和美术维护。

### 阶段 2：运行时加载 (Phase 2: Runtime Loading)

## 任务 3：新增主进程受保护资源加载模块

**描述：** 新增主进程模块负责读取 manifest、解析资源根目录、校验资源 ID、读取 `.dat`、解密并返回图片 Buffer。该模块应暴露纯函数和可注入路径，方便单元测试覆盖开发环境与打包环境。

**验收标准：**
- [x] 资源 ID 只能解析 manifest 中存在的条目，拒绝路径穿越和未知资源。
- [x] 解密失败、authTag 校验失败或文件缺失时返回明确错误，不导致主进程崩溃。
- [x] 同一资源重复请求命中内存缓存，不重复读盘和解密。
- [x] 缓存提供大小上限或清理入口，避免长期运行时无限增长。

**验证方式：**
- [x] 专项测试通过：`node --test test/protectedAssetLoader.test.js`
- [x] 测试覆盖正常解密、篡改密文、未知资源 ID、缓存命中和缓存清理。

**依赖关系：** 任务 2

**涉及文件：**
- `protectedAssetLoader.js`
- `test/protectedAssetLoader.test.js`

**预估工作量：** 中型：2 个文件

## 任务 4：注册 `pet-asset://` 自定义协议

**描述：** 在主进程启动阶段注册资源协议，将 `pet-asset://skin/default/left.webp` 等 URL 映射到受保护资源加载模块。开发环境可选择直接返回 `src/assets` 明文文件，打包环境必须走 manifest 解密路径。

**验收标准：**
- [x] 主窗口、番茄钟窗口和未来皮肤选择窗口都能加载 `pet-asset://` 图片。
- [x] 协议响应设置正确的 `contentType: image/webp`。
- [x] 非法 host、非法路径、未知资源和非图片资源返回失败响应。
- [x] 协议注册发生在窗口创建前，避免首屏图片加载竞态。

**验证方式：**
- [x] 专项测试通过：`node --test test/protectedAssetProtocol.test.js`
- [ ] Electron 冒烟检查通过：`npm run qa:electron:smoke`
- [ ] 人工检查开发环境主窗口和番茄钟窗口图片正常显示。

**依赖关系：** 任务 3

**涉及文件：**
- `main.js`
- `protectedAssetProtocol.js`
- `test/protectedAssetProtocol.test.js`
- `tools/playwright-electron-smoke.js`

**预估工作量：** 中型：3-4 个文件

### 里程碑检查点：协议可用 (Checkpoint: Protocol Runtime)

- [x] 开发环境能通过 `pet-asset://` 显示现有皮肤。
- [x] 单元测试覆盖主进程资源安全边界。
- [x] 自定义协议不会把任意本地文件暴露给 renderer。

### 阶段 3：业务路径迁移 (Phase 3: Renderer Migration)

## 任务 5：迁移 SkinManager 与默认资源路径

**描述：** 将 `SkinManager.buildPaths()`、`src/data/config.js` 和 `SpriteView` 默认 imageMap 从 `assets/...` 迁移到统一的 `pet-asset://skin/...` 路径。保留现有皮肤 ID、状态图和行走帧命名契约。

**验收标准：**
- [x] `SkinManager.buildPaths('default')` 输出的所有角色图片路径均使用 `pet-asset://`。
- [x] `SpriteView` 预加载和状态切换继续使用 `Image.src`，不引入 Node API。
- [x] 皮肤切换后行走帧、饥饿、睡眠、进食、打坐、撒娇状态正常显示。
- [x] 现有 `scaleRatio` 和 `imageScale` 行为不变。

**验证方式：**
- [ ] 专项测试通过：`node --test test/skinManager.test.js test/skinRendererIntegration.test.js test/petRenderer.test.js`
- [ ] 人工检查切换全部内置皮肤无空白帧。

**依赖关系：** 任务 4

**涉及文件：**
- `src/systems/SkinManager.js`
- `src/data/config.js`
- `src/pet/SpriteView.js`
- `test/skinManager.test.js`
- `test/skinRendererIntegration.test.js`

**预估工作量：** 中型：5 个文件

## 任务 6：迁移互动叠加图和番茄钟资源路径

**描述：** 将 `PetRenderer.showOverlay()` 的互动图路径和 `main.js` 中番茄钟资源解析逻辑迁移到 `pet-asset://`。fallback 仍按“当前皮肤缺文件则回退 default”的语义实现，但缺文件检查应基于 manifest 或开发环境资源存在性，而不是只查 `src/assets`。

**验收标准：**
- [x] `kiss`、`hug`、`cultivate`、`shareFood`、`throwup` 等互动图使用受保护资源协议加载。
- [x] 番茄钟初始页、倒计时页和完成页图片使用受保护资源协议加载。
- [x] 当前皮肤缺少番茄钟或互动资源时，仍回退到 default 资源。
- [x] 打包环境不依赖 `src/assets` 明文目录判断 fallback。

**验证方式：**
- [x] 专项测试通过：`node --test test/pomodoroSystem.test.js test/pomodoroWindow.test.js test/petRenderer.test.js`
- [ ] 人工检查互动叠加图和番茄钟窗口显示正常。

**依赖关系：** 任务 5

**涉及文件：**
- `main.js`
- `src/pet/PetRenderer.js`
- `test/pomodoroWindow.test.js`
- `test/petRenderer.test.js`

**预估工作量：** 中型：4 个文件

### 里程碑检查点：功能等价 (Checkpoint: Functional Parity)

- [x] 主桌宠、互动图和番茄钟均能通过自定义协议显示资源。
- [x] 全部内置皮肤切换可用。
- [x] renderer 仍不直接使用 Node API。

### 阶段 4：打包与发布防护 (Phase 4: Packaging Protection)

## 任务 7：调整 electron-builder 打包规则

**描述：** 将加密资源生成纳入构建流程，并在 `electron-builder` 的 `files` 规则中排除受保护的明文角色 `.webp`。同时确保 `protected-assets/` 被包含进安装包，且图标等非保护资源仍可用于应用启动、托盘和安装包元数据。

**验收标准：**
- [x] `npm run build` 前自动或显式运行资源保护脚本。
- [x] 打包产物包含 `protected-assets/manifest.json` 和 `.dat`。
- [x] 打包产物中不包含 `src/assets/{skinId}/**/*.webp` 明文角色素材。
- [ ] Windows NSIS 和 macOS app 路径解析均通过统一资源根目录逻辑。

**验证方式：**
- [x] 构建通过：`npm run build`
- [x] 安装包验证通过：`npm run verify:installer`
- [x] 对 `dist/` 中的 `app.asar` 或目录产物执行明文素材扫描，无角色 `.webp` 命中。

**依赖关系：** 任务 6

**涉及文件：**
- `package.json`
- `scripts/verify-installer.js`
- `.gitignore`
- `test/macosPackaging.test.js`

**预估工作量：** 中型：4 个文件

## 任务 8：补充安全、性能和回归验证

**描述：** 增加验证用例和手动 QA 步骤，确保资源保护没有引入明显启动性能回退、跨平台路径错误或用户可见的图片闪烁。重点验证首次加载开销、缓存命中和长时间运行的内存稳定性。

**验收标准：**
- [x] 首次加载当前皮肤时资源解密只发生一次，后续动画帧不触发重复解密。
- [x] 切换皮肤后仅加载目标皮肤需要的资源，不一次性解密全部皮肤。
- [x] 主进程日志不输出密钥、明文图片内容或可复用的解密材料。
- [x] 资源加载失败时显示可诊断错误，不导致 renderer 崩溃。

**验证方式：**
- [x] 全量测试通过：`npm test`
- [ ] Electron 冒烟检查通过：`npm run qa:electron:smoke`
- [ ] 手动性能检查：启动、切换皮肤、触发互动、打开番茄钟，观察无明显卡顿。

**依赖关系：** 任务 7

**涉及文件：**
- `test/protectedAssetLoader.test.js`
- `test/playwrightElectronSmoke.test.js`
- `tools/playwright-electron-smoke.js`
- `docs/release-workflow.md`

**预估工作量：** 小到中型：3-4 个文件

### 里程碑检查点：发布可验收 (Checkpoint: Release Readiness)

- [ ] `npm test`、`npm run qa:electron:smoke` 和 `npm run build` 通过。
- [x] 打包产物中没有可直接打开的角色皮肤 `.webp`。
- [ ] Windows 和 macOS 的资源根目录解析都有测试或人工验证记录。
- [x] 变更已记录到 `CHANGELOG.md`、`docs/structure.md` 和相关 ADR。

## 风险与缓解 (Risks and Mitigations)

| 风险 | 影响 | 缓解 |
|---|---|---|
| 客户端密钥可被逆向 | 中 | 明确目标是防普通用户；密钥拆分、轻量混淆和认证加密只能提高门槛，不能当作绝对安全边界 |
| 首次加载皮肤变慢 | 中 | 按需解密、内存缓存、只预热当前皮肤，避免启动时解密全部资源 |
| 打包规则误删图标或模板图 | 高 | 将“受保护角色素材”和“应用图标资源”分开匹配，并补充 installer 验证 |
| 自定义协议暴露本地文件 | 高 | 只允许 manifest 中存在的资源 ID，不把 URL path 直接拼成本地文件路径 |
| fallback 行为在打包环境失效 | 中 | fallback 检查改为 manifest 查询，开发环境和生产环境共用同一资源存在性接口 |
| macOS `.app` 路径差异导致资源找不到 | 中 | 所有平台使用统一 resolver，并补充 macOS packaging 测试 |

## 开放问题 (Open Questions)

- 加密密钥是否接受“客户端内置、仅提高门槛”的方案，还是后续要升级到设备绑定或授权派生密钥？
- `protected-assets/` 是否提交到仓库，还是仅作为构建产物在 CI/本地构建时生成？建议先不提交产物，只提交脚本和测试。
- 是否需要为画师署名或授权信息保留明文 metadata，以便在 UI 和文档中继续展示来源？
- 是否需要在未来的可视化皮肤选择窗中使用受保护资源生成缩略图缓存？若需要，应复用同一协议而非新增明文缩略图目录。

## 并行化机会 (Parallelization Opportunities)

- 任务 1 完成后，任务 2 的加密脚本与任务 3 的加载模块测试可并行推进，但 manifest 契约必须先固定。
- 任务 5 和任务 6 都依赖协议可用，之后可分开迁移主桌宠路径和番茄钟/互动路径。
- 任务 7 的打包规则和任务 8 的 QA 脚本可在业务路径迁移完成后并行补强。
