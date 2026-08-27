# ADR-046: 主进程测试的 Electron Mock 拦截策略

## Status
Accepted

## Date
2026-08-27

## Context
随着 DeskPet 功能的不断丰富，诸如 `PetWindow`、`TrayManager` 和 `SkinService` 等主进程核心服务承载了越来越多的状态流转与鉴权逻辑。为了保证系统稳定性，我们需要提升这些模块的单元测试覆盖率。

面临的主要挑战是：
1. 这些模块强依赖于 `electron` 模块（如 `app`, `BrowserWindow`, `Tray`, `ipcMain`, `screen` 等）。
2. 在 Node.js 环境下运行 Mocha/Ava 等测试框架时，原生并不存在 `electron` 模块，直接 `require('electron')` 会抛出模块未找到错误。
3. 如果在每个测试文件内部通过重写全局变量或注入依赖的方式去 mock，容易导致生产代码（如 `const { app } = require('electron')`）在顶层作用域捕获到未初始化或错误的引用，或者需要重构大量历史生产代码以适配依赖注入。

## Decision
我们决定采用基于 `Module.prototype.require` 的猴子补丁（Monkey Patching）拦截策略来进行 Electron 的集中式 Mock，核心文件为 `test/helpers/mockElectron.js`。

1. **集中化 Mock 对象**：在 `mockElectron.js` 中定义所有需要的 Electron API 存根（Stubs/Mocks），例如一个内存中的 `MockApp`，`MockTray`，以及 `MockWebContents`，以模拟实际的框架行为。
2. **底层模块拦截**：通过改写 Node.js 内置的 `require` 方法：
   ```js
   const Module = require('module');
   const originalRequire = Module.prototype.require;
   Module.prototype.require = function (id) {
       if (id === 'electron') {
           return mockElectron;
       }
       return originalRequire.apply(this, arguments);
   };
   ```
3. **即时隔离与还原**：在每一个测试套件的末尾（例如 `test.after()` 或 `after()` 钩子），必须还原 `Module.prototype.require = originalRequire` 并清空 Node 模块缓存 `delete require.cache[require.resolve('...')]`，以防止当前测试修改的全局状态污染其他并发或连续执行的测试文件。

## Consequences
- **Positive**:
  - **保持生产代码原样**：生产代码无需进行任何“为测试而生”的妥协或修改（无需强行 DI 化）。代码依然可以使用原生的 `require('electron')` 习惯。
  - **集中可控**：Mock 逻辑集中在一处，方便维护和添加断言助手，避免测试文件中到处充斥着杂乱的 mock 代码。
  - **高覆盖率达成**：使主进程关键服务（`TrayManager`, `PetWindow`, `SkinService`）的测试覆盖率能够顺利提升至 80%~100%。
- **Negative**:
  - **副作用管理要求严苛**：这种 Node 底层机制的修改是全局性的，如果忘记清理钩子或缓存刷新机制失败，极易造成后续测试诡异崩溃。需要严格遵守 `after`/`test.after` 的清理约定。
  - **时序依赖**：必须在 require 任何被测试的主进程模块之前，先 require 并初始化 `mockElectron.js`。

## Alternatives Considered
- **重构生产代码支持依赖注入 (Dependency Injection)**：将 `app` 和 `ipcMain` 等作为参数传递给类构造函数。
  - *缺点*：改造范围过大，且主进程大量模块属于单例模式，DI 化会增加冗余样板代码，违背 KISS 原则。
- **使用第三方 Mock 库 (如 `proxyquire`, `mockery`)**：
  - *缺点*：引入额外的外部依赖，且在复杂模块缓存下经常出现意外穿透，不如直接拦截原生的 `require` 来的透明且符合当前项目的极简风格。
