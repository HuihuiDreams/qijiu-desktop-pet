# ADR-042: 主进程与渲染进程巨石文件拆分方案（Main & Renderer Module Decomposition）

## Status (状态)
已接受，Phase 0 落地（Accepted, Phase 0 landed）

## Date (日期)
2026-07-20

## Context (背景)
项目当前存在两个持续膨胀的“巨石文件”：

1. **`src/main/AppLifecycle.js`**（约 1608 行）— 主进程的“上帝模块”。真正的 `class AppLifecycle` 本体只有约 200 行，其余是约 25 个模块级共享 `let` 状态、大量自由函数，以及 `require` 时就会执行的顶层 `ipcMain` 注册。职责横跨多屏几何、皮肤管理、番茄钟、天气同步、宠物可见性状态机、会议检测、退出前保存、更新进度窗口等十余个互不相关的领域。
2. **`src/app.js`**（约 906 行）— 宠物窗口渲染进程入口，以非 CommonJS 的 `<script>` 标签加载，整份文件是一个巨大的 `(async function main(){...})()` IIFE，所有逻辑共享同一个闭包，难以单独测试或复用。

这两个文件的体量与职责密度使得每次小改动都伴随较高的回归风险（历史上已发生多次“重构引入功能回归、靠事后补测试修复”的教训，详见 `CHANGELOG.md` `[Unreleased]` 中“主进程架构重构与模块化”条目下的修复列表）。同时，仓库里已有 10+ 个主进程测试通过手写字符串拼接 `main.js + AppLifecycle.js + TrayManager.js`（甚至有个别文件重复拼接同一文件）来做源码级字符串/正则断言，这种写法与代码的物理位置强绑定：以后任何一次“把某段逻辑从 AppLifecycle.js 挪到独立模块”的搬迁，都要求同步修改这些测试的文件路径拼接，形成了阻碍渐进式重构的“测试位置耦合”。

## Decision (决策)

我们决定不引入打包工具（webpack / vite / esbuild 等），保持项目现有的“零构建步骤、`<script>` 标签直连”架构，采用两套已在代码库中验证过的既有拆分模式，将两个巨石文件渐进式地拆解为若干职责单一的模块：

1. **主进程：`init(deps)` 依赖注入模块模式**（参照已有的 `src/main/windows/StatusWindow.js`、`src/main/TrayManager.js`）。
   - 每个新模块内部维护一个模块级 `let deps = {}`，通过 `init(deps)` 接收所有外部依赖（如 `windowManager`、`trayManager`、其他服务模块的访问器函数等）。
   - 模块在自己的 `init(deps)` 内自行完成本模块相关 `ipcMain` handler 的注册，不再由 `AppLifecycle.js` 集中注册。
   - 跨模块共享状态一律通过显式的 `getX()`/`setX()` 访问器函数注入和读取，杜绝裸的模块级可变全局变量跨文件直接引用。
   - `AppLifecycle.js` 最终收敛为一个“启动引导 + 各模块 `init(deps)` 接线”的薄编排层：只保留 `protocol.registerSchemesAsPrivileged`、Chromium 启动参数配置、`app.whenReady()` 生命周期钩子等必须在 `require` 时或应用启动早期执行、无法委派给按需初始化模块的部分。

2. **渲染进程：全局 class + 底部双导出守卫模式**（参照已有的 `src/systems/*.js`）。
   - 新文件定义一个全局可访问的 `class`，文件底部附加 `if (typeof module !== 'undefined') { module.exports = { ... }; }` 守卫，使同一份代码既能在浏览器 `<script>` 标签环境下挂载全局，又能在 Node/`node:test` 环境下通过 `require()` 加载做单元测试。
   - 新文件在 `src/index.html` 中以 `<script src="...?v=1">` 的形式接入，必须放在既有系统脚本之后、`app.js` 之前，保证依赖顺序正确。
   - `src/app.js` 内共享的闭包状态改为显式 `deps` 对象（如 `getPets`、`getScreenInfo` 等访问器），由 `app.js` 在组合根中统一装配注入给各个新拆出的渲染进程模块，`app.js` 最终收敛为“实例化各系统 + 订阅 IPC + 精简后的 `gameLoop`”的组合根。

3. **测试基础设施：统一 source corpus helper**。
   - 新增 `test/helpers/sourceCorpus.js`，导出：
     - `readMainProcessSource()`：递归拼接 `main.js` 与 `src/main/` 目录下全部 `.js` 文件（按路径确定性排序），返回单个字符串；
     - `read(relativePath)`：以仓库根目录为基准读取单个文件。
   - 所有原先手写 `main.js + AppLifecycle.js + TrayManager.js`（及个别文件额外拼接的窗口模块）做字符串/正则断言的测试统一改为调用 `readMainProcessSource()`，使这些断言与被断言逻辑的具体文件位置解耦——后续把某段逻辑从 `AppLifecycle.js` 搬到独立的 `src/main/services/*.js` 模块时，这些测试原则上不需要再修改。
   - 少数需要校验“逻辑确实位于某个具体文件”的安全/回归类测试（例如 `finalSaveBeforeQuit`、`statusWindowRegression`、`updateProgressSecurity` 等对精确文件级断言有意保留的用例）不纳入本次统一改造，继续使用各自的单文件/精确路径读取——文件精确性在这些场景下本身就是被测试的特性，会在对应的搬迁阶段单独更新读取目标。

## Consequences (影响)

- 正面：
  - 主进程与渲染进程都能按阶段（一个模块一个原子提交）渐进式拆分，每个阶段结束后应用可运行、`npm test` 全绿，止损点清晰。
  - 绝大多数既有主进程测试（10+ 个文件）在后续搬迁阶段免于逐个修改文件路径，显著降低了重构过程中的测试维护成本与出错概率。
  - 不引入打包工具，保持了项目现有的极简构建链路和调试体验（`<script>` 标签直接映射源文件，浏览器 DevTools 断点无需 source map）。
  - 主进程新模块通过依赖注入解耦对 `electron` 的直接依赖，逐步创造出真正可脱离 Electron 运行时做单元测试的模块（例如后续阶段的 `PetVisibilityService`）。
- 代价与需要人工留意的点：
  - `readMainProcessSource()` 拼接的语料库会随着拆分逐步变大（新增模块文件会被自动纳入），个别依赖 `indexOf`/`slice` 做“文件内相对顺序”断言的测试，在语料库扩大后理论上存在“同名子串出现在语料库更早位置”从而误命中的风险；每次改造都必须以实际跑通 `npm test` 为准，不能只凭静态审查。
  - `TrayManager.init(...)` 传入的依赖对象形状（约 36 个回调，定义于 `AppLifecycle.js`）在整个拆分过程中必须保持冻结，只允许把回调背后的实现重新指向新模块，精简该依赖对象的工作明确排除在本次重构范围之外。
  - IPC 通道名、`electron-store` 的 store key、IPC payload 结构、各类定时器间隔在整个拆分过程中全程冻结，不随文件搬迁发生任何行为变化。

## Alternatives Considered (替代方案)

- **引入打包器（webpack/vite/esbuild）统一模块化**：可以获得更标准的 ES Module 语法和更强的静态分析能力，但会显著偏离项目现有的零构建步骤架构，增加构建配置、调试映射与打包体积的维护成本，且与当前“单文件对应单 `<script>` 标签”的简单心智模型冲突，本次不采纳。
- **一次性整体重写两个巨石文件**：理论上可以更快达到目标终态，但两个文件历史上已多次证明“大范围一次性重构容易引入难以定位的行为回归”（见 `CHANGELOG.md` 中的相关修复记录），且难以在中途设置可靠的止损点。本次采纳分阶段、每阶段独立可提交可验证的渐进式路径。
