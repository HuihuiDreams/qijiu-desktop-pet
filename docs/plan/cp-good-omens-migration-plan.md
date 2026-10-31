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

## 游戏机制与世界观适配要点

1. **喂食与分食 (`shareFood`)**：
   - 恶魔 Crowley 为天使 Aziraphale 带来丽兹酒店的美食、可丽饼、热红酒或新鲜烘焙甜点。
   - 规则沿用偏心机制：Crowley 消耗饱腹度，Aziraphale 增加饱腹度；Aziraphale 过饱时触发吃撑表情与对白。
2. **打坐 / 修炼 (`cultivate` / `meditate`) 适配**：
   - 将原修仙语境的“灵力 (`qi`)”在展示层适配为“奇迹之力 (Miracle) / 能量”。
   - 单人“打坐”适配为“休整 / 冥想 / 听古典乐”；双人“一起修炼”适配为“施展奇迹 (Miracles) / 雅致下午茶”。
3. **番茄钟与专注窗口**：
   - 将原“苍穹静修”番茄钟适配为“旧书店研读”或“天使书店 (A.Z. Fell and Co. Antiquarian Books)”。
4. **夜间梦话与自发互动**：
   - Aziraphale 梦话发起（关于失落孤本、美食甜品、六千年的记忆或世界末日），Crowley 延迟回应保护（“我在，天使”）。
5. **数据与开发环境隔离**：
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
- [ ] **Task 2.1**: 更新 `src/data/config.js` 中的 `PET_A` 与 `PET_B` 角色名、昵称与 Emoji。
- [ ] **Task 2.2**: 更新 `src/data/i18n.js` 中的三语角色名称与右键互动菜单文案（如“恶魔关怀”、“天使撒娇/回应”）。
- [ ] **Task 2.3**: 更新 `src/data/dialogues.js` 中文基础兜底对白。
- [ ] **Task 2.4**: 运行并更新 `test/config.test.js`、`test/i18n.test.js`、`test/i18nKeyCompleteness.test.js`。

### Phase 3: 专属素材与皮肤管线接入 (Sprite Assets & Pipeline)
- [ ] **Task 3.1**: 准备 Crowley 与 Aziraphale 的默认 256x256 WebP 单人立绘（`left.webp`, `right.webp`）。
- [ ] **Task 3.2**: 准备双方各 4 帧走动循环图（`yueqi/walk_left*.webp`, `shenjiu/walk_right*.webp`）。
- [ ] **Task 3.3**: 准备单人状态图（饥饿、睡眠、进食、被摸、休整）与双人互动图（分食、拥抱、亲吻、奇迹、过饱）。
- [ ] **Task 3.4**: 运行 `npm run protect:assets` 生成受保护资源，更新 `skinGallery.js` 预览候选及画师署名。
- [ ] **Task 3.5**: 运行 `test/assetDimensions.test.js` 与 `test/skinManager.test.js`。

### Phase 4: 专属对白与互动逻辑适配 (Dialogues & Interactions)
- [ ] **Task 4.1**: 撰写 Crowley ✖️ Aziraphale 专属时段问候、发呆、低状态、久坐提醒三语台词。
- [ ] **Task 4.2**: 撰写双人互动（分食甜品、奇迹同行、拥抱、六千年默契对视）台词与气泡说话者对应核验。
- [ ] **Task 4.3**: 撰写夜间梦话与屏保被发现时的反应文案。
- [ ] **Task 4.4**: 运行并更新 `test/ambientDialogueSystem.test.js` 与 `test/interactionSystem.test.js`。

### Phase 5: 界面主题与视觉风格调整 (UI & Theming)
- [ ] **Task 5.1**: 调整 `src/index.css`、`src/status.css`、`src/pomodoro.css` 中的角色色彩变量（黑红/烈火 vs 米白/圣光金）。
- [ ] **Task 5.2**: 将番茄钟标题与书卷水墨文案调整为伦敦旧书店风格。
- [ ] **Task 5.3**: 检查 `SpriteView.js` 中的降级 emoji 与占位图。

### Phase 6: 独立发行配置与回归验证 (Packaging & Verification)
- [ ] **Task 6.1**: 如需作为独立应用发布，按指南配置 `package.json`（`appId`, `productName: 好兆头爱宠`）、Windows `APP_USER_MODEL_ID` 与应用图标。
- [ ] **Task 6.2**: 全量单元测试 `npm test` 与 E2E 冒烟测试 `npm run qa:electron:smoke`。
- [ ] **Task 6.3**: 人工端到端验收（启动、动作、穿透、多语切换、数据持久化）。
