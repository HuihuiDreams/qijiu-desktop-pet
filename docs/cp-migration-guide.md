# 更换 CP 的迁移指南

本指南用于把岳七 × 沈九桌宠改成另一对角色，覆盖角色设定、素材、对白、互动、存档和独立发布。按 2026-10-08 的仓库实现整理；开始迁移时应重新核对下文引用的代码。

当前程序不是可直接导入任意 CP 的通用模板：角色 ID、素材路径和部分角色行为仍写在代码里。第一次迁移建议保留双人桌宠结构，先替换内容；需要完整重命名时，再单独完成 ID 迁移。

## 1. 先确定迁移范围

| 路径 | 做法 | 适用情况与代价 |
| --- | --- | --- |
| 内容替换（建议首次采用） | 保留 `yueqi` / `shenjiu` 作为内部角色 A / B 槽位，替换展示姓名、全部素材和文案 | 改动少，但源码、目录和翻译键仍保留旧名称；用户界面应显示新角色 |
| 完整重命名 | 把内部 ID、目录、字典键、CSS、调试入口和测试统一改成新角色名称 | 维护时更直观，但不能只改 `CONFIG.PET_A.id` / `PET_B.id`，必须追踪所有引用 |

“是否独立发布”与这两条路径分开决定。保留旧内部 ID 的版本也可以作为独立新应用发布，但仍要完成第 7 节的应用身份、数据与更新隔离。

动手前记录一张角色映射表，并在整个迁移期间保持一致：

| 项目 | 角色 A（原岳七） | 角色 B（原沈九） |
| --- | --- | --- |
| 新角色正式名 / 昵称 / 三语写法 | 待填 | 待填 |
| 保留 ID 时的内部标识 | `yueqi` | `shenjiu` |
| 配置槽位 / 存档槽位 | `PET_A` / `petA` | `PET_B` / `petB` |
| 单人素材前缀 / 默认朝向 | `left` / `left` | `right` / `right` |
| 走动帧目录 | `yueqi/` | `shenjiu/` |
| 当前双人叠加图中的位置 | 右侧 | 左侧 |
| 性格、互相称呼、动作发起方 | 待填 | 待填 |

同时确定：是否保留修仙世界观、分食偏心、梦话联动、亲吻拥抱和 CP 屏保；是否继承旧养成进度；是否保留原皮肤种类。这些选择会影响对白、动作和数据兼容，不能靠替换姓名自动完成。

## 2. 仓库维护方式与迁移基线

### 2.1 现阶段建议使用同仓库 CP 分支

如果七九版和新 CP 版仍使用同一套桌宠机制，而且希望持续共享新功能，现阶段建议在同一个仓库建立新 CP 分支。这样保留共同提交历史，通用功能可以通过合并同步。以下用 `main` 表示默认维护分支；实际操作以仓库的默认分支名称为准。

| 方式 | 新功能如何同步 | 适用情况与代价 |
| --- | --- | --- |
| 同仓库、不同 CP 分支（现阶段建议） | 通用功能进入 `main`，各 `cp/<名称>` 分支合并 `main` | 适合第二对 CP 的初次迁移；长期分支差异会增加冲突，需要持续同步 |
| 独立仓库或 fork | 保留上游关系，通过合并上游或 `cherry-pick` 引入提交 | 适合维护团队、权限或产品方向需要分开的情况；仍可共享功能，但需要额外维护上游接线与同步流程 |
| 同一分支、不同 CP 配置和素材包（长期方向） | 通用代码只改一次，各 CP 使用自己的内容和构建配置 | 共享成本最低，但当前硬编码尚未提取，不能只加一个配置文件就直接实现 |

分支职责建议如下：

- `main`：继续维护七九版，承载天气、番茄钟、窗口管理等通用功能和通用修复。
- `cp/<新CP名称>`：从验证通过的 `main` 提交建立，主要修改角色素材、对白、配色、专属互动和独立发行配置。
- 临时功能分支：通用改动完成验证后回到 `main`；新 CP 开发中发现的通用修复，也应单独整理回 `main`，再同步到其他 CP。

**通用机制与 CP 专属内容尽量分开提交。** 例如新增提醒功能时，提醒计时、IPC 和窗口行为放在一个提交，七九专属对白与素材放在另一个提交。这样新 CP 引入机制时更容易保留自己的内容；不需要让每个 CP 重写提醒系统。

### 2.2 七九版新增功能后，如何同步到新 CP

1. 在 `main` 完成功能和相关测试，记录哪些改动属于通用机制、哪些依赖七九设定。
2. 确认新 CP 分支已有改动已保存并可回退，再把经过验证的 `main` 合并进 `cp/<名称>`。持续共享功能时优先定期合并，避免分支长期落后。
3. 对冲突逐项核对：保留新 CP 的姓名、三语对白、素材映射、互动设定、应用身份、存档隔离和更新源，接入新的通用逻辑。不要对整个文件统一选择“保留本分支”或“采用上游”，两者都可能丢失需要的改动。
4. 为新功能补齐新 CP 对应的三语文案和素材，适配角色专属行为；运行相关测试、`npm test`，并按第 8 节验收新功能和原有角色表现。
5. 更新新 CP 的变更记录和用户说明。需要提交/推送时按 [Git 工作流](./git-workflow.md) 使用项目的 `push.ps1` / `push.sh`，每个 CP 的发行仍按第 7 节保持独立身份和更新链。

如果某个 CP 只需要一个已独立提交的功能，可以选择 `cherry-pick`，并记录来源提交及依赖。若日后还会合并整个 `main`，需检查重复引入和冲突；不要长期靠零散挑选提交代替正常同步。

### 2.3 逐步转向共享程序与 CP 内容包

第一次迁移不必做大规模重构。随着第二对 CP 的接入，把反复产生冲突的角色差异逐步提取到配置中：角色姓名与 ID、三语对白、素材路径、配色、动作发起方及专属规则。通用系统读取这些配置，各 CP 保留独立内容和发行设置。

当两对 CP 已能通过配置完整表达差异，再考虑放到同一分支维护，使以后新增通用功能一次修改即可供各 CP 使用。此结构是后续演进建议，当前仓库尚未实现；真正改变角色配置或构建架构时，应另写 ADR 并补充两对 CP 的回归测试。

### 2.4 建立迁移基线

1. 按第 2.1 节选择维护方式，建立专用 CP 分支或新仓库，保留可回退的原版本；先用 `git status --short` 确认已有改动。
2. 备份原画和用户数据，记录版本、现有皮肤及应用身份；不要让开发验证覆盖正在使用的七九存档。
3. 在仓库根目录运行 `npm ci`、`npm test`，记录迁移前结果。
4. 每次只完成一个迁移步骤：修改 → 相关测试与人工检查 → 同步中文 `CHANGELOG.md` 和相关文档，再进入下一步。

运行开发版本时可使用已有 QA 数据隔离入口（见 [`main.js`](../main.js)）：

```powershell
$env:DESKTOP_PET_USER_DATA_DIR = Join-Path $env:TEMP 'deskpet-new-cp-dev'
npm run dev
# 退出应用后，移除当前终端中的覆盖配置
Remove-Item Env:DESKTOP_PET_USER_DATA_DIR
```

这会把开发数据写到指定目录；目录会保留供下一次验证使用。该环境变量只用于开发/QA，正式发行的数据隔离见第 7 节。

## 3. 修改角色名称、主题和对白

### 3.1 要修改的入口

| 文件 | 需要检查与替换的内容 |
| --- | --- |
| [`src/data/config.js`](../src/data/config.js) | `PET_A` / `PET_B` 的 `name`、`nickname`、`emoji`、默认素材；完整重命名时再改 `id` |
| [`src/data/i18n.js`](../src/data/i18n.js) | `zh` / `en` / `ja` 三份 UI 与对白，角色正式名、昵称、菜单动作、皮肤名和画师名、托盘标题、状态页脚、番茄钟及更新文案 |
| [`src/data/dialogues.js`](../src/data/dialogues.js) | `_DIALOGUES_ZH_FALLBACK` 中文兜底对白，与新角色设定同步 |
| [`src/ui/ContextMenu.js`](../src/ui/ContextMenu.js) | 角色菜单及喂食、打坐、关怀、休息的硬编码兜底文案 |
| [`src/systems/AmbientDialogueSystem.js`](../src/systems/AmbientDialogueSystem.js) | 时段问候、低状态提醒、夜间梦话、角色联动及兜底文案 |
| [`src/systems/InteractionSystem.js`](../src/systems/InteractionSystem.js)、[`src/debug.js`](../src/debug.js) | 吃撑互动与调试工具里的旧角色台词 |
| [`src/index.html`](../src/index.html) 及其他子窗口 HTML | 页面标题、静态初始文字和 `data-i18n` 对应文案 |
| [`src/index.css`](../src/index.css)、[`src/status.css`](../src/status.css)、[`src/stat-bar.css`](../src/stat-bar.css)、[`src/pomodoro.css`](../src/pomodoro.css)、[`src/effects.css`](../src/effects.css) | 角色配色、占位图、光晕、修仙装饰；按新主题需要调整 |
| [`src/pet/SpriteView.js`](../src/pet/SpriteView.js) | 两名角色的状态图片和 `emojiMap`，避免缺图时出现原角色的标志性 emoji |

**只改 config 里的名字不够。** 独立状态窗口 [`src/statusWindow.js`](../src/statusWindow.js) 会按角色 ID 拼出 `nameYueqi` / `nicknameYueqi` 等翻译键，优先使用字典的姓名。保留 ID 时，要把这些旧键的值改成新角色姓名；完整重命名时，要同步提供新 ID 对应的键。

### 3.2 对白应按人物重写

正常运行的 `DIALOGUES` 由 `initDialogues(locale)` 从 `I18N[locale].dialogues` 初始化；只改 `dialogues.js` 的中文兜底不会改变正常运行的对白。

逐项检查三语字典中的：

- 问候、发呆、喂食、休息、打坐及关怀回复。
- `greet`、`shareFood`、`cultivate`、`kiss`、`hug`、`throwup` 双人互动。
- 天气、时段、低饱腹/灵力/心境、离线归来、窗口感知和久坐提醒。
- `dream.lowAffection`、`dream.highAffection`、`dream.linked` 梦话，以及 `screensaverCaught` 屏保被发现的反应。
- `ui` 中函数类型的动态文案：保留参数和返回值约定，替换人物称呼及世界观内容。

保留内部 ID 时，继续使用字典中的 `yueqi` / `shenjiu`、`petYueqi` / `petShenjiu` 等键，只替换内容。特别注意当前 `petYueqi` 的展示文字是“小九撒娇”，`petShenjiu` 是“七哥关怀”：菜单表达的是两人之间的动作关系，要根据新 CP 重新确定措辞。

若改成现代或其他世界观，可把“灵力”展示为“精力”、“打坐”展示为适合角色的恢复活动、“苍穹静修”改成新主题番茄钟。仅换文案时可保留 `qi`、`meditating`、`cultivate` 等内部字段；改变实际恢复规则时，再修改逻辑并更新测试。

## 4. 准备和接入新素材

详细裁切与转换规则见 [皮肤素材处理指南](./skin-pipeline-guide.md)，需求表见 [皮肤素材清单](./skin_assets_requirements.csv)。以下是当前代码实际使用的命名约定。

### 4.1 每套皮肤的资源

素材放在 `src/assets/<skinId>/` 下。保留内部 ID 时：

| 类型 | 文件名 | 含义 |
| --- | --- | --- |
| 必要单人立绘 | `left.webp`、`right.webp` | 分别为角色 A、B，不能理解为双人图中的站位 |
| 必要走动帧 | `yueqi/walk_left01.webp` 至 `04`、`walk_right01.webp` 至 `04`；`shenjiu/` 同样一组 | 每名角色左右各 4 帧；方向必须与文件名一致 |
| 单人状态图 | `left_cultivate.webp`、`left_hungry.webp`、`left_sleep.webp`、`left_eat.webp`、`left_pat.webp`；角色 B 使用同名 `right_` 前缀 | 打坐、饥饿、睡眠、吃饭、被摸；建议全部提供，缺图会进入降级显示 |
| 双人互动图 | `shareFood.webp`、`hug.webp`、`kiss.webp`、`cultivate.webp`、`throwup.webp` | 对应分食、拥抱、亲吻、一起恢复、吃撑；是否启用要与新 CP 设定一致 |

素材必须保留透明通道、按指南归一为 `256×256`，同组动画统一裁切边界并水平居中。原始素材另行备份，裁切脚本会覆盖 PNG。

**默认皮肤也必须替换。** 多处代码及画廊、番茄钟存在 `default` 路径或回退；只新增一套新 CP 皮肤会让首次启动、缺图或预览时仍可能显示七九。原有 `birds`、`animal_ears`、`school_au` 也应替换为新 CP 的版本，或从发行资源和映射中移除。

### 4.2 当前素材脚本的限制

- [`tools/run_trim.py`](../tools/run_trim.py) 的 `groups` 需要加入新素材的动画分组，再执行 `python tools/run_trim.py`。
- [`scripts/convert_images.js`](../scripts/convert_images.js) 当前 `skinDirs` 只包含 `animal_ears` 和 `school_au`。转换新目录或 `default` 前必须修改处理范围，否则执行脚本不会处理它们。脚本优先用 `ffmpeg`，失败后尝试 `python3` + Pillow；确认本机命令可用，并检查每张输出，不能只看脚本是否退出。
- [`test/assetDimensions.test.js`](../test/assetDimensions.test.js) 有固定皮肤列表和特定皮肤断言。更换皮肤目录时同步更新覆盖范围，避免新目录没有被检查。

### 4.3 同步皮肤映射和受保护资源

1. 修改 [`src/systems/SkinManager.js`](../src/systems/SkinManager.js) 的 `buildPaths()`；保留现有命名则不用改目录映射。必要时调整 `SKIN_IMAGE_SCALES`，并检查 [`src/pet/SpriteView.js`](../src/pet/SpriteView.js) 和 config 的默认路径。
2. 新增/删除皮肤 ID 时，在 [`src/main/services/SkinService.js`](../src/main/services/SkinService.js) 同步 `SKIN_NAME_KEYS`、`SKIN_LABEL_KEYS`、`SKIN_ARTIST_KEYS`，并补齐三语字典。无受保护清单时，开发目录扫描只接受已知映射中的皮肤。
3. 核对 [`skinGallery.js`](../skinGallery.js) 的预览文件候选和 `default/kiss.webp` 兜底；若命名约定未变，可保留代码。画师署名应与新素材匹配。
4. 核对 [`protectedAssetLoader.js`](../protectedAssetLoader.js) 的 asset ID 校验、加载与回退。现有字母、数字、下划线和连字符命名通常无需改加载器；不要为了新路径放宽目录穿越防护。素材清单由 [`scripts/protect-assets.js`](../scripts/protect-assets.js) 生成，不手工修改。
5. 执行 `npm run protect:assets` 并重启开发应用，检查清单只包含准备发行的皮肤。旧清单优先于明文扫描，改图或加皮肤后不刷新会看到旧内容。
6. 该生成脚本不会清除以前生成但已经无引用的 `.dat`。独立发行前，在确认备份并核对目录后清理旧生成输出，再重新生成；同时移除不再发行的旧素材目录，否则会再次被收集。
7. 同步 [`readme_zh.txt`](../readme_zh.txt)、[`readme_en.txt`](../readme_en.txt)、[`readme_ja.txt`](../readme_ja.txt) 的皮肤说明与署名。所有加载图片的子窗口 CSP 继续允许 `pet-asset:`。

`npm run build` 会通过 npm 的 `prebuild` 生成受保护资源；直接运行 `npx electron-builder` 时，应先显式运行 `npm run protect:assets`。

### 4.4 双人图的站位与气泡

当前双人图约定是 **角色 B（沈九）在左，角色 A（岳七）在右**，与单人 `left` / `right` 前缀的角色映射不同。新图最好沿用这一约定。

若新图改变站位或人物头部位置，要调整 [`src/pet/PetRenderer.js`](../src/pet/PetRenderer.js) 的 `INTERACTION_BUBBLE_HEAD_X` 和 `showOverlayBubbles()` 接线，并验证 [`src/ui/DialogBubble.js`](../src/ui/DialogBubble.js)、[`src/app.js`](../src/app.js) 的说话者对应关系。以实际常量与画面为准，不能只按历史注释中的百分比制作素材。要逐张检查两人的气泡是否落在正确角色上。

番茄钟单人图还要核对 [`src/main/services/PomodoroService.js`](../src/main/services/PomodoroService.js)、[`src/pomodoroWindow.js`](../src/pomodoroWindow.js) 的角色键和 `left_cultivate` / `right_cultivate` 映射。

## 5. 检查人物关系与互动规则

换 CP 时，先决定保留哪些玩法，再修改数值。当前规则中包含原角色关系的倾向：

| 设定 | 当前行为 | 修改入口 |
| --- | --- | --- |
| 分食偏心 | A 减少 5 点饱腹，B 增加 10 点；B 过饱可能展示 `throwup` | `CONFIG.INTERACTIONS.shareFood`、`InteractionSystem` 的资格与表现逻辑 |
| 一起修炼 | A 额外恢复 15 点饱腹，双方获得灵力等奖励 | `CONFIG.INTERACTIONS.cultivate` 及养成相关测试 |
| 梦话联动 | B 发起，A 延迟回应；当前概率为 30% | `AmbientDialogueSystem.showNightDream()`、`dream.linked.shenjiu` / `yueqi_reply` |
| 亲密动作 | 权重、好感阈值、奖励决定动作能否触发 | `CONFIG.INTERACTIONS`、`InteractionSystem` |
| CP 屏保 | 有独立动作编排，不能只通过自发互动权重控制 | [`src/systems/ScreensaverSystem.js`](../src/systems/ScreensaverSystem.js)、[`src/main/services/ScreensaverController.js`](../src/main/services/ScreensaverController.js) |

如果新 CP 不适合某种互动，应同步处理自发互动、右键/调试入口、屏保编排、素材和对白。仅删除 `kiss.webp` 或把亲吻权重设为 0，不能代表所有入口都已经停用。

数值改变要更新对应 `test/config.test.js`、`test/nurtureBalance.test.js`、`test/interactionSystem.test.js`、`test/ambientDialogueSystem.test.js`；涉及屏保时同时更新屏保测试。保留拖拽时暂停互动、互动最小间距、动画方向同步和退出清理规则。

## 6. 如需完整重命名内部 ID

把这一步作为独立改动，在内容替换验证通过后执行。先列出旧 ID → 新 ID、旧翻译键 → 新翻译键的对应表；不要对整个仓库做无差别替换。

至少逐组检查：

1. **角色和资源**：`config.js`、`SkinManager.js`、`SpriteView.js`、素材子目录、默认 URL、图片状态映射和 emoji 映射。
2. **角色分支与对白键**：`app.js`、`ContextMenu.js`、`DialogBubble.js`、`InteractionSystem.js`、`AmbientDialogueSystem.js`、`BreakReminderPresenter.js`、`OfflineReturnSystem.js`、`i18n.js` 和 `dialogues.js`；包括 `yueqi_reply` 等复合键。
3. **状态与视觉**：`statusWindow.js` 的动态姓名键、`PetRenderer.js` 的气泡角色键、CSS 中 `.pet--yueqi` / `.pet--shenjiu` 等选择器及角色颜色变量。
4. **番茄钟**：`PomodoroService.js`、`pomodoroWindow.js`、`pomodoro.html`、`pomodoro.css` 的 asset 键、DOM ID 与 class。
5. **调试与验证**：`window.__DEBUG_PETS`、`debug.js`、`tools/`、单元测试 fixtures 和 E2E 中的角色名/标题断言。

每组改完重新搜索旧 ID，区分“仍在使用的代码”和“历史说明”。不要顺手改动已发布的 changelog 或历史 ADR；有实际架构变化时另写 ADR。

当前存档 [`TimeSystem`](../src/systems/TimeSystem.js) 使用 `petState.petA` / `petB`，序列化中也保存 `id`，但恢复主要按 A/B 槽位读取，不会自动按新角色 ID 重新匹配。因此交换 A/B 或改变数值意义时，要显式迁移或重置数据，不能认为换 ID 就能隔离或正确继承进度。

## 7. 独立发布为新 CP 应用

独立发行时建议从新数据开始；若继承旧数据，先备份并明确 A/B、皮肤 ID、数值字段的映射，按 [状态持久化 ADR](./decisions/ADR-006-state-persistence-and-offline-decay.md) 补充迁移与回滚设计。

| 范围 | 必须核对的文件与设置 |
| --- | --- |
| 应用身份 | [`package.json`](../package.json) 的 `name`、`description`、`build.appId`、`productName`、NSIS 名称及安装包名；对应更新 `package-lock.json` 元数据 |
| Windows 身份 | [`src/main/AppLifecycle.js`](../src/main/AppLifecycle.js) 的 `APP_USER_MODEL_ID` 与新的 `build.appId` 一致；核对安装位置、卸载身份、开机启动项与快捷方式 |
| 图标与包装 | `src/assets/icon.png`、`icon.ico`、`icon.icns`、`iconTemplate.png`、`iconTemplate@2x.png`；所有用户可见标题、README 与三语发行说明 |
| Windows 安装器 | [`build/installer.nsh`](../build/installer.nsh) 的旧品牌文案及 `DeskPet.lnk` 历史清理；新应用不应删除另一应用的快捷方式 |
| 存档隔离 | [`StoreManager.js`](../src/main/services/StoreManager.js) 使用 `new Store()`，当前没有 CP 命名空间；核对运行时 `app.getPath('userData')`，保证新旧应用不同。仅更改 `appId` 不能作为隔离验证 |
| 更新源 | `package.json` 的 `build.publish.owner/repo`；[`updateManager.js`](../updateManager.js) 的 GitHub Releases 页面 URL 与 macOS API URL，都改到新应用仓库 |
| 发布流水线 | [预检 workflow](../.github/workflows/release-preflight.yml) 和 [构建 workflow](../.github/workflows/build-installer.yml) 中的 `七九爱宠.app`、旧可执行名称检查、产物名称、仓库权限及签名 secrets |
| 打包钩子 | [`scripts/afterPack.js`](../scripts/afterPack.js) 当前保持 macOS 内部可执行名 `DeskPet`，可沿用；若改名，要同步 plist、更新管理器、CI 检查和 macOS 打包测试 |

两个 CP 应用需要共存时，在真实安装版中验证它们能同时运行、存档互不覆盖、开机启动与卸载互不影响。开发模式还要使用不同 QA 数据目录。

更新源切换后，分别验证 Windows 自动更新和 macOS 手动更新，确认下载的是新 CP 安装包，不能把新版本接回七九更新源。发版流程与签名检查见 [发布指南](./release-workflow.md)、[代码签名说明](./release-code-signing.md)。

## 8. 验收与回滚

### 8.1 自动检查

在仓库根目录按实际改动运行检查；文案键完整性测试不能代替人物对白审读。

```powershell
# 角色、翻译与素材的基础检查
node --test test/config.test.js test/i18n.test.js test/i18nKeyCompleteness.test.js test/i18nFallback.test.js test/skinManager.test.js test/assetDimensions.test.js

# 整体回归与隔离数据的真实 Electron 验证
npm test
npm run test:e2e
npm run qa:electron:smoke

# 发布前，完成资源生成与配置检查后构建
npm run protect:assets
npm run verify:installer
npm run build
npm run verify:package
```

行为发生变化时更新相关现有单测，补充必要的回归场景；不要只为让测试通过而删除关键断言。独立品牌迁移也要同步 `test/e2e/startup.spec.js` 和 `tools/playwright-electron-smoke.js` 等标题断言。

`verify:package` 当前检查的是包内禁止出现的内部文件，不能证明旧 CP 素材已清空；仍要单独检查 `protected-assets/manifest.json` 和安装包中的资源。启用 Windows 签名的发行包还需运行 `npm run verify:signatures`；macOS 构建和验证需在 macOS 上完成。

### 8.2 人工验收清单

- [ ] 用全新数据首次启动，默认出现新角色；缺图、加载失败和取消换肤不会回到七九素材。
- [ ] 逐套皮肤检查左右行走、转向、饥饿、吃饭、睡眠、恢复活动、被摸；帧间不抖动，白衣和白发透明度正常。
- [ ] 检查双人互动的站位、气泡说话者和动作发起方；开发版可用 `testInteraction('hug')` 等现有入口逐项触发。
- [ ] 检查 CP 屏保、番茄钟、久坐提醒、天气、梦话与离线归来，素材和台词都符合新 CP。
- [ ] 切换中文、英文、日文，检查姓名、菜单、状态窗、托盘、皮肤署名和动态文案；长名称不溢出，字体能显示新名字。
- [ ] 皮肤试穿不保存；确认后重启保持选择；取消、ESC 和主动关窗恢复原皮肤；加载失败不能提交。
- [ ] 退出/重启后数值和皮肤正确恢复；继承存档时 A/B 没有串位，移除的皮肤不会导致异常。
- [ ] 拖拽、鼠标穿透、多屏与 DPI 缩放正常；Windows 和 macOS 的窗口、托盘及安装包分别验证。
- [ ] 独立发布时，新旧应用的数据、更新源、快捷方式、开机启动和卸载相互独立。

迁移前后可用以下命令盘点残留。命中结果要人工分类：选择保留内部 ID 时，旧 ID 属于预期；用户可见旧姓名、旧默认素材和错误更新源仍须处理。

```powershell
rg -n -i '岳七|岳清源|沈九|沈清秋|小九|七哥|七九|苍穹|清秋|QiJiu|Yue.?Qi|Shen.?Jiu|qijiu-desktop-pet' src main.js skinGallery.js protectedAssetLoader.js updateManager.js package.json build scripts tools test .github README.md readme_zh.txt readme_en.txt readme_ja.txt
rg -n -i 'yueqi|shenjiu' src skinGallery.js protectedAssetLoader.js scripts tools test
```

回滚时恢复迁移前的代码与素材，重新生成受保护资源并重启；数据只从事先备份恢复。若已经改变存档结构，不让旧版本直接写入新存档。独立发行版撤回时保留原应用和原更新源，避免把两个 CP 当作同一升级链处理。
