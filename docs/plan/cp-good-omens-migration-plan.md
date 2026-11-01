# Implementation Plan: Good Omens (Crowley ✖️ Aziraphale) CP 迁移

## Overview

本项目基于 [docs/cp-migration-guide.md](../cp-migration-guide.md) 指南，在独立 CP 分支 `cp/crowley-aziraphale` 上为经典奇幻影视/文学作品《好兆头》（*Good Omens*）的主角 **克劳利（Anthony J. Crowley）✖️ 亚茨拉斐尔（Aziraphale）** 建立桌面爱宠版本。

首期迁移策略严格遵循指南推荐的 **“内容替换优先（Content Replacement Path）”** 原则：保持 `yueqi` / `shenjiu` 作为底层双人槽位（`PET_A` / `PET_B`）的内部标识不变，不改动复杂的状态机与 IPC 管道；集中替换展示层姓名、立绘与走动动画、三语台词、专属互动规则与界面主题风格。这既保证了与主分支（`main`）长期保持双向功能同步与合并的能力，又杜绝了破坏性重构引发的潜在回归。

---

## 角色映射表 (Role Mapping Table)

| 项目 | 角色 A（原岳七槽位） | 角色 B（原沈九槽位） |
| --- | --- | --- |
| **正式姓名** | 克劳利 (Anthony J. Crowley) | 亚茨拉斐尔 (Aziraphale) |
| **常见昵称 / 互称** | Crowley / 恶魔先生 (Angel 称呼) / 蛇蛇 | Aziraphale / 天使 (Crowley 称呼) / 亚茨 |
| **三语写法 (zh / en / ja)** | 克劳利 / Crowley / クロウリー | 亚茨拉斐尔 / Aziraphale / アジラフェル |
| **标志性 Emoji** | 🕶️ / 🐍 | 🪽 / 📖 |
| **保留 ID 时的内部标识** | `yueqi` | `shenjiu` |
| **配置槽位 / 存档槽位** | `CONFIG.PET_A` / `petA` | `CONFIG.PET_B` / `petB` |
| **单人素材前缀 / 默认朝向** | `left` / 朝左 (`left`) | `right` / 朝右 (`right`) |
| **走动帧目录** | `src/assets/<skinId>/yueqi/` | `src/assets/<skinId>/shenjiu/` |
| **双人叠加图中的站位** | 右侧 (Crowley) | 左侧 (Aziraphale) |
| **角色气质与配色** | 恶魔、守护、刀子嘴豆腐心、深红与墨黑、黑色宾利、蛇瞳墨镜 | 天使、温润讲究、吃货美食家、米白与浅金、伦敦旧书店、热可可与红酒 |
| **互动行为倾向** | 投喂方、守护方、给对方找美食、分食消耗自身饱腹 | 被投喂方、吃货（容易吃撑）、品味红酒甜点、夜间梦话发起方 |

---

## 语言与本地化准则 (Language & Localization Policy)

本项目以 **英文（English）为绝对基准与单一事实来源（Single Source of Truth）**，源于《好兆头》原版小说（Neil Gaiman & Terry Pratchett 著）及 BBC/Amazon Prime 影视剧剧本（David Tennant & Michael Sheen 演绎的标准英式对白与语气）。

1. **英文（EN）基准源（Ground Truth）**：
   - 所有的台词、菜单、气泡与系统提示优先使用纯正英式英语（British English）撰写，深度取材并致敬原著小说与影视剧的标志性金句（如 *"To the world."*、*"Angel"*、*"GROW BETTER!"*、*"Tickety-boo"*、*"Our own side"*、*"A Nightingale Sang in Berkeley Square"* 等）。
   - 保留克劳利略带嘲弄却极其宠溺的恶魔语调（Sarcastic, slithering, fiercely protective），以及亚茨拉斐尔讲究优雅却容易慌乱的吃货天使语调（Fussy, polite, gentle, enthusiastic about food and books）。
2. **中文（ZH）本地化**：
   - 基于权威中译本小说（江苏凤凰文艺出版社版）与主流精翻字幕（影视官方中字/经典英剧字幕），在英文基准上做严谨的信达雅翻译。
   - 杜绝生硬机翻，保留英式幽默、俏皮话及专属人设称谓（如「天使」、「亲爱的」、「恶魔先生」等）。
3. **日文（JA）本地化**：
   - 严格对照 Amazon Prime Video Japan 官方吹替与日文字幕规范：
     - 克劳利：クロウリー
     - 亚茨拉斐尔：アジラフェル
     - 称谓与人称：アジラフェル称克劳利为「クロウリー」/「親愛なる友よ」，克劳利用「天使 (エンジェル)」/「お前」。

---

## 游戏机制与世界观适配要点

1. **喂食、分食与体面化吃撑 (`shareFood` / `throwup`)**：
   - 恶魔 Crowley 为天使 Aziraphale 带来丽兹酒店的美食、可丽饼、热红酒或新鲜烘焙甜点。
   - 规则沿用偏心机制：Crowley 消耗饱腹度，Aziraphale 增加饱腹度。
   - **吃撑人设体面化修正**：原底层反胃/呕吐逻辑（`throwup`）在表现层改造为老派英国绅士/天使的体面吃撑——亚茨拉斐尔解开马甲下摆扣子、瘫在椅子上揉肚子微喘，克劳利在一旁无奈抱臂扶额。
     - 亚茨拉斐尔：“（解开扣子微喘）……哦天哪，克劳利，最后那份法式焦糖布丁实在是不该点的……但它真的太美味了。”
     - 克劳利：“（抱臂扶额）我早告诉过你，天使，连贪食罪恶魔都没你这么能塞。”
2. **打坐 / 修炼 (`cultivate` / `meditate`) 专属设定方案**：
   - **双人互动【施展奇迹 (Miracle)】（原双修/一起修炼 `cultivate`）**：
     - **原作典故**：致敬《好兆头》第二季名场面——恶魔与天使携手施展联合奇迹，引发了天国与地狱雷达蜂鸣警报的“25 级拉撒路奇迹（25-Lazarus Miracle）”。
     - **视觉与粒子**：保留原系统粒子光环（`qiAuraGather`），呈现左侧金白天色圣光与右侧暗红/深黑暗火交融的奇迹光效；两人并肩打响指或手心汇聚能量。
     - **数值与属性**：将“灵力 (`qi`)”语境替换为“奇迹之力 (Miracle) / 能量”，恢复双方能量并大幅提升好感。
     - **台词对白设计**：
       - 克劳利：“喂，天使，悠着点……这动静要是让天国和地狱的雷达测出来，可不好收场。”
       - 亚茨拉斐尔：“哦亲爱的，只要我们配合得当，这只算一个小小的……‘巧合’而已。”
   - **单人充能动作定制（原单人打坐 `meditate`）**：
     - **克劳利 (Crowley) ->「养植物 (Tending Plants)」**：
       - **原作典故**：克劳利在伦敦公寓里用喷水壶训诫盆栽（“GROW BETTER!”），植物因极度敬畏而长得全伦敦最繁茂翠绿；这是恶魔标志性的解压与充能日常。
       - **视觉素材**：`left_cultivate.webp` 呈现克劳利手持喷水壶巡视/指着植物的傲娇姿势。
       - **对白气泡**：`bubbleMeditateYueqi` -> “（拿着喷水壶严肃巡视）长快点！听到没有！” / “最好别让我发现一片斑点……”
     - **亚茨拉斐尔 (Aziraphale) ->「静心研读 (Reading)」**：
       - **原作典故**：在索霍区旧书店后室的扶手椅上戴上老花镜，就着热茶或甜点慢慢翻阅珍稀初版书。
       - **视觉素材**：`right_cultivate.webp` 呈现亚茨拉斐尔戴眼镜阅读精装古籍、轻啜红茶的安详姿态。
       - **对白气泡**：`bubbleMeditateShenjiu` -> “（翻开泛黄的初版本）……真是无可替代的文字。” / “唔，再来一杯大吉岭红茶就更完美了。”
3. **天气视觉与名场面定制【创世流星雨 (Starmaker Meteor Shower)】**：
   - **原作典故**：致敬《好兆头》第二季第一集开篇名场面“创世之初的星云（Before the Beginning / Starmaker）”。克劳利（当时还是负责造星的六翼天使）摇动创世曲柄点亮宇宙星云，漫天繁星与划过黑暗虚空的流星雨交相辉映；亚茨拉斐尔在一旁惊叹注视，并温柔地抬起洁白羽翼为克劳利遮挡飘落的灼热星尘。在第一季伦敦雨夜中亚茨拉斐尔也同样为他撑起羽翼，形成了跨越六千年的经典互文。
   - **粒子与视觉适配**：
     - 将原本单调冷色的雨滴粒子（`.weather-particle--rain`）升级为金白微光的**流星雨拖尾（Meteor Streak）**。
     - 粒子渐变调整为自上而下的流线形星轨（晨星白核心 + 浅金/星夜蓝渐变光晕 + 微光拖尾 `box-shadow`），保持斜向优雅划过屏幕。
   - **天气对白联动 (`weather.rain`)**：
     - 克劳利：“看那儿，天使。当年我们启动半人马座星云的时候，可比这还要亮得多。” / “（仰头看着划过的星芒）……那是我的设计，漂亮吧？”
     - 亚茨拉斐尔：“哦……不管看多少遍，星尘落下的样子总是那么迷人。” / “（轻抬羽翼）当年在星云边上，好像也是这样的景色呢，亲爱的。”
4. **好感度阶梯与行为门槛定义 (`minAffection`)**：
   在底层互动系统（`InteractionSystem` 与 `config.js`）中，双人自发互动受当前好感度（`affection`，范围 0~100）的严格门槛约束。为严谨对应《好兆头》跨越六千年的关系渐进弧光，各互动行为的数值门槛精确定义如下：

   | 互动标识 | 对应行为 (Good Omens) | 触发门槛 (`minAffection`) | 权重 (`weight`) | 关系阶段与情感内涵 |
   | :--- | :--- | :---: | :---: | :--- |
   | `greet` | **日常打招呼 / 拌嘴问候** | **0** | 30 | **初始照面**：伊甸园到古罗马时期的日常拌嘴、试探与打招呼 |
   | `shareFood` | **丽兹投喂 / 美食分食** | **0** | 20 | **美食共享**：无论阵营立场如何，六千年里随时都能坐下一起品尝美酒可丽饼 |
   | `cultivate` | **施展奇迹 (Miracle)** | **20** | 25 | **秘密协定达成**：达成互助盟约（The Arrangement），开始携手借调与掩饰奇迹 |
   | `hug` | **深情拥抱 (Embrace)** | **50** | 10 | **生死托付**：1941 闪电战教堂救书、大革命解救与面临世界危机时的战火相拥 |
   | `kiss` | **深情亲吻 (Kiss)** | **75** | 15 | **我们自己的阵营**：心意彻底相通、打破神魔一切戒律的终极深情一吻 |

   *伴随系统联动门槛*：
   - **高好感梦境池与联动梦话 (`dream.linked`)**：好感度 `>= 80` 时自动解锁高好感梦境库，夜间睡眠时亚茨拉斐尔的梦话（关于美食、书本或末日）将触发克劳利的温柔守护回应（“我在，天使”）。
   - **日常闲聊与问候台词分层**：
     - `0 ~ 39`（初识与协定早期）：保留阵营分界线与傲娇防备（*"We are hereditary enemies"*, *"Don't get any ideas, angel"*）。
     - `40 ~ 74`（战火互助与挚友）：默契托付与克制的关心（*"You're my friend"*, *"A little too fast for me"*）。
     - `75 ~ 100`（灵魂伴侣与专属阵营）：跨越六千年的绝对信任（*"To the world"*, *"You're too kind"*, *"Our own side"*）。
5. **屏保幽会与被抓包名场面 (`Screensaver` / `screensaverCaught`)**：
   - 屏保模式下两人在屏幕漫步或书店小憩；玩家晃动鼠标唤醒打断时触发“秘密幽会被撞见”名场面：
     - 克劳利：慌忙扶正墨镜，故作冷酷恶狠：“……看什么看？我正在履行诱惑恶行呢，凡人！”
     - 亚茨拉斐尔：心虚地理了理领结，慌张藏起小蛋糕：“哦！上帝呀……我们只是在进行……一次常规的阵营交涉！”
6. **番茄钟专注窗口【旧书店研读 (A.Z. Fell and Co. Antiquarian Books)】**：
   - 将原“苍穹静修”番茄钟适配为伦敦索霍区亚茨拉斐尔的旧书店伴读模式。
   - 视觉融合留声机黑胶唱片（Queen 乐队 / 莫扎特古典乐）与壁炉余烬微光氛围。
   - 倒计时结束时伴随书店复古风铃轻响与亚茨拉斐尔的温和提示：“专注的时间过得真快，亲爱的，喝杯大吉岭红茶休息一下吧。”
7. **夜间梦话与自发互动**：
   - Aziraphale 梦话发起（关于失落孤本、美食甜品、六千年的记忆或世界末日），Crowley 延迟回应保护（“我在，天使”）。
8. **数据与开发环境隔离**：
   - 在开发和自测期间，使用 QA 环境变量隔离用户数据，防止覆盖本地默认七九版本的存档：
     - macOS/Linux: `DESKTOP_PET_USER_DATA_DIR=~/.deskpet-good-omens-dev npm run dev`
     - Windows PowerShell: `$env:DESKTOP_PET_USER_DATA_DIR="$env:TEMP\deskpet-good-omens-dev"; npm run dev`

---

## 阶段任务清单 (Task Roadmap)

### Phase 1: 分支建立与基线建立 (Foundation Baseline)
- [x] **Task 1.1**: 从 `main` 建立并检出 `cp/crowley-aziraphale` 分支。
- [x] **Task 1.2**: 建立 CP 迁移计划与跟踪文档 `docs/plan/cp-good-omens-migration-plan.md`。
- [x] **Task 1.3**: 明确角色映射矩阵与数据隔离方案。
- [x] **Task 1.4**: 全量单元测试回归核验（1137 tests passing）。
- [x] **Task 1.5**: 同步更新 `CHANGELOG.md` 并提交阶段原子 Commit。

### Phase 2: 角色基础配置与名称映射 (Role Identity & Config)
- [x] **Task 2.1**: 更新 `src/data/config.js` 中的 `PET_A` 与 `PET_B` 角色名、昵称与 Emoji。
- [x] **Task 2.2**: 更新 `src/data/i18n.js` 中的三语角色名称与右键互动菜单文案（以英文为基准编写，如克劳利「🪴 Tending Plants / 养植物」、亚茨拉斐尔「📖 Reading / 静心研读」、双人互动「✨ Miracle / 施展奇迹」并同步日文）。
- [x] **Task 2.3**: 更新 `src/data/dialogues.js` 中文基础兜底对白。
- [x] **Task 2.4**: 运行并更新 `test/config.test.js`、`test/i18n.test.js`、`test/i18nKeyCompleteness.test.js`。

### Phase 3: 专属素材与皮肤管线接入 (Sprite Assets & Pipeline)
- [x] **Task 3.1**: 准备 Crowley 与 Aziraphale 的默认 256x256 WebP 单人立绘（`left.webp`, `right.webp`）。
- [x] **Task 3.2**: 准备双方各 4 帧走动循环图（`yueqi/walk_left*.webp`, `shenjiu/walk_right*.webp`）。
- [x] **Task 3.3**: 准备单人状态图（饥饿、睡眠、进食、被摸、克劳利养植物 `left_cultivate.webp`、亚茨拉斐尔研读 `right_cultivate.webp`）与双人互动图（分食甜品、拥抱、亲吻、施展奇迹 `cultivate.webp`、过饱）。
- [x] **Task 3.4**: 运行 `npm run protect:assets` 生成受保护资源，更新 `skinGallery.js` 预览候选及画师署名（已下线旧平行世界 AU 皮肤 `birds`、`animal_ears`、`school_au`，仅保留好兆头专属 `default` 默认皮肤）。
- [x] **Task 3.5**: 运行 `test/assetDimensions.test.js` 与 `test/skinManager.test.js`。

### Phase 4: 专属对白与互动逻辑适配 (Dialogues & Interactions)
- [x] **Task 4.1**: 以原著小说及影视剧纯正英式台词为基准（English Ground Truth），撰写专属时段问候、发呆、低状态、久坐提醒，并精准本地化为中文与日文。
- [x] **Task 4.2**: 撰写双人互动（分食甜品、奇迹同行、拥抱、六千年默契对视）台词与气泡说话者对应核验。
- [x] **Task 4.3**: 撰写夜间梦话、好感度阶梯分层对白与屏保幽会被抓包（克劳利假装诱惑恶行、亚茨拉斐尔慌乱交涉）名场面反应文案。
- [x] **Task 4.4**: 运行并更新 `test/ambientDialogueSystem.test.js` 与 `test/interactionSystem.test.js`。

### Phase 5: 界面主题与视觉风格调整 (UI & Theming)
- [x] **Task 5.1**: 调整 `src/index.css`、`src/status.css`、`src/pomodoro.css` 中的角色色彩变量（黑红/烈火 vs 米白/圣光金）。
- [x] **Task 5.2**: 将番茄钟标题与书卷水墨文案调整为伦敦旧书店（A.Z. Fell and Co.）风格，融入留声机黑胶唱片与壁炉余烬微光氛围。
- [x] **Task 5.3**: 检查 `SpriteView.js` 中的降级 emoji 与占位图。
- [x] **Task 5.4**: 将雨天粒子（`effects.css`）升级为创世流星雨拖尾与星辉光效，联动更新天气问候台词。

### Phase 6: 独立发行配置与品牌身份隔离 (Independent Release Identity & Packaging)
- [x] **Task 6.1**: 完成独立应用身份与安装配置（`package.json` 改为 `good-omens-desktop-pet` / `好兆头桌宠` / `GoodOmensDeskPet` / `com.deskpet.good-omens`，同步 `package-lock.json` 与 NSIS 安装包命名）。
- [x] **Task 6.2**: 配置 Windows 身份标识（`src/main/AppLifecycle.js` 中的 `APP_USER_MODEL_ID`）与 NSIS 安装卸载文案（`build/installer.nsh`）。
- [x] **Task 6.3**: 重新生成全套好兆头专属应用图标（`icon.png`, `icon.ico`, `icon.icns`, `iconTemplate.png`, `iconTemplate@2x.png`）与托盘 CA 点阵位图（`TrayManager.js`）。
- [x] **Task 6.4**: 清理展示层残留旧角色名称与台词（`src/index.html` 标题、`src/app.js` 启动提示、`src/systems/InteractionSystem.js` 与 `src/debug.js` 兜底对白），同步更新 `tools/playwright-electron-smoke.js` 与相关测试断言。
- [x] **Task 6.5**: 完整重写三语发行说明（`README.md`、`readme_zh.txt`、`readme_en.txt`、`readme_ja.txt`）以及 CI 打包流水线（`.github/workflows/`、`test/macosPackaging.test.js`）。
- [x] **Task 6.6**: 全量单元测试 `npm test`（1141 passing）、环境预检 `npm run verify:installer` 与 E2E 冒烟测试 `npm run qa:electron:smoke`（`ok: true`）。

### Phase 7: UI 界面风格与排版彻底重构 (Good Omens Aesthetic Overhaul & Clean Typography)
- [x] **Task 7.1**: 全量剔除翠绿修仙水墨配色，全面升级为 A.Z. Fell and Co. 索霍区古籍书店（古典黄铜、羊皮纸暖白、星芒金）与克劳利宾利曜黑、深红血浆暗火色系；采用现代 CSS 相对颜色语法自动派生次级色彩与微光阴影（`index.css`、`status.css`、`pomodoro.css`、`city-setting.css`、`pet-scale.css`、`skin-selector.css`、`context-menu.css`）。
- [x] **Task 7.2**: 彻底剥离与剔除旧七九专属书法字（Calligraphy）：全量移除 `calligraphy-*.webp` 遮罩与背景水印、移除设置窗口与状态窗口泥金印章（`status-seal-qijiu`）、移除右键菜单与状态卡片上的 `clip-path: inset(50%)` 隐藏文本黑客手法，恢复所有语言（中、英、日）下原生的现代优雅字形与无障碍可读性。
- [x] **Task 7.3**: 彻底解决番茄钟长对白导致按钮被挤出视口的布局问题：扩大番茄钟窗口默认尺寸（由 336×360 扩展为 360×440），改用弹性列布局（`flex-direction: column`）、内容滚动自适应及底部主按钮吸底固定（`margin-top: auto; flex-shrink: 0`），确保「开始静修/专注」、「提前出关」与「出关」按钮永远清晰完整可见。
- [x] **Task 7.4**: 现代化重构番茄钟表盘与圆满仪式：表盘中心移除旧书法遮罩改用双层细圈与星芒呼吸光效，圆满仪式保留金色圣光涟漪与磬钟音效，圆印升级为双圈天使之印。
- [x] **Task 7.5**: 全量自动化测试（1140 passed）与 Playwright 隔离冒烟测试（`qa:electron:smoke`）验证通过。
- [x] **Task 7.6**: 右键菜单与状态面板角色名纯净展示（Clean Single Name Display）：解耦旧版名+字号括号拼接（`name（nickname）`），三语统一展示单一角色名（克劳利 / Crowley / クロウリー，亚茨拉斐尔 / Aziraphale / アジラフェル），彻底移除括号与冗余外语标注。

### Phase 8: 迁移审查修复与资产图标收口 (Migration Audit Fixes & Icon Regeneration)
- [x] **Task 8.1**: 基于双人拥抱图（`hug.webp`）重新生成好兆头圆形徽章全套高分辨率应用图标（`icon.png`, `icon.ico`, `icon.icns`），修复 macOS `@2x` 托盘模板图标（`iconTemplate@2x.png`）等比缩放。
- [x] **Task 8.2**: 独立隔离 `package.json` 中的仓库 Git URL 与 issues 追踪地址至 `good-omens-desktop-pet`，清理默认皮肤目录下未被引用的孤儿素材（`walk01..04.webp`）。
- [x] **Task 8.3**: 修复单人进食（`eat`）与饥饿（`hungry`）动作素材边缘残留的抠图噪点碎片，完整恢复克劳利进食（`left_eat`）立绘中遗失的餐叉细节；修复子窗口 HTML 静态兜底文本并清理 `pomodoro.css` 重复 keyframe 规则。
- [x] **Task 8.4**: 全量重构多语言说明文件（`readme_zh.txt`、`readme_en.txt`、`readme_ja.txt`），彻底消除旧七九修仙术语与陈旧设定残留。

### Phase 9: 单内置皮肤资产收敛与旧 AU 皮肤下线 (Single Built-in Good Omens Skin Consolidation)
- [x] **Task 9.1**: 彻底下线旧平行世界 AU 皮肤资产（`birds` 鸟塑克亚、`animal_ears` 猫兔克亚、`school_au` 校园克亚）及其源码明文素材与加密密文资源（`protectedAssets/`），收敛为仅内置唯一的好兆头专属正作 Q 版皮肤（`default` / `默认形象·Nano Banana`）。
- [x] **Task 9.2**: 同步更新 `skinGallery.js`、`protectedAssetLoader.js` 与三语发行说明（`readme_zh.txt`、`readme_en.txt`、`readme_ja.txt`），明确应用当前仅内置一套好兆头专属皮肤（`default`）。
- [x] **Task 9.3**: 更新 `CHANGELOG.md`、单元测试套件（`test/skinManager.test.js` 等）与相关文档，确保包体精简、无非好兆头素材残留且全量自动化回归测试通过。
