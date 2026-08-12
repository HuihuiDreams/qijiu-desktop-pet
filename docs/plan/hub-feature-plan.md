# Implementation Plan: 📓 日常手账 (Hub) 功能扩展

## Overview
为桌宠增加一个“日常手账 (Hub)”面板，完全复用现有美术资源。左侧为支持难度分级的每日待办清单（完成后联动桌宠动作奖励，每日午夜清空），右侧为基于 DeepSeek API 自动生成的 AI 日记（交替使用七哥和小九的视角记录当天的互动事件）。

## Architecture Decisions
- **AI 日记服务边界**：不向安装包、CI 构建变量、渲染进程或 `electron-store` 注入 DeepSeek API Key。AI 日记仅能经由自有的、已认证的 HTTPS 代理服务调用；上游 Key 只保存在该服务的密钥管理环境中。代理上线前，客户端必须保持 AI 日记入口不可用，而不是回退为内置或混淆的共享 Key。详见 [ADR-045](../decisions/ADR-045-ai-diary-credential-boundary.md)。
- **数据持久化**：使用已有的 `electron-store`，新增一个专门存放 Hub 数据的 key (如 `hubData`)，用于记录当日待办和经过聚合的事件流水；不保存 API Key、访问令牌或完整的上游请求/响应。
- **IPC 通信**：Hub 窗口只通过专用 `hubPreload.js` 暴露窄接口。主进程对每个 Hub IPC 校验当前 Hub 窗口的 `webContents.id`、参数 schema 和调用频率；主进程仅在待办状态成功持久化后向透明主窗口发送固定集合中的 `hub-reward` 事件，Hub 渲染进程不能直接指定任意 Renderer 行为。

## Task List

### Phase 0: AI Diary Service Prerequisite
- [ ] **Task 0: 已认证 AI 日记代理与配额控制**
  - **Description**: 在 DeskPet 仓库之外部署并运营 AI 日记代理。代理负责用户认证、短期凭据签发、调用 DeepSeek 和服务端配额控制；DeskPet 只消费该代理的公开契约。
  - **Acceptance criteria**:
    - [ ] DeepSeek API Key 仅存在于代理的密钥管理环境，发布安装包和 CI artifact 中不存在该 Key。
    - [ ] 代理拒绝未认证、过期或已撤销的凭据，并对每个用户实施日/小时配额、并发上限、请求体长度上限和超时。
    - [ ] 代理日志和客户端错误均不包含 API Key、认证凭据、完整 Prompt、完整日记内容或上游堆栈。
    - [ ] 代理不可用时返回稳定的用户安全错误；客户端不得以直连 DeepSeek 或内置 Key 降级。
  - **Verification**:
    - [ ] 代理集成测试覆盖认证失败、凭据撤销、超额、超长请求、上游超时与日志脱敏。
    - [ ] 发布前扫描桌面安装包和 CI artifact，确认不存在 DeepSeek Key 或其配置值。
  - **Dependencies**: None（DeskPet 客户端实现不得抢先于此任务发布）
  - **Files likely touched**:
    - 受控的代理服务仓库与部署配置（不放入 DeskPet 安装包）
    - CI/CD 密钥管理与监控配置（不把 Key 注入桌面构建）

### Phase 1: Foundation
- [ ] **Task 1: Hub 数据服务 (HubDataService)**
  - **Description**: 创建负责持久化待办清单和记录日常交互事件的服务。实现午夜清空待办的逻辑。
  - **Acceptance criteria**:
    - [ ] 提供增删改查待办的接口。
    - [ ] 提供记录事件 (Event) 的接口（如：喂食、打坐等）。
    - [ ] 能在检测到跨天时自动清空已完成的待办。
    - [ ] 在主进程边界校验所有输入：任务文本先 `trim` 后为 1–120 个字符，难度只允许 `normal` 或 `hard`，事件类型使用固定 allowlist，未知字段不持久化。
    - [ ] 待办 ID 由主进程生成；完成同一待办是幂等操作，不能通过重复 IPC 重复获得奖励。
  - **Verification**: 
    - [ ] 编写单元测试覆盖跨天、空白/超长文本、非法难度和重复完成不重复奖励。
  - **Dependencies**: None
  - **Files likely touched**: 
    - `src/main/services/HubDataService.js` (NEW)
    - `main.js` (初始化)

- [ ] **Task 2: Hub 窗口与 IPC 通信配置**
  - **Description**: 创建 `HubWindow.js` 以承载手账界面，并在 `TrayManager` 中添加入口，配置好相关的 IPC 通道。
  - **Acceptance criteria**:
    - [ ] 托盘菜单新增“📓 日常手账”入口。
    - [ ] 能够正常打开和关闭 Hub 窗口。
    - [ ] `HubWindow` 启用 `contextIsolation` 和 sandbox，禁用 Node integration，并只加载本地文件。
    - [ ] 在 `hubPreload.js` 中通过 `contextBridge` 暴露与 Hub 通信的最小接口，不暴露通用 `ipcRenderer`。
    - [ ] 每个 Hub IPC handler 仅接受当前未销毁 Hub 窗口的 sender；关闭或重建窗口后旧 sender 必须被拒绝。
  - **Verification**:
    - [ ] 启动应用，右键托盘，点击打开窗口不报错。
    - [ ] 自动化测试覆盖伪造 sender、已销毁窗口和非法 payload 均返回统一的 `FORBIDDEN` 或 `VALIDATION_ERROR`，且不会修改存储或向主窗口发送奖励。
  - **Dependencies**: Task 1
  - **Files likely touched**:
    - `src/main/windows/HubWindow.js` (NEW)
    - `src/main/TrayManager.js`
    - `src/hubPreload.js` (NEW)

### Checkpoint: Foundation
- [ ] 基础服务正常启动，托盘菜单可以打开一个空白的窗口，控制台无报错。

### Phase 2: Core Features (To-Do & Interactions)
- [ ] **Task 3: 待办清单 UI 构建**
  - **Description**: 在 `hub.html` 实现左半边待办功能，可以添加不同难度（普通/困难）的任务，并勾选完成。
  - **Acceptance criteria**:
    - [ ] UI 上能输入任务文字。
    - [ ] UI 上能选择难度（Radio/Dropdown）。
    - [ ] 勾选完成时，UI 状态更新，并调用 IPC 保存。
    - [ ] 所有用户文本以 `textContent` 渲染；前端校验只改善体验，主进程校验仍是最终边界。
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
    - [ ] 奖励类型由主进程根据已持久化的任务难度映射，不能由 Hub payload 直接传入互动名称或任意 IPC channel。
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
  - **Description**: 封装到已认证 AI 日记代理的请求；代理再使用其受管环境变量中的 DeepSeek API Key，并随机决定是以小九还是七哥视角写日记。
  - **Acceptance criteria**:
    - [ ] 客户端、安装包、CI 构建产物和 `electron-store` 中均不存在 DeepSeek API Key；客户端只持有短期、可撤销的服务访问凭据。
    - [ ] 代理要求已认证用户，并在服务端实施按用户的日/小时配额、并发上限、请求体长度上限及超时；配额和拒绝原因不会泄露上游密钥或内部堆栈。
    - [ ] 获取当天所有的事件，并生成 Prompt。
    - [ ] 随机采用其中一人的视角。
  - **Verification**:
    - [ ] 单元测试或隔离测试覆盖未认证、超额、超长事件和上游失败；客户端只展示可理解的错误，不记录凭据、Prompt 全文或上游响应全文。
  - **Dependencies**: Task 0, Task 1
  - **Files likely touched**:
    - `src/main/services/AIDiaryService.js` (NEW)

- [ ] **Task 6: AI 日记 UI 构建**
  - **Description**: 实现 `hub.html` 右侧的日记展示，并在每日结算或点击按钮时获取日记。
  - **Acceptance criteria**:
    - [ ] UI 上可以显示生成的日记文本。
    - [ ] 提供一个“生成日记”按钮（防抖仅改善体验；真正的配额和限流由代理强制执行）。
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
| 上游 API 密钥被提取或滥用 | High | 不将 Key 分发给客户端；仅在已认证的代理服务中保存，并实施服务端配额、限流、撤销与异常使用监控。代理不可用时禁用 AI 日记，不回退到内置共享 Key。 |
| 恶意或被篡改的 Hub renderer 滥用 IPC | Med | 主进程校验 sender、schema 和频率；奖励从已持久化的任务状态推导，并使用固定事件 allowlist。 |
| 日志条目过多导致大模型上下文溢出 | Low | 只记录一天内有意义的聚合事件（如“喂食3次”，而不是3条独立记录）。 |

## Open Questions
- None. (All clarified with user previously).
