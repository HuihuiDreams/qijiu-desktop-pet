# Implementation Plan: 📓 日常手账 (Hub) 功能扩展

## Overview
为桌宠增加一个“日常手账 (Hub)”面板，完全复用现有美术资源。左侧为支持难度分级的每日待办清单（完成后联动桌宠动作奖励，每日午夜清空），右侧为基于 DeepSeek API 自动生成的 AI 日记（交替使用七哥和小九的视角记录当天的互动事件）。

## Architecture Decisions
- **AI 密钥注入与风控**：坚决避免在代码中硬编码。开发阶段使用本地 `.env`，打包阶段通过 CI/CD (如 GitHub Secrets) 注入。前端只能通过 IPC 调用，真正的 API 请求由主进程发出。并且必须在 DeepSeek 后台为该 Key 设定严格的额度上限（如 10元/月），以应对因客户端发版必然导致的提取风险。
- **数据持久化**：使用已有的 `electron-store`，新增一个专门存放 Hub 数据的 key (如 `hubData`)，用于记录当日待办和当日事件流水。
- **IPC 通信**：Hub 窗口通过主进程中转 IPC 给隐藏的透明主窗口（PetRenderer），以触发奖励动画。

## Task List

### Phase 1: Foundation
- [ ] **Task 1: Hub 数据服务 (HubDataService)**
  - **Description**: 创建负责持久化待办清单和记录日常交互事件的服务。实现午夜清空待办的逻辑。
  - **Acceptance criteria**:
    - [ ] 提供增删改查待办的接口。
    - [ ] 提供记录事件 (Event) 的接口（如：喂食、打坐等）。
    - [ ] 能在检测到跨天时自动清空已完成的待办。
  - **Verification**: 
    - [ ] 编写测试脚本或使用控制台验证跨天逻辑。
  - **Dependencies**: None
  - **Files likely touched**: 
    - `src/main/services/HubDataService.js` (NEW)
    - `main.js` (初始化)

- [ ] **Task 2: Hub 窗口与 IPC 通信配置**
  - **Description**: 创建 `HubWindow.js` 以承载手账界面，并在 `TrayManager` 中添加入口，配置好相关的 IPC 通道。
  - **Acceptance criteria**:
    - [ ] 托盘菜单新增“📓 日常手账”入口。
    - [ ] 能够正常打开和关闭 Hub 窗口。
    - [ ] 在 `preload.js` 中暴露与 Hub 通信的 `ipcRenderer` 方法。
  - **Verification**:
    - [ ] 启动应用，右键托盘，点击打开窗口不报错。
  - **Dependencies**: Task 1
  - **Files likely touched**:
    - `src/main/windows/HubWindow.js` (NEW)
    - `src/main/TrayManager.js`
    - `preload.js`

### Checkpoint: Foundation
- [ ] 基础服务正常启动，托盘菜单可以打开一个空白的窗口，控制台无报错。

### Phase 2: Core Features (To-Do & Interactions)
- [ ] **Task 3: 待办清单 UI 构建**
  - **Description**: 在 `hub.html` 实现左半边待办功能，可以添加不同难度（普通/困难）的任务，并勾选完成。
  - **Acceptance criteria**:
    - [ ] UI 上能输入任务文字。
    - [ ] UI 上能选择难度（Radio/Dropdown）。
    - [ ] 勾选完成时，UI 状态更新，并调用 IPC 保存。
  - **Verification**:
    - [ ] 界面显示正常，数据能够存入 `electron-store` 并在重启后保留。
  - **Dependencies**: Task 2
  - **Files likely touched**:
    - `src/hub.html` (NEW)
    - `src/hub.css` (NEW)
    - `src/hub.js` (NEW)
    - `src/hubPreload.js` (NEW)

- [ ] **Task 4: 联动桌宠奖励动画**
  - **Description**: 当在手账中勾选完成任务时，根据难度让桌宠做出反应。
  - **Acceptance criteria**:
    - [ ] 普通任务：触发带有文字的气泡夸奖。
    - [ ] 困难任务：强制触发两人互动（关怀/拥抱等）。
  - **Verification**:
    - [ ] 勾选任务时，桌宠能正确展示相应的气泡或走到一起拥抱。
  - **Dependencies**: Task 3
  - **Files likely touched**:
    - `src/app.js` (监听并触发奖励)
    - `src/main/services/HubDataService.js` (触发奖励 IPC)

### Checkpoint: Core Features
- [ ] 待办列表功能完整，且能成功联动到桌面宠物的反馈动画。

### Phase 3: AI Diary
- [ ] **Task 5: AI 日记后台服务**
  - **Description**: 封装 DeepSeek API 请求，使用从环境变量或 `dotenv` 加载的密钥，并随机决定是以小九还是七哥视角写日记。
  - **Acceptance criteria**:
    - [ ] API Key 从 `.env` 获取，不出现在代码中。
    - [ ] 获取当天所有的事件，并生成 Prompt。
    - [ ] 随机采用其中一人的视角。
  - **Verification**:
    - [ ] 单元测试或隔离测试调用服务，能返回带有人设的日记内容。
  - **Dependencies**: Task 1
  - **Files likely touched**:
    - `src/main/services/AIDiaryService.js` (NEW)

- [ ] **Task 6: AI 日记 UI 构建**
  - **Description**: 实现 `hub.html` 右侧的日记展示，并在每日结算或点击按钮时获取日记。
  - **Acceptance criteria**:
    - [ ] UI 上可以显示生成的日记文本。
    - [ ] 提供一个“生成日记”按钮（防抖，避免滥用 API）。
    - [ ] 生成的日记持久化，今日内不再重复消耗 API。
  - **Verification**:
    - [ ] 点击按钮能加载日记，并成功渲染在界面上。
  - **Dependencies**: Task 5, Task 3
  - **Files likely touched**:
    - `src/hub.html`
    - `src/hub.css`
    - `src/hub.js`

### Checkpoint: Complete
- [ ] 完整运行 `npm run dev`，左右两侧功能均正常工作，符合所有验收标准。

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| 困难任务强制互动可能会打断现有的游戏状态机 | Med | 优先复用原有的 `forceInteraction` 逻辑，确保交互结束后能正常恢复 `IdleState`。 |
| API 密钥被抓包或逆向 | Low | 采取简单混淆，毕竟没有绝对的客户端安全，主要是防小白。建议不绑定支付卡的高配额账户。 |
| 日志条目过多导致大模型上下文溢出 | Low | 只记录一天内有意义的聚合事件（如“喂食3次”，而不是3条独立记录）。 |

## Open Questions
- None. (All clarified with user previously).
