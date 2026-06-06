# Changelog
本文件记录 DeskPet（岳七 & 沈九修仙桌宠）的所有重要变更。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [Unreleased]
### Changed
- **测试配置归一化与文档同步**：将本地打包更新测试配置归档至 `docs/archive/` 目录，并同步更新了 [structure.md](docs/structure.md) 和 [ADR-025](docs/decisions/ADR-025-visible-update-progress-and-local-update-testing.md)。
- **README.md 文档样式统一**：补全了 README.md 中部分三级标题和系统托盘功能列表缺失的 emoji 图标，使其与多语言配置（i18n.js）保持一致。

### Removed
- **本地打包更新测试配置**：从项目根目录移除了 `electron-builder.update-test-new.yml` 和 `electron-builder.update-test-old.yml`（已移动归档）。

## [0.6.1] - 2026-06-04
### Added
- **IPC 返回契约决策记录**：新增 [ADR-032](docs/decisions/ADR-032-ipc-result-shape.md)，记录新增和迁移后的 IPC handler 优先使用 `{ success, data }` / `{ success, error }` 结果对象，以及既有广覆盖接口渐进迁移的兼容策略。
- **键盘活动感知计划**：新增 [keyboard-activity-awareness-plan.md](docs/plan/keyboard-activity-awareness-plan.md)，规划仅基于键盘活动节奏影响宠物行为的实现路径，明确不引入用户皮肤导入功能，并记录主进程活动观察、preload 安全订阅、renderer 行为系统、移动/互动降噪、隐私边界与 MVP 切分。

### Fixed
- **Codex 临时目录误提交修复**：从 Git 索引移除误提交为 gitlink 的 `.codex/tmp-baebae-pet`，恢复 `git submodule status` 正常执行，并在 `.gitignore` 中新增 `.codex/tmp-*/` 防止临时工作目录再次入库。
- **IPC 边界加固**：在渲染进程输入触达主进程行为前，校验鼠标穿透、macOS 显示器迁移、状态窗口尺寸和皮肤切换等 IPC 参数。
- **编码检查说明**：确认 README、package、preload 和 changelog 文本均以 UTF-8 正常存储；PowerShell 可能因控制台编码显示乱码，后续不要仅凭终端显示结果重写项目文本。
- **macOS 睡眠模式数值不衰减**：修复了 Mac 进入睡眠模式后桌宠属性（饥饿/灵力/心境）不衰减的 Bug。根因：macOS 的 `performance.now()` 在睡眠期间冻结，导致游戏循环的 `deltaMs > 60000` 检测永远不触发。修复方案：利用 Electron `powerMonitor` 的 `suspend`/`resume` 事件，在主进程记录 `Date.now()` 墙钟时间戳，唤醒后通过 IPC 通知渲染进程用真实时间差结算离线衰减。与原有的 Windows 帧间隔检测路径共存，互不干扰。更新 [ADR-019](docs/decisions/ADR-019-handling-time-jumps-after-system-sleep.md) 补充双轨策略说明。

### Changed
- **IPC 返回契约统一起步**：新增统一 IPC 成功/失败结果 helper，并将 `set-current-skin` 迁移为 `ipcMain.handle` / `ipcRenderer.invoke`，成功返回 `{ success: true, data: { skinId } }`，校验和内部错误返回结构化 `error`；`saveData`、`loadData` 等广覆盖接口保持既有兼容形状。
- **Preload 订阅清理函数**：所有暴露的 `window.electronAPI.on*` 订阅现在都通过共享 preload helper 返回 cleanup 函数。
- **安全决策记录补充**：在 [ADR-014](docs/decisions/ADR-014-electron-security-hardening.md) 中补充 IPC 边界输入校验和 preload 订阅生命周期约束。
- **Release 移除源码归档**：在 Build Installers workflow 的 Windows 和 macOS 两个 job 中各新增一步，使用 `gh release delete-asset` 自动删除 GitHub 为每个 Release 自动附加的 `Source code (zip)` 和 `Source code (tar.gz)` 归档，使发布产物仅包含安装包和说明文件。

## [0.6.0] - 2026-06-02
### Added
- **久坐提醒 MVP**：新增 `breakReminderService.js` 和 `presentationGuard.js`，实现基于 `powerMonitor.getSystemIdleTime()` 的低频采样久坐提醒。默认每 60 分钟提醒一次，空闲 5 分钟自动重置。macOS 不做全屏检测，Windows 全屏/演示模式下延后 60 秒重试。
  - 托盘菜单新增开关和间隔选择（30/45/60/90/120 分钟），配置通过 `electron-store` 持久化。
  - 提醒触发时两个小人瞬移到主显示器中心面对面，显示随机对话气泡（中/英/日各 5 句×2 角色），20 秒后自动消失或点击小人提前关闭。
  - 新增 `testBreakReminder()` 调试入口。
  - 新增 [ADR-031](docs/decisions/ADR-031-break-reminder.md) 记录设计决策。
  - 新增 41 项自动化测试覆盖计时、空闲重置、演示延后、配置归一化和跨层集成。

### Changed
- **久坐提醒文档补充**：在 `readme.txt`、`readme_en.txt` 和 `readme_ja.txt` 中补充久坐提醒功能和托盘控制说明，包括提醒间隔选项、隐藏时不补弹以及空闲重置行为。
- **久坐提醒三语文案统一**：对齐三种语言中的久坐提醒标签和对话文案，使其与当前 i18n 用词保持一致。
- **初始发呆时间配置化**：启动时岳七和沈九的初始发呆计时器现在统一使用 `CONFIG.IDLE_DURATION_MIN/MAX`，不再分别使用两套硬编码随机范围。
- **文档规范补齐**：补齐 `ADR-010` 历史编号保留记录，为 `ADR-019` 增加备选方案说明，并同步 `docs/structure.md` 中的窗口感知架构索引。
- **托盘菜单与文档优化**：将 macOS 专属的“切换屏幕”选项调整至托盘菜单上半部分（“重置位置”下方）；为 `README.md` 补齐了“久坐提醒”与“界面感知”功能的详细说明，并统一了 `readme.txt` 中托盘菜单项的排版格式。

### Fixed
- **macOS 多显示器热拔插与跨屏迁移修正**：修复了在桌宠运行期间插入外接显示器时，因 macOS/Electron 偶尔漏报或延迟触发 `display-added` 事件，导致主程序未能及时识别新屏幕的问题。通过在“活动窗口感知”循环中加入降级轮询检测（Fallback Polling），确保热插拔后托盘菜单能正确恢复“切换屏幕”选项，并使桌宠在走到新屏幕边界时能够正确触发跨屏迁移，不再走入未渲染的虚无区域。
- **macOS 多显示器迁移修正**：让边缘自动迁移把 `WALK_TARGET_MARGIN` 计入触发范围，避免宠物正常行走时永远到不了 5px 边缘阈值；补充相邻显示器选择回归测试，并移除多屏适配路径的调试日志。
- **恢复 macOS 多显示器支持**：修复了因代码合并丢失的 macOS 多显示器单屏迁移功能。恢复了通过拖拽至屏幕边缘跨屏，以及通过托盘菜单“切换屏幕”选项在不同显示器间迁移桌宠的能力，并解决了因原实现中坐标偏移导致的闪回问题。
- **久坐提醒状态恢复修正**：避免提醒投递失败后服务一直等待 renderer 关闭回执，并允许界面感知关闭时继续触发久坐提醒。
- **久坐提醒主显示器定位修正**：通过 `screen-info` 的 `walkAreas` 传递主显示器标记，使提醒位置使用 `screen.getPrimaryDisplay()` 对应的 walkArea，不再按面积最大的显示器区域推断。
- **安全性修复**：修复 `main.js` 中的潜在路径遍历漏洞（增强 `scanAvailableSkins` 的路径校验）与 XSS 跨站脚本风险（将更新进度窗口的动态数据流从 HTML 字符串插值重构为完全静态 HTML 加安全的 `executeJavaScript` 调用）。

## [0.5.1] - 2026-05-29
### Changed
- **三语用户说明更新**：在 `readme.txt`、`readme_en.txt` 和 `readme_ja.txt` 中补充界面感知/Realm Awareness/境界に乗る的托盘菜单入口与行为说明，明确桌宠会感知活动窗口、任务栏或 Dock 的边缘。
- **CP 互动心境收益对等调整**：将所有 CP 互动中七哥（岳七）的心境收益统一调整为与小九（沈九）相同：分享食物 `+3`，一起修炼 `+5`，亲亲 `+10`，拥抱 `+8`，打招呼 `+1` 不变。

## [0.5.0] - 2026-05-29
### Added
- **窗口感知 MVP**：新增主进程活动窗口 provider、面向渲染进程的安全 IPC 订阅、渲染进程 `WindowAwarenessSystem`，以及移动目标接入，使 idle 状态下的桌宠可以走到 Windows 当前活动窗口顶部边缘。
- **任务栏/Dock 平台走动**：从显示器 `bounds/workArea` 推导底部横向任务栏平台，并通过 `screen-info` 传给渲染进程，使桌宠在没有窗口平台优先目标时可以低频走到任务栏上边缘停留；解除 `win32` 限制，**正式支持 macOS 底部 Dock 平台感知**；DevTools 新增 `debugTaskbarPlatforms()` 和 `testTaskbarAwareness()` 调试入口。
- **表面感知托盘开关**：Windows 和 macOS 的托盘菜单均提供该开关（在 macOS 上，因活动窗口感知仍处于兜底不可用状态，该开关实际用于控制是否在 Dock 上行走）；Linux 等其他平台显示不可用兜底文案；DevTools 新增 `debugWindowAwareness()` 调试入口。
- **窗口感知架构记录**：新增 [ADR-030](docs/decisions/ADR-030-window-awareness.md)，记录 provider 边界、fallback 行为和 macOS 后续支持范围。
- **修仙状态面板彩蛋**：在状态面板右下角新增了一行不显眼的白色加粗半透明英文水印“Make QiJiu Great Again!”，提升了趣味性。

### Changed
- **移动目标选择**：`MovementSystem` 现在可通过 `setSurfacePlatforms()` 接收活动窗口平台和任务栏平台；窗口平台优先，任务栏/Dock 平台低频出现。
- **任务栏与活动窗口边缘驻留**：小宠物如果走到了任务栏/Dock 或活动窗口上边缘停下，在重新选择移动目标时会有 70% 的概率继续沿着当前边缘左右溜达，而不是立刻跳回到普通桌面。
- **表面感知降级回退**：窗口感知数据过期、不可用、最小化、最大化、全屏或被关闭时，仍无缝回退到现有显示器 walk area 行为。
- **托盘菜单分组优化**：将“窗口感知”功能开关移动至下方，与语言、自动启动等统一归为“软件功能”组。
- **本地化文案优化**：将日语的“窗口感知（ウィンドウ感知）”功能名优化为更有桌宠氛围的“ウィンドウに乗る”；明确了三国语言中更新弹窗里的“重启”文案为“重启桌宠/应用”，消除了用户误认为是系统重启的顾虑。
- **表面感知文案修仙化**：将中日英三语的“窗口感知”托盘文案统一修改为更具修仙代入感的“界面/境界感知”（中文：界面感知，英文：Realm Awareness，日文：境界に乗る），避免在修仙游戏世界观中出现“UI”或“Window”等出戏的现代词汇。
- **状态面板自适应排版**：将修仙状态面板底层的属性排版从固定宽度的 Flexbox 重构为 CSS Grid，并将状态标签列设为 `max-content`。这彻底解决了在中文和日文环境下（因标签字数较少）状态条左侧留白过多、显得短小的问题，使得任何语言下彩色状态条都能无缝撑满剩余空间并完美对齐。
- **窗口感知验收与文档规范**：在 `docs/plan/window-awareness-plan.md` 中核对了所有自动化测试与手动验证项；并将 `ADR-030-window-awareness.md` 翻译为中文，统一项目文档语言规范。
### Fixed
- **窗口感知内存压力**：将 Windows 活动窗口采样频率从 `3000ms` 降低到 `10000ms`，并将 renderer 侧窗口平台 TTL 延长到 `22000ms`，减少反复启动 PowerShell/User32 provider 的成本，同时让平台缓存稳定覆盖两个采样周期。
- **窗口顶部平台循环**：当桌宠无法完整站在活动窗口顶部可见区域内时，跳过该窗口顶部平台；并将靠近屏幕顶部的过期窗口平台目标重新定向回普通可行走区域。
- **窗口感知探测**：Windows 活动窗口采样现在会跳过本应用自己的前台窗口，并沿 z-order 继续查找后方窗口，使 DevTools 中执行探测时也能找到底下的外部窗口。
- **活动窗口上的桌宠输入**：鼠标停留在桌宠身上时不再让交互租约自动过期，避免拖拽和右键菜单点击穿透到下方的非最大化活动窗口。
- **窗口顶部目标概率**：修正活动窗口平台目标选择，使 `70%` 的窗口顶部概率和实际坐标范围一致，未命中时不再偷偷继续使用窗口顶部平台。
- **窗口平台缓存 TTL**：将 renderer 侧窗口平台 TTL 提高到 `22000ms`，覆盖主进程 `10000ms` 采样间隔，避免 `main.platform` 有值但 `renderer.platform` 周期性变成 `null`，导致宠物很少采用窗口顶部目标。
- **状态面板底部裁剪修复**：将状态窗口向主进程发送动态高度调整的测量基准从内部的 `contentEl.scrollHeight` 修正为整块面板的 `panel.scrollHeight`，修复了面板新增底部元素后导致计算高度不足，从而在 `overflow: hidden` 限制下把圆角和底部文字“一刀切”的问题。
- **测试稳定性修复**：在 `movementSystem.test.js` 中通过 mock `Math.random` 修复了偶发的窗口感知行走目标越界测试失败问题，保证 CI 自动化测试的绝对确定性。


## [0.4.3] - 2026-05-27
### Added
- **macOS 托盘切换屏幕菜单**：多显示器环境下新增“切换屏幕”托盘子菜单，可手动将桌宠移动到指定屏幕，并标记当前所在屏幕。
- **显示器窗口适配辅助模块**：新增 `displayFit.js`，用于合并 Electron 显示器变化事件、判断窗口 bounds 是否已匹配目标值，并在重新设置窗口大小前桥接 min/max 尺寸约束。

### Changed
- **macOS 手动更新机制优化**：在无证书环境下，点击“检查更新”时，现在会先通过 GitHub API 获取最新版本，并在弹窗中清晰对比当前版本号与最新版本号。如果没有新版本，会提示“已是最新版本”。此外，在检查更新期间，托盘菜单会显示为“正在检查更新...”。
- **CP 互动心境收益调整**：调整自动互动的双方心境收益分布；一起修炼为岳七 `+8`、沈九 `+5`，亲吻为岳七 `+2`、沈九 `+10`，拥抱为岳七 `+2`、沈九 `+8`。
- **多显示器 ADR 更新**：补充 `ADR-022` 中托盘切换屏幕和显示器热插拔刷新等设计边界。
- **项目结构文档更新**：补充 `displayFit.js`、显示器事件合并机制、测试覆盖和 `ADR-028` 索引。

### Security
- **依赖安全审计与修复**：运行全量 `npm audit` 和生产依赖 `npm audit --omit=dev`，修复 dev 依赖链中的 `tmp <0.2.6` high 漏洞；复核后全量与生产依赖审计均为 `0 vulnerabilities`。见 [ADR-029](docs/decisions/ADR-029-security-audit-and-local-hardening.md)。
- **DOM 注入面硬化**：将 `PetRenderer` 的动态宠物节点渲染从 `innerHTML` 改为 `document.createElement` / `textContent`，并新增测试防止回退到动态 HTML 拼接。
- **脚本命令注入面硬化**：将 `scripts/convert_images.js` 中的 `ffmpeg` 调用从 shell 字符串改为 `spawnSync` 参数数组，避免带特殊字符的文件路径影响命令解析。
- **本地密钥忽略规则补齐**：在 `.gitignore` 中补充 `.env.local`、`.env.*.local` 和 `*.key`，降低本地配置或私钥误提交风险。

### Fixed
- **Electron 开发启动环境修复**：修复依赖同步后 `node_modules/electron/dist/electron.exe` 缺失导致 `npm run dev` 报 `Electron failed to install correctly` 的问题，重新安装 Electron 42.2.0 二进制并验证 `electron --version` 返回 `v42.2.0`。
- **macOS 数位板连接后窗口和桌宠图片多次 resize**：修复连接数位画图板后，Electron 连续触发 `display-added` / `display-removed` / `display-metrics-changed` 导致主透明窗口和宠物视觉比例短时间多次变化的问题。现在显示器变化事件会先合并等待 `250ms`，只应用最后一次窗口适配；设置新 bounds 前会临时放宽 min/max 约束，完成后再锁回目标尺寸，避免 macOS/Electron 在旧约束和新 bounds 之间来回校正。见 [ADR-028](docs/decisions/ADR-028-coalesce-display-metrics-window-fit.md)。
- **macOS 显示器热插拔菜单刷新**：显示器新增、移除或参数变化时同步刷新托盘菜单，避免“切换屏幕”列表继续使用过期的显示器信息。
- **Windows 升级安装后桌面重复快捷方式**：修复通过安装包覆盖升级后，桌面出现两个快捷方式的问题。根因：NSIS `oneClick: false` 模式下升级安装时，安装程序会无条件创建快捷方式，若用户在历史版本中将快捷方式从开始菜单拖到桌面，或者旧版安装产生了多余的 `.lnk` 文件，则新安装的快捷方式与旧文件同时存在。修复方案：在 `build/installer.nsh` 的 `customInstall` 宏中主动清理桌面和开始菜单下的旧 `DeskPet.lnk`（历史曾用名，当前不适用），并记录此问题供后续深入排查。
- **Windows 修仙状态窗口宽度自动增大**：修复状态窗口在 Windows 上打开后宽度持续增大的问题。根因是一个渲染→调整→渲染的反馈循环：`getBoundingClientRect()` 读到的宽度随父容器变化，每次 `setContentSize()` 后窗口变宽，`width: 100%` 的 panel 跟着变宽，导致下次测到的值更大，如此循环。修复方案：将 `.status-panel` 改为 `width: max-content`（panel 由内容驱动而非父容器），并改用 `panel.scrollWidth`（内容固有宽度，不随窗口变化）测量宽度，彻底打断反馈循环；同时保留 `min-width: 320px` / `max-width: 480px` 兜底，适应不同系统字体和 DPI 缩放。见 [ADR-027](docs/decisions/ADR-027-status-window-width-growth-fix.md)。

## [0.4.2] - 2026-05-26
### Added
- **macOS 多显示器单屏迁移模式**：macOS 下桌宠主窗口改为覆盖当前显示器，并支持走到屏幕边缘或拖拽到相邻屏幕时迁移窗口，让桌宠在多屏环境中切换显示器时更稳定。
- **多显示器相邻屏幕识别测试**：为相邻显示器查找逻辑补充右侧、左侧、负坐标、小间隙、无重叠和非法输入等回归测试。

### Changed
- **项目结构文档更新**：重写 `docs/structure.md`，补齐当前目录树、主进程/渲染进程职责、皮肤、多语言、更新、多屏、测试覆盖和 ADR 索引说明。
- **多显示器 ADR 更新**：补充 `ADR-022` 中 macOS 单屏窗口迁移模式、相邻屏幕识别、拖拽跨屏迁移等设计边界。
- **性能优化**：移除 `PetRenderer` 中冗余的 `pet--flipped` DOM 类操作，减少无意义的重绘。
- **发布脚本兼容性**：改进 `push.sh` 脚本，增加 Linux (`xdg-open`) 和 Windows (`start`) 跨平台打开 CHANGELOG.md 的兼容支持。
- **图片转换脚本鲁棒性**：提高 `convert_images.js` 对 `.png` 大小写的兼容，并使用精确的正则表达式替换避免误伤文件路径。
- **文档中文化与内容更新**：将发布代码签名说明、代码审查报告、多显示器调试交接文档以及项目结构等相关文档翻译并更新为中文。

### Fixed
- **macOS unsigned installer workflow**: Stop running unconditional `codesign --verify` on unsigned macOS build outputs, so x64 and arm64 unsigned packages no longer fail metadata validation after packaging.
- **macOS 手动更新启动兼容性**：打包时保留外层 `七九爱宠.app` 名称，但将包内 `CFBundleExecutable` 改为 ASCII 的 `DeskPet`，避免覆盖安装后 Finder / LaunchServices 找不到中文可执行文件而表现为 Dock 图标跳动后无法加载；同时更新手动更新提示，要求用户先退出旧版本再替换应用。
- **macOS 系统版本说明校正**：显式声明安装包最低支持 macOS 12.0，与 Electron 42 生成的 `LSMinimumSystemVersion` 保持一致，避免 macOS 11 用户误以为当前包可运行。
- **macOS 发布流程保护**：在 Release Preflight 和 Build Installers 两个 GitHub Actions workflow 中增加 macOS 可执行文件元数据校验，防止 `CFBundleExecutable` 回退到中文文件名后仍被发布。

## [0.4.1] - 2026-05-25
### Added
- 新增 DevTools Console 调试入口 `testGreet()`，可手动触发问候互动。
- **第二套皮肤“鸟塑七九・凉拌仓鼠”**：
  - 新增了 `src/assets/birds/` 资源目录，图片均已转换为 256px WebP 格式。
  - 在 `src/data/i18n.js` 中增加了中/英/日多语言皮肤名称支持。

### Changed
- **皮肤菜单排序逻辑优化**：`main.js` 中的皮肤扫描逻辑会强制确保 `default` 皮肤始终排在托盘菜单的第一位。

### Fixed
- **固定角色朝向资源，移除图片镜像翻转**
  - 移除 `.pet--flipped` 对角色图片的 `scaleX(-1)` 镜像效果，避免任何状态下出现左右翻转。
  - 互动问候时改用对应方向行走素材的第二帧作为静态朝向图，确保两人面对面且不依赖图片翻转。
- **macOS 更新机制优化（无证书适配）**：
  - 修复了 macOS 无 Apple Developer 证书（Ad-hoc 自签名）时，因新旧版本代码签名不匹配触发 Squirrel.Mac 校验报错（`Did not pass validation: コードは指定されたコード要件を満たしていません`）导致更新流程阻断的问题。
  - 重构了 macOS 下的更新管理器逻辑，新增 `createMacManualUpdateManager` 专用于无证书环境。当用户在 macOS 平台点击“检查更新”时，绕过 Squirrel 自动更新，改为弹窗引导并使用浏览器打开 GitHub Releases 页面供用户下载最新 DMG 覆盖安装。
  - 在 `src/data/i18n.js` 中补充了中、英、日三种语言对应的 macOS 手动更新引导文案及按钮文本（`updateMacManualTitle` / `updateMacManualMsg` / `updateMacManualBtn`）。

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
