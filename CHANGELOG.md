# Changelog
本文件记录 DeskPet（岳七 & 沈九修仙桌宠）的所有重要变更。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。


## [WIP] - 2026-05-24
### Changed
- 更改mac版的更新方式

## [0.4.0] - 2026-05-24
### Added
- **macOS 原生支持**：
  - 在 macOS 运行时自动隐藏 Dock 图标 (`app.dock.hide()`)。
  - 支持 macOS 菜单栏托盘图标的原生单色模板图像 (`setTemplateImage(true)`)。
  - 实现 macOS 下完整的自动启动设置适配 (`openAsHidden`)。
  - 为 macOS 桌面端添加高分辨率的 `src/assets/icon.icns` 图标。
  - 在 `package.json` 中配置了多架构打包目标（针对 `x64` 和 `arm64` 的 `dmg` + `zip`）。
  - 在 GitHub Actions 中添加了 macOS 安装包构建任务 (`build-macos-installer`)，以在发布 Release 时自动与 Windows 版本一同发布。
  - 在 Release Preflight 工作流中添加了 macOS 冒烟包校验 (`preflight-mac`)。
  - 在 `README.md`、`readme.txt`、`readme_en.txt` 和 `readme_ja.txt` 中添加了详细的多语言 macOS 下载、安装及绕过 Gatekeeper（安全隐私限制）的说明。
- 新增 `docs/decisions/ADR-025-visible-update-progress-and-local-update-testing.md`，用于记录可视化更新进度窗口以及本地打包更新测试的设计决策。
- 新增 `electron-builder.update-test-old.yml` 和 `electron-builder.update-test-new.yml`，用于在不发布 GitHub Release 的情况下进行本地更新程序验证。

### Changed
- 重构 `createTray`，使其在 macOS 下使用模板图像自动反色，同时在 Windows 下保留编程式位图绘制。
- 在“检查更新”后立即显示专属进度窗口；在确认下载后，将其复用为基于百分比的下载进度窗口。
- 通过注入 `updateProgressUi` 适配器，将 `updateManager.js` 与主进程进度窗口解耦，同时保留现有的结果对话框和托盘状态。
- 忽略 `dist-update-test/` 下的一次性本地更新测试输出。
- 新增 `docs/plan/window-awareness-plan.md`，记录窗口感知（window-awareness）特性的实现计划。

## [0.3.1] - 2026-05-22
### Changed
- 将默认桌宠运行时图片资源从 PNG 切换为 256px WebP，并保留全套预加载策略以降低状态切换闪烁风险。
- 调整发布打包配置，排除 docs、test、.github 和 dist，避免全分辨率备份素材进入安装包。
- 扩展 Release Preflight 触发路径，让 src 资源和渲染代码变化也会自动触发发布预检。

### Fixed
- 保留 SpriteView 图片加载失败时的 emoji fallback，避免回退内容变成文字占位。
- 为默认 WebP 资源尺寸增加纯 Node 测试，避免 GitHub Actions 依赖 Python/Pillow 环境。

## [0.3.0] - 2026-05-21
### Added
- **多语言支持 (i18n) 架构**：新增 `src/data/i18n.js` 作为统一的多语言字典，支持中文 (zh)、英文 (en) 和日文 (ja)。
- **语言运行时热切换**：主进程增加向所有窗口广播 `locale-changed` 机制，右键菜单和系统托盘均能实时切换主窗口和状态面板语言。
- **状态面板缓存重绘**：状态窗口监听 `locale-changed` 并使用 `lastRenderData` 立即更新现有属性面板上的多语言数值。
- **多语言发布说明**：新增 `readme_en.txt` 和 `readme_ja.txt`，对齐 `i18n.js` 的英日界面词与 emoji，并让发布工作流校验、上传三种语言的说明文件。

### Changed
- **气泡重叠与换行策略**：单人对话框气泡保持 `nowrap` 风格，双人互动气泡限制 `max-width: 130px`、启用 `pre-wrap` 向上增长，防止英文等长句重叠。
- **状态栏对齐美化**：状态面板属性标签宽由 `72px` 增加至 `85px`，增加 `white-space: nowrap`，防止英文属性名（如 `Affection`）换行，使 UI 更加美观对齐。
- **全局多语言适配**：清理并重构 `debug.js`、`updateManager.js` 中的硬编码中文，改用统一的翻译字典接口。

### Fixed
- **托盘语言覆盖**：皮肤名称和托盘悬浮提示改为跟随当前语言切换。
- **i18n 兜底安全性**：修复 `I18N` 全局缺失时兜底路径仍可能抛出 `ReferenceError` 的问题。
- **更新弹窗测试覆盖**：补充真实翻译函数注入后的版本插值和错误详情前缀回归测试。

## [0.2.6] - 2026-05-20
### Added
- **代码规范规则集**：根据 Karpathy 编程指南定制了适用于本项目的 `.geminirules` 开发规范规则文件。
- **发布前文档校验**：在 Release Preflight 工作流中新增对 `readme.txt` 存在性的自动校验步骤，防止漏发说明文档。

### Changed
- **Release 文档自动发布**：在 Build Windows Installer 工作流中增加了通过 GitHub CLI 自动向 GitHub Release 上传 `readme.txt` 的步骤，并同步将其打包进 Actions 构建 Artifacts。
- **皮肤素材需求文档更新**：更新了 `docs/skin_assets_requirements.csv` 和 `.xlsx`，补充了沈九吃太撑互动的 `throwup.png` 资源需求及双人定位说明。

### Fixed
- **依赖安全漏洞修补**：通过 `npm audit fix` 升级了项目依赖库，修复了 Electron 等 13 个已知的安全漏洞。
- **IPC 数据存储键校验**：在主进程数据持久化接口中增加了白名单校验，限制可读写的存储键值，增强了进程间通信的数据安全性。

## [0.2.5] - 2026-05-19
### Added
- `shareFood` 互动新增吃太撑分支：当沈九饱腹 `+10` 后超过 100 时，互动图改为 `throwup.png`。
- 调试入口新增 `testsharefood()` 小写别名和 `testShareFoodThrowup()`，方便在 Console 里直接验证吃太撑分支。
- 新增 `docs/plan/cangqiong-pomodoro-plan.md`，记录“苍穹山派”番茄钟实施计划，包含非工作软件定义、前台窗口识别、触发阈值和测试场景。
- 新增 `docs/plan/zongmen-task-todo-plan.md`，记录“宗门任务”待办事项实施计划，包含灵石/好感度奖励区分、任务系统数据模型、状态窗口 UI 和持久化方案。

### Changed
- 吃太撑分支的互动对白固定为岳七“小九你怎么了？”、沈九“呕~~”。
- 重写 `readme.txt` 为更面向普通用户的说明，保留养成数值、互动阈值和原有 emoji，并改为带 BOM 的 UTF-8 编码以减少中文 Windows 打开乱码。

## [0.2.4] - 2026-05-18
### Added
- **多显示器调试交接文档**：新增 `docs/plan/multi-display-debug-handoff.md`，记录跨屏移动相关改动、当前遗留问题、用户显示器布局线索和后续排查建议，便于后续 agent 接手。
- **多显示器边界决策记录更新**：重写 `docs/decisions/ADR-022-multi-display-support-boundary.md`，记录混合 DPI 坐标转换、`walkAreas.scaleRatio`、视觉缩放和调试入口的最终方案。

### Changed
- **系统托盘菜单分组**：用分割线区分桌宠功能和软件功能，并将“开发者工具”限制为开发态显示，安装包版本不再展示该入口。
- **互动覆盖层缩放常量命名**：将互动覆盖图宽度、顶部偏移和气泡间距提取为命名常量，并补充 `scaleRatio` 缩放注释，减少后续维护误判。
- **多显示器窗口覆盖逻辑调整**：主桌宠窗口允许大于单屏并在创建及显示器变化时重新设置虚拟桌面 bounds，解决开发态拖曳到主屏边缘被无形墙挡住的问题。
- **桌宠移动边界逻辑调整**：`MovementSystem` 改为基于真实显示器 `workArea` 列表选择目标点，并支持跨显示器接缝及显示器间坐标空洞的移动桥接。
- **混合 DPI 坐标管线调整**：`displayBounds.js` 将 Electron 显示器 DIP 坐标转换为主窗口内 renderer 坐标，并为每个 `walkArea` 附带 `scaleRatio`，供移动系统和视觉层共用。
- **多屏视觉缩放统一**：桌宠本体、右键菜单、灵力光晕和粒子效果会根据所在显示器缩放比例自动调整，并使用缩放后的视觉中心对齐。
- 更新 `docs/skin_assets_requirements.csv`，补充双人互动时的画面占位说明（沈九需在左边），并转存为带有 BOM 的 UTF-8 格式以修复 Excel 乱码问题。
- **系统架构文档全面更新**：更新 `docs/structure.md`，同步了多显示器坐标管线、独立状态窗口架构、SpriteView 预加载优化以及调试工具 `debug.js` 的最新描述。
- **架构图语法修复**：修正了 `structure.md` 中 Mermaid 图表的语法错误，确保多级子图在渲染引擎中正常显示。

### Fixed
- **副屏互动覆盖层缩放**：修复亲亲、拥抱、一起修炼、分食物等双人互动覆盖图、对话框大小和字体在副屏上仍按主屏比例显示的问题。
- **跨屏拖曳和回程移动**：修复主窗口未正确覆盖副屏导致桌宠坐标跑出主屏后不可见、以及桌宠从副屏走回主屏时被接缝边界夹住的问题。
- **副屏右/下边缘越界**：修复混合 DPI 多显示器布局下，桌宠在副屏右边缘或下边缘继续走入不可见区域的问题。
- **副屏视觉大小漂移**：修复桌宠走到副屏后角色本体、右键菜单和灵力效果视觉大小不一致的问题。
- **灵力效果中心偏移**：修复喂食、修炼等光晕和粒子效果缩放后不再对准小人视觉中心的问题。
- **多显示器移动回归测试**：新增覆盖随机目标落点、可见区域夹取、显示器间空洞桥接、旧目标越界夹取、副屏返回主屏接缝移动、`scaleRatio` 保留和灵力效果视觉缩放的测试。


## [0.2.3] - 2026-05-14
### Added
- **皮肤系统框架 (Skin System)**：新增 `SkinManager` 模块，为桌宠提供多套皮肤支持。
- **动态资源加载**：重构 `SpriteView` 和 `PetRenderer`，支持运行时通过 `applySkin` 异步预加载并无缝切换角色贴图，消除切换时的闪烁。
- **系统托盘集成**：托盘菜单新增「🎨 切换皮肤」子菜单，并支持通过 IPC 动态扫描 `src/assets/` 目录下的可用皮肤文件夹。
- **皮肤偏好持久化**：`TimeSystem` 存档新增 `skinId` 字段，启动时自动恢复上次选择的皮肤；旧存档缺少该字段时回退到 `default`。
- 新增针对 `SkinManager`、主进程集成、渲染进程接线与 `TimeSystem` 皮肤存档的大量单元测试。

### Changed
- 调整养成数值平衡：自动互动冷却从 20 秒提高到 1 分钟，灵力/心境自然消耗提高到每 5 分钟 -2；单人打坐改为每秒恢复 1 点灵力，“一起修炼”按单人完整打坐收益的 1.5 倍四舍五入计算，分享食物恢复值回到上一版。
- **资源目录结构重构**：将所有原散落在 `src/assets/` 下的角色图片归档至 `src/assets/default/` 目录，奠定基于文件夹约定的皮肤管理规范。
- 更新系统结构文档与素材需求 CSV，明确 `src/assets/{skinId}/` 的皮肤文件夹约定、渲染注入流程和图标不随皮肤切换的边界。
- 整理计划文档状态，将已完成的安装包与自动更新计划归档至 `docs/archive/`，并更新根目录结构文档中 `docs/plan` 与 `docs/archive` 的职责说明。

### Fixed
- 修复更新失败弹窗只显示笼统失败文案的问题；现在会识别嵌套网络错误、404 和下载中断，并在 GitHub 更新源不可达时给出更准确的原因摘要。
- 修复开发态托盘菜单中重复显示两个“检查更新”入口的问题；安装态共用同一菜单模板，也会只保留一个更新入口。

### Known Issues
- **副屏不可见区域仍待排查**：桌宠已可拖曳到副屏并从副屏走回主屏，但仍可能走入副屏上视觉不可见的位置。后续需结合运行时坐标、`walkAreas`、`display.scaleFactor` 和实际皮肤可见尺寸继续定位。

## [0.2.2] - 2026-05-13
### Added
- 新增对话气泡替换与多宠物气泡清理的回归测试。
- 新增交互灵气汇聚动效，在进食、打坐、抚摸、休息和双人互动时显示轻量光晕反馈。

### Fixed
- 修复旧对话气泡的定时器误删同一宠物新气泡的问题。
- 修复通过 IPC 修改开机启动设置后，托盘开机启动文案没有同步刷新的问题。
- 修复从待机切换到行走时残留 `.pet--flipped` 类，导致 SpriteView 方向行走帧被二次翻转的问题。
- 修复开发态运行时可能把 Electron 开发可执行文件注册为 Windows 开机启动项的问题。
- 修复角色从静止切换到行走时首轮帧图加载和方向延迟导致的短暂闪烁。

### Changed
- 调整托盘更新与开机启动菜单文案，让状态表达更清晰。
- 更新应用图标资源，替换 `icon.png` 与 `icon.ico`。
- **角色默认朝向与互动转身逻辑**：
  - 为岳七（左侧）和沈九（右侧）设定了符合美术立绘设定的默认侧脸朝向。
  - 优化了两人互动时的身体朝向逻辑：当触发互动时（如打招呼），系统会根据两人的相对坐标使他们自动“面对面”。
  - 引入了基于 `.pet--flipped` 的 CSS `scaleX(-1)` 翻转机制，精细化处理朝向。此翻转仅应用于发呆、互动等静态表现，不会干扰行走状态已有的原生四帧动画，彻底解决了朝向生硬的问题。

## [0.2.1] - 2026-05-12
### Fixed
- **数位笔/触控体验修复**：
  - 修复了数位笔长按无法稳定唤出右键菜单的问题。通过在 CSS 中为 `.pet` 和 `.context-menu` 添加 `touch-action: none`，禁用了浏览器对触控手势（如平移、滚动）的默认拦截，使笔尖长按右键能稳定触发。
  - 修复了使用数位笔点击菜单选项时偶尔无效（吃事件）的 bug。将 `ContextMenu.js` 的选项监听器由 `click` 变更为 `pointerdown` 并使用 `e.currentTarget` 获取正确元素，消除了笔尖微小抖动导致的事件取消问题，提升了响应可靠性。


## [0.2.0] - 2026-05-12
### Added
- **全新角色皮肤上线**：全面更换了岳七与沈九的角色美术资产，包含单人待机、行走、以及各类特殊互动状态下的高精细度皮肤。
- **多显示器全覆盖支持**：主窗口现在自动计算并覆盖所有显示器的虚拟桌面区域 (`getVirtualDisplayBounds`)，确保桌宠可以在多屏之间无障碍穿梭。
- **独立状态面板窗口**：重构了状态面板实现方式。现在状态面板拥有独立的、非透明的 Electron 窗口 (`src/status.html`)，支持跨显示器拖拽，彻底解决了原先 DOM 遮罩层无法超出主窗口边界的问题。
- **UI/UX 改进计划**：新增 `docs/plan/ui-ux-improvement-plan.md`，规划了“水墨仙侠”美学提升路径。
- **点击穿透租约机制**：在主进程引入 `setPetWindowMousePassthrough`，支持带超时的交互激活，提升了在复杂 UI 交互下的鼠标穿透/拦截切换的稳定性。
- **多显示器边界计算工具**：新增 `displayBounds.js` 及其测试，用于辅助计算多屏布局下的可用工作区。

### Fixed
- **互动图像尺寸优化**：将双人互动覆盖层图像尺寸从 220px 缩减至 176px（原尺寸的 80%），使其与单人图像比例更和谐，并同步调整了垂直显示位置。
- **状态条视觉对齐修复**：修复了状态面板中进度条视觉上始终显示为满格的 Bug。
- **默认状态初始化**：在 CSS 中将状态条初始宽度设为 0，消除了数据加载前的视觉瑕疵。

### Changed
- **架构解耦**：`src/ui/StatusBar.js` 演变为通信代理，负责将渲染进程的宠物数据快照同步至独立的状态面板窗口。
- **窗口管理优化**：主窗口现在会监听显示器插拔及分辨率变化事件 (`display-metrics-changed`) 并自动调整大小。

## [0.1.8] - 2026-05-11
### Added
- **托盘手动检查更新**：新增 `updateManager.js` 与托盘菜单入口，打包版本可通过 GitHub Releases 检查并下载更新。
- **发布决策记录**：新增 `docs/decisions/ADR-020-windows-release-and-code-signing.md`，记录 Windows Release、手动 tag 发布修正与代码签名策略。
- **Windows 可选代码签名发布流程**：GitHub Actions 可在存在签名密钥时生成签名安装包；没有 `WIN_CSC_*` secrets 时会继续生成未签名安装包，适合小范围分发。
- **签名验证脚本**：新增 `scripts/verify-signatures.ps1` 和 `npm run verify:signatures`，用于检查安装包的 Authenticode 签名状态。
- **更新管理器测试**：新增 `node:test` 覆盖更新检查、下载确认、安装确认、进度条和常见失败提示。

### Changed
- **Windows 可执行文件签名**：默认关闭 `build.win.signAndEditExecutable`，避免小范围发布被付费证书阻塞；CI 在检测到签名 secrets 时可临时启用签名。
- **NSIS 安装环境初始化**：安装脚本在自定义安装阶段设置输出目录并请求管理员权限，降低中文路径或受限环境下插件目录初始化失败的概率。
- **证书文件保护**：`.gitignore` 新增证书和私钥文件类型，降低误提交签名材料的风险。

## [0.1.7] - 2026-05-11
### Changed
- **GitHub Actions 兼容性维护**：将安装包 workflow 使用的官方 actions 升级到 Node.js 24 runtime 兼容版本，避免 GitHub Actions 的 Node.js 20 deprecation warning。
- **Release workflow 修正**：修复手动执行安装包 workflow 时只创建 tag、构建发布 job 被跳过的问题；手动运行现在会在同一次 workflow 中创建/复用 tag 并继续构建发布。
- **文档路径清理**：将归档 walkthrough 和结构文档中的本机绝对路径替换为仓库相对路径，减少环境绑定。

## [0.1.6] - 2026-05-10
### Added
- **后续功能扩展规划**：新增 `docs/plan/feature-ideas-plan.md`，从生产力工具、环境感知与沉浸感、以及皮肤图鉴收集三个维度规划了桌宠未来的长线功能。

### Changed
- **系统架构图档更新**：更新 `docs/structure.md`，在架构图及渲染链条中补充了已重构上线的 `SpriteView` 组件，移除了已废弃的 `PetAnimations.js` 相关描述，并更新了后续拓展方向。

### Fixed
- **睡眠模式时间跳跃处理**：修复了电脑休眠唤醒后 `deltaMs` 巨大导致数值不更新、对话不触发以及物理系统潜在崩溃的 Bug。
  - 引入了睡眠唤醒自动检测与即时离线结算机制。
  - 保留未满一个衰减周期的离线时间余量，避免 60 秒到 5 分钟之间的挂起时间被吞掉。
  - 增加了唤醒后的“离线时长”对白提示。
  - 优化了 `TimeSystem` 累加器逻辑，增强了极端时间跨度下的稳定性。
- **架构决策记录**：新增 ADR-019 详细记录了睡眠模式的时间处理策略。

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
