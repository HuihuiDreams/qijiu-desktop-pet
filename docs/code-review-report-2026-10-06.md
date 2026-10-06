# 全代码库质量与架构深度审查报告 (Code Review & Quality Audit)

> **审计日期**: 2026-10-06  
> **审计范围**: DeskPet 桌面宠物完整代码库 (`main.js`, `src/main/**`, `preload*.js`, `src/**`, `test/**`, 构建与安全脚本)  
> **审查标准**: Google/Karpathy Guidelines、Agent Skills (`code-review-and-quality`)、Electron 安全加固标准、ADR-001 ~ ADR-046  
> **测试基线**: Node.js `node:test` 测试套件（913 项用例：912 通过，1 跨平台跳过，0 失败）

---

## 1. 执行摘要 (Executive Summary)

本报告对 DeskPet（岳七 & 沈九桌面宠物）进行了全方位的五维质量审计（**正确性、可读性与简洁性、架构与设计、安全性、性能与资源**）。

### 总体评级：A+ (96 / 100)
该项目具有非常成熟、严谨的工程实践与质量控制标准。代码库整体表现出以下显著特征：
- **极度纯粹的进程边界**：主进程 (`main`)、预加载网关 (`preload`)、渲染进程 (`renderer`) 边界清晰，完全践行了最小权限原则与 Context Isolation。
- **高韧性防御性编程**：充分考量了多屏混合 DPI、系统睡眠与暗唤醒（Dark Wake）时间跳变、跨时区天气同步、会议防打扰仲裁等桌面端高难度边缘场景。
- **严苛的安全性保障**：渲染进程全局 **0 处** `innerHTML`；所有敏感 IPC 通道强制校验调用源窗口身份（`isSenderMainWindow`）；特权资产协议与加密解密流程健全。
- **高测试覆盖率与 ADR 规范**：全仓 913 个自动化测试覆盖了主进程 Mock、几何变换、时间状态机、天气清洗与 E2E 流程，并拥有 46 篇完整的架构决策记录（ADR）。

---

## 2. 五大维度深度审计 (Five-Axis Deep Audit)

### 维度一：正确性与健壮性 (Correctness & Robustness)

#### 评估结论：优秀 (97/100)

1. **时钟跳变与睡眠唤醒防御 (Game Loop & Sleep Protection)**
   - 在 [`src/app.js`](../src/app.js) 中，主循环步进以 `try/catch` 包裹，防止单帧渲染异常拖垮应用；
   - 针对系统睡眠（macOS Dark Wake、开盖或长休眠），实现了无条件的时间钳制（`deltaMs > 60000` 强制重置为 16ms 步进），并解耦离线衰减结算（[`OfflineReturnSystem.js`](../src/systems/OfflineReturnSystem.js)），彻底杜绝了角色因时间突跳产生的物理穿模与死循环。
2. **数值防御与类型转换 (Math & Coercion Guards)**
   - 严格遵循 `Number.isFinite` 校验：在 [`StageGeometry.js`](../src/systems/StageGeometry.js)、[`weatherSyncService.js`](../weatherSyncService.js) 等处，对外部 API 返回值或屏幕物理 Bounds 进行了严格的有限数防御，规避了 JavaScript 中 `Number(null) -> 0` 或 `NaN` 污染导致角色坐标异常消失的陷阱。
3. **窗口生命周期守卫 (Window Lifecycle Defenses)**
   - 主进程在向渲染进程推送消息前（如 [`LocaleService.js`](../src/main/services/LocaleService.js)、[`TrayManager.js`](../src/main/TrayManager.js)），全面配置了 `!window.isDestroyed()` 检查，避免了异步回调中窗口已关闭引发的崩盘。
4. **互斥仲裁设计 (Mutual Exclusion & State Machine)**
   - [`InterruptionCoordinator.js`](../src/main/services/InterruptionCoordinator.js) 与 [`PetVisibilityService.js`](../src/main/services/PetVisibilityService.js) 建立了原子互斥租约机制，精准裁决了“久坐提醒”与“CP 屏保”、“会议隐藏”与“番茄钟工作模式”的优先级，避免了多个全屏覆盖层同时争抢前台焦点的状态机撕裂。

---

### 维度二：可读性与简洁性 (Readability & Simplicity)

#### 评估结论：优秀 (95/100)

1. **Karpathy 原则贯彻度**
   - 没有为了抽象而抽象。没有臃肿繁复的 OOP 类继承金字塔或多层代理模式，主要业务逻辑以清晰的高内聚函数、模块化 Service 以及 Vanilla JS 为核心，代码直观透明。
   - 单一职责鲜明：例如主进程入口 [`main.js`](../main.js) 仅约 20 行，作为极简引导入口；核心装配由 [`AppLifecycle.js`](../src/main/AppLifecycle.js) 顺序编排。
2. **命名与国际化一致性**
   - 角色实体命名（`yueqi`、`shenjiu`）、状态枚举（`idle`、`walk`、`crawl`、`sitting`、`dragged` 等）、配置键名在整个代码库中保持完全统一。
   - 消除魔数：屏幕边界阈值、交互计时器、气泡停留时长均提升至常量或类静态属性中。

---

### 维度三：架构与模块设计 (Architecture & Design)

#### 评估结论：优秀 (96/100)

1. **清晰的三层架构与依赖倒置**
   - **主进程 (Main Process)**：负责原生系统交互（托盘、电源监控、多屏坐标计算、更新管理、electron-store 读写）。
   - **预加载层 (Preload Layer)**：按窗口划分为独立的最小权限 Preload 脚本（[`preload.js`](../preload.js)、[`statusPreload.js`](../statusPreload.js)、[`skinSelectorPreload.js`](../skinSelectorPreload.js)、[`pomodoroPreload.js`](../pomodoroPreload.js)、[`citySettingPreload.js`](../citySettingPreload.js)），仅暴露该窗口所需 API。
   - **渲染进程 (Renderer Process)**：纯浏览器上下文，禁止任何 Node 原生模块依赖，系统数据均通过依赖注入（DI）传入系统实例（如 `MovementSystem`, `InteractionSystem`, `PetRenderer`）。
2. **测试便利性设计 (Testability & Decoupling)**
   - 绝大多数 Service（如 [`PetVisibilityService.js`](../src/main/services/PetVisibilityService.js)、[`PresentationGuard.js`](../src/main/services/PresentationGuard.js)、[`StartupCachePolicy.js`](../src/main/services/StartupCachePolicy.js)）设计为接收 `deps` 依赖对象注入的纯逻辑模块，无需依赖真实 Electron 环境即可由原生 `node:test` 进行 100% 隔离覆盖。
3. **架构决策文档（ADR）闭环**
   - 46 篇 ADR 规范记录了从“透明通道像素拾取”、“混合 DPI 投影”、“AES-256 资源保护”到“按需缓存清理”的所有关键决策，形成了完整的架构审计链路。

---

### 维度四：安全性与加固 (Security & Hardening)

#### 评估结论：卓越 (98/100)

1. **渲染端零 XSS 注入点 (Zero `innerHTML`)**
   - 全局静态代码扫描确认：渲染进程代码库中 **完全没有** `innerHTML`、`outerHTML` 或 `document.write` 调用。所有动态气泡文案、状态更新、选肤器 DOM 树构建均采用 `document.createElement()`、`textContent`、`replaceChildren()` 及 `appendChild()` 原生 DOM API，彻底免疫 DOM-based XSS。
2. **严格的 Electron 安全基线配置**
   - 全局所有 `BrowserWindow` 实例均强制开启：
     ```javascript
     webPreferences: {
       contextIsolation: true,
       nodeIntegration: false,
       sandbox: true,
       // ...
     }
     ```
3. **IPC 调用方身份鉴权 (Sender Authorization)**
   - 在 [`IpcSenderAuthorization.js`](../src/main/services/IpcSenderAuthorization.js) 中实现了严密的 `isSenderMainWindow` 及 `isSenderWindow` 校验。
   - 敏感操作（如 `save-data`、`set-ignore-mouse-events`、`select-skin` 等）会对 `event.sender.id` 进行比对。即使子窗口（如城市设置窗）发生异常，也绝无法越权发起主窗口特权的系统调用或篡改持久化存储。
4. **受保护资产协议与防目录穿越**
   - 在 [`protectedAssetProtocol.js`](../protectedAssetProtocol.js) 与 [`protectedAssetLoader.js`](../protectedAssetLoader.js) 中，自定义协议 `pet-asset://` 对请求路径进行标准化检测，拒绝 `..` 穿越与非白名单协议访问，并通过 AES-256-GCM 流式解密，保证了加密皮肤资产的运行时安全。
5. **内容安全策略 (Content Security Policy)**
   - 所有 HTML 页面均配置了最小权限 CSP：
     `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' pet-asset: data:; ...`
6. **安装包防泄漏校验**
   - 针对打包分发，[`scripts/verify-package-contents.js`](../scripts/verify-package-contents.js) 严密过滤并断言 `.codex/`、`.agents/`、`AGENTS.md` 等内部开发文件不会泄漏到生产 `app.asar` 中。

---

### 维度五：性能与资源效率 (Performance & Resource Efficiency)

#### 评估结论：优秀 (94/100)

1. **高性能渲染管线**
   - 渲染层完全采用 `requestAnimationFrame` 驱动游戏循环；
   - 角色位移与缩放全部采用硬件加速变换：`transform: translate3d(x, y, 0) scale(s)`，有效避免了使用 `left`/`top` 属性引起的浏览器重排（Layout Reflow）。
2. **粒子数量限制与节点复用**
   - 天气粒子层 ([`WeatherParticleLayer.js`](../src/ui/WeatherParticleLayer.js)) 按天气类型与强度限制粒子数量；天气、强度、缩放、互动状态及宠物数量等输入不变时复用已有 DOM 节点，输入变化时清除并重建粒子层。屏保粒子层 ([`ScreensaverParticleLayer.js`](../src/ui/ScreensaverParticleLayer.js)) 每次 `mount()` 清除并重建节点，最多生成 12 个爱心粒子，并通过 CSS keyframe 动画控制 `opacity` 与 `transform`。两者均未实现预分配对象池，垃圾回收影响尚未通过性能测量验证。
3. **更新包校验的流式异步 I/O**
   - [`updateManager.js`](../updateManager.js) 中的安装包哈希校验采用 `fs.createReadStream` 与 `stream/promises.pipeline` 异步流式计算，避免了同步读取 80MB~120MB 大文件对主进程事件循环长达数十毫秒的卡顿。
4. **低功耗运行优化**
   - 在窗口隐藏、全屏遮挡或会议状态下，主进程与渲染进程均会暂停动画循环和定时采样，降低桌面宠物的 CPU/GPU 后台占有率。

---

## 3. 审查发现与改进建议 (Findings & Actionable Items)

本节将审计中发现的改进点按照严重级别列出：

### [Important] 发现 1：文档漂移 — `docs/structure.md` 引用已重构的旧文件（已修复）

- **位置**：[`docs/structure.md`](structure.md#L119) 第 119 行与第 140 行
- **现象**：
  - 结构文档中仍列出 `├─ src/main/services/ScreensaverEligibilityGuard.js` 与根目录 `├─ presentationGuard.js`；
  - 实际上，代码重构时已将两者的打扰守卫逻辑统一收拢合并至 [`src/main/services/PresentationGuard.js`](../src/main/services/PresentationGuard.js)，且根目录和 services 下原旧文件均已不存在；
  - 此外，`src/main/services/` 目录下实际存在的 [`AutoLaunchService.js`](../src/main/services/AutoLaunchService.js)、[`StoreManager.js`](../src/main/services/StoreManager.js) 和 [`IpcSenderAuthorization.js`](../src/main/services/IpcSenderAuthorization.js) 在 `docs/structure.md` 的模块树中未列出。
- **影响**：新开发者或 Agent 根据 `docs/structure.md` 索引代码时可能会发生路径寻找偏差。
- **处置方案**：已同步修正 `docs/structure.md` 拓扑图与目录树，补齐现存服务并移除废弃文件。

---

### [Consider] 发现 2：`BreakReminderPresenter.js` 内部延时定时器句柄清理（已优化）

- **位置**：[`src/ui/BreakReminderPresenter.js`](../src/ui/BreakReminderPresenter.js#L129-L136)
- **现象**：在久坐提醒触发时，分别设置了 300ms 和 800ms 的延时来弹出岳七和沈九的气泡。若用户在 300ms 内快速点击桌宠触发 `dismiss()`，这两个 `setTimeout` 的计时器句柄未被显式取消。由于原有回调内存在 `if (!this.breakReminderActive) return;` 的状态防御，该问题在实际生产环境中属于 False Positive，未导致气泡意外弹出的 Bug。
- **处置方案**：为保持内存卫生与测试健壮性（避免测试框架报错），在 `BreakReminderPresenter` 中引入 `breakReminderBubbleTimers` 数组并封装 `_clearTimers()`，在 `dismiss()` 及重新触发时统一清空全部气泡定时器句柄，并在 `test/breakReminderPresenter.test.js` 中补齐断言。

---

### [Consider] 发现 3：`StorageIpc.js` 安全存储键白名单设计显式说明（已优化）

- **位置**：[`src/main/services/StorageIpc.js`](../src/main/services/StorageIpc.js#L8-L14)
- **现象**：`ALLOWED_STORE_KEYS` 白名单包含 `autoLaunch`、`petState`、`locale`、`breakReminderSettings`、`lastPomodoroMinutes`，而 `screensaverSettings` 和 `weatherSyncSettings` 未包含在内。
- **处置方案**：在 `StorageIpc.js` 中补充清晰的架构注释，明确指出屏保与天气配置由主进程控制器独占托管，遵循最小权限原则对渲染进程隔离，防止后续开发误解。

---

### [Nit] 发现 4：`updateManager.js` 中的动态 `require('electron')`（已优化）

- **位置**：[`updateManager.js`](../updateManager.js#L350)
- **现象**：在 macOS 手动更新分支中，内联调用了 `const { shell } = require('electron');`。
- **处置方案**：在模块顶部新增 `loadDefaultShell()`，并在 `createUpdateManager` 中提供 `options.getShell` 依赖注入能力，保持与 `loadDefaultAutoUpdater` / `loadDefaultLog` 一致的模块化风格，并在 `test/updateManager.test.js` 中新增纯单测用例。

---

## 4. 汇总与评审结论

| 审查维度 | 评分 | 状态 | 总结 |
| :--- | :---: | :---: | :--- |
| **正确性 (Correctness)** | 97 | 优秀 | 严密的睡眠时钟钳制、数值校验、窗口生命周期防崩与状态机仲裁 |
| **可读性与简洁性 (Simplicity)** | 95 | 优秀 | 契合 Karpathy 原则，无过度设计，逻辑清晰直观 |
| **架构设计 (Architecture)** | 96 | 优秀 | 严格的三层边界解耦，DI 依赖注入利于独立测试，ADR 闭环记录完善 |
| **安全性 (Security)** | 98 | 卓越 | 0 处 innerHTML、沙盒化 Context Isolation、IPC 严格鉴权、AES-256 加密协议 |
| **性能表现 (Performance)** | 94 | 优秀 | rAF 硬件加速渲染、粒子数量限制与天气节点复用、流式大文件哈希校验 |

**综合评审建议**：
代码库整体质量极高，工程化水平过硬。仅需对 `docs/structure.md` 中微小的文档漂移进行同步，并在后续维护中持续遵循现有的敏捷单测与 ADR 规范。
