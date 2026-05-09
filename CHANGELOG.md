# Changelog

本文件记录 DeskPet（岳七 & 沈九修仙桌宠）的所有重要变更。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [0.1.5] - 2026-05-09
### Added
- **`.geminiignore`**：新增 Antigravity AI 工作区索引忽略规则文件，排除 `node_modules/`（8650+ 文件）、`dist/`、`build/` 及各类二进制资产（`.png`、`.exe`、`.asar` 等），修复工作区激活时 AI 助手因索引超时而无法响应的问题。

## [0.1.4] - 2026-05-08
### Added
- **安装包验证脚本**：新增 `scripts/verify-installer.js`，可通过 `npm run verify:installer` 在构建后自动检查安装包完整性与关键文件存在性。
- **NSIS 自定义安装脚本**：新增 `build/installer.nsh`，用于在安装过程中注入自定义 NSIS 指令（如额外快捷方式、注册表写入等）。
- **AI 工作区上下文文件**：新增 `GEMINI.md`，为 Antigravity AI 助手提供项目结构与开发规范的上下文，确保工作区被正确识别与响应。
- **macOS 支持规划文档**：将 `plan/macos-support-plan.md` 迁移至 `docs/plan/macos-support-plan.md`，与现有规划文档目录结构对齐。

### Changed
- **`package.json`**：新增 `verify:installer` npm 脚本；NSIS 配置中新增 `include: "build/installer.nsh"` 钩子，打包时自动引入自定义安装脚本。
- **`.gitignore`**：将 `build/` 整体忽略规则细化为 `build/*` + `!build/installer.nsh`，使 `installer.nsh` 能被 Git 追踪，同时继续忽略构建产物。

## [0.1.3] - 2026-05-07
### Added
- **macOS 支持规划**：新增 `plan/macos-support-plan.md`，详细分析了将项目从 Windows 迁移至 macOS 所需的代码改动、打包配置及开发者分发成本。

### Removed
- **废弃动画代码清理**：彻底删除了已过时的 `src/pet/PetAnimations.js` 文件，代码库已完全由 `SpriteView` 系统接管。
- **冗余脚本加载**：从 `src/index.html` 中移除了 `PetAnimations.js` 的加载标签，优化了首屏加载性能。

### Changed
- **动画重构计划结项**：同步更新 `docs/plan/spriteview-animation-plan.md`，将 Phase 1 至 Phase 5 所有任务标记为已完成，正式结束 SpriteView 系统的重构工作。

## [0.1.2] - 2026-05-07
### Added
- **窗口始终置顶可靠性增强**：新增 `keepOnTopWatcher` 机制，在 `main.js` 中以 3 秒为周期定期调用 `setAlwaysOnTop` + `moveTop`，防止在全屏游戏、视频播放或系统弹窗切换后宠物窗口被压到底层。
  - 新增全局计时器 `keepOnTopTimer`，在应用关闭时正确销毁，避免内存泄漏。
  - 在 `did-finish-load`、`show`、`restore`、`blur` 等关键窗口事件上额外触发置顶刷新，确保各场景下均有效。
- **窗口全工作区可见**：调用 `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`，使宠物窗口在多桌面和全屏应用场景下均可见（主要对 macOS 有效，Windows 同样保留该调用以备后用）。
- 新增架构决策记录：
  - ADR-018: 窗口始终置顶可靠性增强策略

### Changed
- **产品名称全面汉化**：`package.json` 中 `productName`、NSIS 快捷方式名 `shortcutName` 和卸载显示名 `uninstallDisplayName` 均从 `DeskPet` 更改为 `七九爱宠`，生成的安装包文件名与桌面快捷方式现在将显示中文名称。
- **窗口设置为不可聚焦**：`createWindow` 中新增 `focusable: false`，防止宠物窗口意外抢占键盘焦点，影响用户在其他应用中的操作。
- **更新应用图标**：替换 `src/assets/icon.ico` 和 `src/assets/icon.png` 为新版图标资产（`.ico` 文件由 41KB 增至 66KB，包含更多尺寸；`.png` 文件由 2.4MB 压缩至 515KB）。
- **打包后脚本**：`package.json` 新增 `afterPack` 钩子，指向 `scripts/afterPack.js`，打包完成后自动通过 PowerShell 脚本 `set-win-icon.ps1` 将图标资源写入 `.exe` 文件资源段，确保安装包图标与任务栏/文件管理器中显示一致。

## [0.1.1] - 2026-05-06
### Added
- **Windows 安装包与开机自启动**：补全 NSIS 安装器配置，生成可安装的 `setup.exe`，并新增托盘菜单中的“🚀 开机自动启动”开关。
- 新增 GitHub Actions workflow，可手动或通过版本 tag 构建 Windows 安装包并上传构建产物。
- **SpriteView 动画系统重构**：新增 `SpriteView.js` 统一管理角色的身体视图，正式支持基于多张图片的多帧序列动画。
  - 在 `config.js` 中新增了 `sprites` 配置对象，无缝兼容现有单帧图片与多帧序列。
  - 为岳七 (岳清源) 和沈九 (沈清秋) 双方接入了 4 帧行走动画，移动时拥有了更流畅的步态。
  - 引入了按需脏标记 (Dirty-flag) 机制和内部帧计时器 (`fps`)，确保动画循环性能。
- 新增架构决策记录：
  - ADR-017: 引入 SpriteView 重构多帧动画系统

### Fixed
- 修复安装包版本仍停留在 `0.1.0` 的问题，重新生成 `DeskPet Setup 0.1.1.exe`。
- 恢复托盘菜单标题和 Emoji 文案，避免安装后显示为简化文案或乱码。
- 修复状态面板无法关闭和无法拖拽的严重 Bug：此前通过右键菜单打开状态面板时，菜单关闭操作错误地恢复了全屏鼠标穿透，导致面板内所有点击操作（如关闭按钮）均穿透到桌面失效。重构了 `ContextMenu.js` 和 `StatusBar.js` 的穿透状态守卫逻辑。
- 为状态面板实现了基于 DOM 的自定义拖拽逻辑（`StatusBar.js`），支持拖拽标题栏移动状态面板位置，替代了会导致全屏透明窗口被拖拽的 `-webkit-app-region: drag` CSS 属性。
- 修复 Windows 11 下托盘菜单中 Emoji（`▶️`）显示为黑色文本三角的问题：替换为全彩专用的 `🚶` (步行者) Emoji。

### Changed
- 托盘菜单细节优化：
  - 首行名称更改为“岳清源x沈清秋 桌面爱宠”。
  - 移除“暂停走动”选项的 `checkbox` 原生类型，改为通过文字（`🚶 恢复走动` / `⏸️ 暂停走动`）动态切换。这解决了 Windows 原生托盘菜单由于复选框预留占位导致的文字无法左对齐的问题。
- 更新规划文档 `docs/plan/spriteview-animation-plan.md`，增加对于实现上下垂直行走的扩展规划与代码影响分析。
- **取消程序水平翻转机制**：为了避免由于图片翻转导致的传统服饰“左衽”问题，移除了 `index.css` 中基于 `scaleX(-1)` 的翻转逻辑。
- **拆分左右行走序列帧**：在 `SpriteView.js` 与 `config.js` 中将原本统一的 `walking` 状态拆分为 `walkingLeft` 和 `walkingRight`。
- **优化素材需求文档**：
  - 在 `docs/skin_assets_requirements.csv` 中补充了独立序列帧需求，并细化了角色互动状态的名称（如“小九撒娇”、“七哥关怀”）。
  - 为 CSV 文件添加了 UTF-8 BOM 编码，解决了在 Windows Excel 中打开出现乱码的问题。

## [0.1.0] - 2026-05-01
### Added
- 完整集成了岳七和沈九的状态/互动专属图片资源，正式取代原先的 Emoji 占位符：
  - 新增 `left_eat.png` / `right_eat.png` 并绑定至右键“喂食”动作。
  - 新增 `left_pat.png` / `right_pat.png` 并绑定至右键“关怀/撒娇”动作。
  - 新增 `left_cultivate.png` / `left_hungry.png` / `left_sleep.png` 以补全岳七的各种状态表现。
- 扩充了宠物状态机，新增 `patted` (被抚摸) 状态，抚摸时角色不再四处走动，并停留 3 秒专门展示互动反馈图片。

### Changed
- **前端视觉重构 (Frontend UI Redesign)**：基于 `frontend-design` 技能原则，对界面进行了“水墨仙侠”风格的全面升级 (ADR-016)：
  - **排版 (Typography)**：引入书法体（马善政/站酷快乐体/楷体）作为标题显示，搭配优雅宋体作为正文，并且完全使用本地字体加载（遵守 CSP 安全策略）。
  - **色彩与材质 (Color & Theme)**：确立了灵玉、仙金、丹砂、墨韵四种核心色调。状态面板与右键菜单升级为“翡翠玉牌”质感的毛玻璃效果 (Glassmorphism)。
  - **动效升级 (Motion)**：全局动画引入更具弹性的 `cubic-bezier` 缓动曲线。行走动画新增 squash & stretch 的有机变形。优化了状态条流动渐变与微光扫过效果。
  - **粒子与反馈 (Interaction Effects)**：互动触发时的单调 Emoji 飘浮升级为 3 个具有交错延迟、随机偏移和缩放的粒子群，并修正了 z-index 避免遮挡气泡文字。双人互动覆盖层增加了平滑的弹性缩放进出效果。
- **主进程内存深度优化 (Memory Optimization)**：在 `main.js` 中禁用了 `site-isolation-trials` 和冗余多媒体按键特性，并将 V8 引擎的最大堆内存限制为 128MB，大幅降低闲置内存水位 (ADR-012)。
- **数值调整**：降低角色行走速度 `MOVE_SPEED` 从 2.0 至 1.2，使走动表现更悠闲。

### Added
- 新增 `docs/skin_assets_requirements.csv`，详细整理了所有默认单人图、特殊状态帧与双人合体帧的美术需求与尺寸建议。

### Added
- 新增架构决策记录：
  - ADR-016: 前端视觉重构与水墨仙侠美学 (Frontend Visual Redesign)

## [0.0.13] - 2026-05-01
### Added
- 新增/重构规划文档：
  - `docs/plan/installer-plan.md`: 安装包与自动启动功能规划
  - `docs/plan/spriteview-animation-plan.md`: SpriteView 精灵视图系统功能规划（由原 ADR-010 演进重构而来）

## [0.0.12] - 2026-05-01
### Added
- 新增架构决策记录：
  - ADR-014: Electron 安全加固 (Security Hardening)
  - ADR-015: 代码质量与性能优化 (Code Quality Optimizations)

### Changed
- **安全性优化 (Security Hardening)**：基于最新的 Electron 33 安全指南，在 `main.js` 中拦截了所有权限请求，禁用了页面导航与新窗口生成，并在 `index.html` 中加入了严格的内容安全策略 (CSP) (ADR-014)。
- **代码正确性修复 (Correctness)**：修复了 `MovementSystem.js` 中移动速度与显示器帧率绑定的致命 Bug，现在移动距离会根据 `deltaMs` 进行动态归一化，确保在 60Hz 和 144Hz 屏幕上速度一致 (ADR-015)。
- **渲染层极致优化 (Performance)**：清理了 `PetAnimations.js` 中的高频 DOM 访问，引入基于内存变量 (`_renderedImageSrc`) 的 Dirty Check 机制，消除了主循环每帧中极其昂贵的 `querySelector` 调用 (ADR-015)。

## [0.0.11] - 2026-05-01
### Added
- 新增架构决策记录：
  - ADR-012: 渲染层性能优化与防抖 (Layout Thrashing & DOM 优化)
  - ADR-013: 移除自动挂载 DevTools 以优化基础内存占用

### Changed
- 内存优化：移除了 `main.js` 中随应用启动自动打开 DevTools 的逻辑，释放了 Chromium 维护调试上下文所占用的近 100MB 内存。保留托盘菜单中的按需开启入口 (ADR-013)。
- 移除了 `app.js` 中的部分遗留调试日志输出。

## [0.0.10] - 2026-05-01
### Changed
- 性能优化 (Performance Optimization)：
  - **消除布局重排**：在 `PetRenderer.js` 中使用 `transform: translate3d` 代替 `left`/`top` 控制宠物移动，利用 GPU 硬件加速，大幅减少高频触发的布局重排 (Layout Thrashing) 所带来的 CPU 及内存开销。
  - **减少 DOM 突变**：在 `PetRenderer.js` 中增加状态缓存 (`_renderedState`, `_renderedDirection` 等)，仅在状态实际改变时操作 DOM 类的增删，降低频繁的垃圾回收 (GC) 压力。
  - **按需更新 UI**：重构 `StatusBar.js`，将原本每次更新都会全量覆写 `innerHTML` 的逻辑改为：初始化时构建静态 DOM 树，后续按需精确修改数值 (`textContent`) 和进度条宽度 (`style.width`)，避免 DOM 重建分配开销。

## [0.0.9] - 2026-05-01
### Added
- 增加托盘菜单“隐藏/显示桌宠”功能：用户现在可以随时隐藏屏幕上的桌宠。隐藏期间游戏逻辑会自动暂停，停止数值消耗和资源占用。
- 新增架构决策记录：
  - ADR-011: 增加隐藏/显示桌宠及游戏逻辑暂停机制

## [0.0.8] - 2026-04-30
### Fixed
- 修复饥饿/灵力低/心境低时角色对话气泡不出现的 bug：原逻辑依赖单一 `chatterTimer`（每 20-60 秒随机挑一只宠物），若恰好选到状态正常的那只，低状态宠物永远无法触发警告对话。将状态警告单独拆出，新增 `statWarningTimer`（每 10-18 秒扫描**双方**宠物），确保任一宠物处于低状态时必然触发对应的 `hungry` / `lowQi` / `lowMood` 对话
- 普通 `chatterTimer` 闲聊现在增加前置条件：仅在宠物**所有属性正常时**才触发 `idle` 闲聊，避免与状态警告冲突

## [0.0.7] - 2026-04-30
### Added
- 引入新的美术资产：`left.png`, `right.png`, 和互动专用的 `kiss.png`
- 增加 `debug.js` 调试脚本，可在 DevTools 中直接调用 `testKiss()` 预览互动效果
- 新增架构决策记录：
  - ADR-009: 采用全局覆盖层实现特殊互动（Kiss）

### Changed
- 特殊互动（Kiss）实现重构：触发时不再显示文字 Emoji，而是隐藏单体角色图片，并在两只宠物中间生成一张跨越双人的 `kiss.png` 图片覆盖层 (ADR-009)
- UI 减法：去除了角色底部显示的文字名字（“岳七”、“沈九”），使视觉表现更专注于图片资产

## [0.0.6] - 2026-04-29
### Added
- 完整版 `README.md`，包含核心数值解析、游玩小贴士及快速开始指南
- 架构结构说明文档 `docs/structure.md`，包含 Mermaid 图和核心机制梳理
- 自动 Push 工作流脚本 `push.ps1`，拦截未更新 CHANGELOG 的提交
- Git 工作流规范文档 `docs/git-workflow.md`
- 新增三篇核心架构决策记录：
  - ADR-006: 状态持久化与离线收益/衰减机制
  - ADR-007: 动态交互菜单名称设计
  - ADR-008: Git 提交强制验证工作流
- 在 `src/data/config.js` 增加详细中文注释，方便二次开发

### Changed
- 初始好感度从 50 调整为 0
- 拥抱门槛从 70 降至 50，亲亲门槛从 50 提升至 70
- “打招呼” (greet) 互动现在也会增加 1 点好感度
- 动态右键交互菜单：对沈九操作时显示“🤚 七哥关怀”，对岳七操作时显示“🤚 小九撒娇” (ADR-007)
- 右键“关怀/撒娇”对应的角色气泡台词更新为符合人设的文案

## [0.0.5] - 2026-04-28
### Fixed
- 修复拖曳过程中意外触发互动的问题：拖曳角色叠在一起时互动会被消耗掉，松手后进入冷却导致无法再次触发。增加 `isDragging` 守卫条件，拖曳期间不检测碰撞

### Changed
- 互动触发距离从 130px → 180px：自然相遇更容易触发
- 互动冷却时间从 60s → 20s：互动频率更合理
- 角色走动速度从 1.5 → 2.0 px/帧：探索更积极，相遇概率更高

## [0.0.4] - 2026-04-28
### Fixed
- 修复 CP 互动触发后全局冻结的严重 bug：`data/dialogues.js` 未在 `index.html` 中引入，导致互动代码访问 `DIALOGUES.effects` 时抛出 `ReferenceError`，异常未被捕获导致 `requestAnimationFrame` 链断裂，游戏循环永久停止 (ADR-005)
- 修复右键菜单"摸头"无反馈的问题：`headPat()` 正确修改了数值但无任何视觉输出（气泡/特效），用户无法感知操作生效。为所有右键菜单动作（喂食、修炼、摸头、休息）添加了对话气泡 + 浮动 emoji 特效

### Added
- 游戏循环 `try/catch` 防护：即使某一帧出错也不会中断整个循环
- `Pet._spawnEffect` 回调：允许 UI 组件（如右键菜单）触发浮动特效 emoji

## [0.0.3] - 2026-04-28
### Fixed
- 修复右键菜单无法点击的问题：鼠标从角色移到菜单时 `mouseleave` 触发了鼠标穿透，导致菜单虽然可见但无法接收点击事件。在 `PetRenderer` 的 `mouseleave` 中增加了菜单/面板开启状态守卫，并在 `ContextMenu` 和 `StatusBar` 上挂载了 `mouseenter` 事件保持非穿透状态 (ADR-002)
- 修复状态面板同样的穿透问题

### Changed
- `ContextMenu.hide()` 和 `StatusBar.hide()` 现在会主动恢复鼠标穿透状态

## [0.0.2] - 2026-04-28
### Added
- 角色拖曳功能：左键按住角色可以拖动到屏幕任意位置 (ADR-004)
- `Pet.isDragging` 属性，用于拖曳期间阻止移动系统覆盖位置
- `MovementSystem.update()` 增加 `isDragging` 守卫条件

### Fixed
- 修复 `PetAnimations is not defined` 错误：`index.html` 中缺少 `PetAnimations.js` 的 `<script>` 标签
- 修复 `Cannot access 'movementSystem' before initialization` 错误：`app.js` 中系统初始化顺序在 IPC 监听器注册之后，导致 `onScreenInfo` 回调提前触发时访问了未初始化的变量。将系统初始化移至 IPC 注册之前

## [0.0.1] - 2026-04-28
### Added
- 项目初始化：Electron 33+ 透明无边框全屏窗口 (ADR-001)
- 鼠标穿透机制：`setIgnoreMouseEvents` 动态切换 (ADR-002)
- 系统托盘图标 + 右键菜单（显示状态、暂停走动、重置位置、开发者工具、退出）
- 双角色系统：岳清源（岳七）🗡️ 和 沈清秋（沈九）🪭
- 随机走动系统：角色在屏幕范围内随机移动，idle 3-8 秒后选择新目标
- 修仙风格养成数值：好感度、饱腹度、灵力、心境 (ADR-003)
- 数值自然衰减：写实节奏，每 5 分钟检查一次
- 右键菜单交互：喂食、打坐修炼、摸头、休息、查看状态
- 左键摸头：点击角色触发好感度 +3 和角色对白
- CP 互动系统：角色距离 < 130px 时随机触发打招呼/分食物/一起修炼/亲亲/拥抱
- 互动权重和好感度门槛：亲亲需要好感 > 50，拥抱需要好感 > 70
- 角色对白系统：每种互动有岳七和沈九各自的台词池
- 闲聊系统：角色在独处时随机冒出对话气泡
- 低数值警告：饥饿/灵力/心境过低时角色会主动抱怨
- 状态面板：显示双方的四维数值进度条
- 数据持久化：通过 `electron-store` 自动保存/恢复状态
- 离线衰减：启动时计算离线时长并批量扣减数值
- 回归问候："你走了X个时辰…" / "…哼，终于回来了。"
- CSS 动画：走路弹跳、睡觉呼吸、修炼发光、互动跳跃、对话气泡淡入淡出
- 仙侠主题 UI：翡翠绿配色、毛玻璃效果、ZCOOL KuaiLe 字体
