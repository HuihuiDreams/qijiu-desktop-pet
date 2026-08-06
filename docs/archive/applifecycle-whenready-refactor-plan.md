# Implementation Plan: AppLifecycle.js `whenReady` 回调拆分

## Overview

将 `src/main/AppLifecycle.js` 中 ~200 行的 `app.whenReady().then(...)` 回调拆分为多个职责清晰的私有方法，保持初始化顺序不变，仅做结构性重构。

## Architecture Decisions

- **保持所有初始化顺序不变** — 这是纯结构重构，不改变任何行为或依赖关系
- **拆分为类实例方法（静态方法）** — 与现有 `AppLifecycle` 类风格一致
- **`screensaverController` 保持模块级变量** — 它被 `before-quit` 和多个 lambda 引用，不适合局部化
- **新方法均为 `static async`** — 与现有 `static init()` 一致

## 当前 whenReady 依赖图分析

```
Platform Security (menu, protocol, dock, permissions)
    │
    └── Store + Locale + AutoLaunch
            │
            ├── Screensaver System (coordinator, guard, controller)
            │
            ├── Feature Services (BreakReminder, Weather, Update, Display,
            │   Awareness, Visibility, Meeting, Pomodoro)
            │       │
            │       └── Pet Window (init + create)
            │               │
            │               └── Tray (init + create)
            │                       │
            │                       └── Sub-Windows & IPC (Status, City,
            │                           Locale, Storage, Skin, SkinSelector,
            │                           Pomodoro Window)
```

## Task List

### Phase 1: 提取方法

---

#### Task 1: 提取 `initPlatformSecurity()`

**Description:** 将平台/安全相关的 4 行初始化代码提取为独立方法。

**Acceptance criteria:**
- [x] 顶部增加导入：将 `session`, `powerMonitor`, `screen` 合并到文件顶部的 `require('electron')` 语句中
- [x] 提取 `disableApplicationMenu`、`registerProtectedAssetProtocol`、`app.dock.hide`、`session.setPermissionRequestHandler` 到 `static initPlatformSecurity()` 方法
- [x] whenReady 中用 `AppLifecycle.initPlatformSecurity()` 调用替换

**Dependencies:** None

**Files likely touched:**
- `src/main/AppLifecycle.js`

**Estimated scope:** XS (1 file)

---

#### Task 2: 提取 `initCoreServices()`

**Description:** 将 Store 初始化、Locale 加载、AutoLaunch 同步提取为独立方法。

**Acceptance criteria:**
- [x] 提取 `StoreManager.initStore()`、`LocaleService.loadInitialLocale()`、`AutoLaunchService.syncAutoLaunchPreference()` 到 `static async initCoreServices()` 方法
- [x] whenReady 中用 `await AppLifecycle.initCoreServices()` 调用替换

**Dependencies:** None

**Files likely touched:**
- `src/main/AppLifecycle.js`

**Estimated scope:** XS (1 file)

---

#### Task 3: 提取 `initScreensaverSystem()`

**Description:** 将屏保相关的三个工厂函数和 controller 初始化提取为独立方法。

**Acceptance criteria:**
- [x] 提取 `createInterruptionCoordinator`、`createScreensaverEligibilityGuard`、`createScreensaverController`、`screensaverController.start()` 到 `static initScreensaverSystem()` 方法
- [x] `screensaverController` 赋值仍保持对模块级变量的写入
- [x] whenReady 中用 `AppLifecycle.initScreensaverSystem()` 调用替换

**Dependencies:** None

**Files likely touched:**
- `src/main/AppLifecycle.js`

**Estimated scope:** S (1 file)

---

#### Task 4: 提取 `initFeatureServices()`

**Description:** 将所有功能控制器/服务（BreakReminder、Weather、Update、Display、Awareness、Visibility、Meeting、Pomodoro）的 init 调用提取为独立方法。

**Acceptance criteria:**
- [x] 提取 BreakReminderController.init、WeatherSyncController.init、updateProgressWindowModule.init、initUpdateManager、DisplayService.init、WindowAwarenessService.init、PetVisibilityService.init、MeetingDetectorController.init、PomodoroService.init 到 `static initFeatureServices()` 方法
- [x] whenReady 中用 `AppLifecycle.initFeatureServices()` 调用替换

**Dependencies:** None

**Files likely touched:**
- `src/main/AppLifecycle.js`

**Estimated scope:** S (1 file)

---

#### Task 5: 提取 `initPetWindow()`

**Description:** 将宠物窗口的初始化和创建提取为独立方法。

**Acceptance criteria:**
- [x] 提取 `petWindowModule.init()` + `petWindowModule.createWindow()` 到 `static initPetWindow()` 方法
- [x] whenReady 中用 `AppLifecycle.initPetWindow()` 调用替换

**Dependencies:** None

**Files likely touched:**
- `src/main/AppLifecycle.js`

**Estimated scope:** XS (1 file)

---

#### Task 6: 提取 `initTray()`

**Description:** 将托盘管理器的初始化和创建提取为独立方法。

**Acceptance criteria:**
- [x] 提取 `trayManager.init()` + `trayManager.createTray()` 到 `static initTray()` 方法
- [x] whenReady 中用 `AppLifecycle.initTray()` 调用替换

**Dependencies:** None

**Files likely touched:**
- `src/main/AppLifecycle.js`

**Estimated scope:** S (1 file，trayManager.init 参数较多)

---

#### Task 7: 提取 `initSubWindowsAndIpc()`

**Description:** 将子窗口（Status、City、SkinSelector、Pomodoro）及 IPC 相关的初始化提取为独立方法。

**Acceptance criteria:**
- [x] 提取 statusWindowModule.init、citySettingWindowModule.init、LocaleService.init、StorageIpc.init、SkinService.init、skinSelectorWindowModule.init、pomodoroWindowModule.init 到 `static initSubWindowsAndIpc()` 方法
- [x] whenReady 中用 `AppLifecycle.initSubWindowsAndIpc()` 调用替换

**Dependencies:** None

**Files likely touched:**
- `src/main/AppLifecycle.js`

**Estimated scope:** S (1 file)

---

### Checkpoint: 提取完成后（Task 1-7 全部完成）

- [x] `whenReady` 回调缩减为 ~15 行，仅包含方法调用
- [x] 现有测试全部通过: `npm test -- test/appLifecycle.behavior.test.js`
- [x] 完整测试套件通过: `npm test`
- [x] 无 ESLint 错误: `npm run lint`（如有）

---

### Phase 2: 验证

#### Task 8: 更新测试和文档

**Description:** 确保现有行为测试覆盖新的方法调用链，更新 CHANGELOG。

**Acceptance criteria:**
- [x] `test/appLifecycle.behavior.test.js` 通过（测试是基于 call order 的，提取方法不应改变调用顺序，测试应无需修改即可通过）
- [x] 更新 `CHANGELOG.md` — 在 Unreleased > Changed 下记录此重构
- [x] 如果存在相关 ADR，保持同步

**Dependencies:** Tasks 1-7

**Files likely touched:**
- `test/appLifecycle.behavior.test.js`（可能需要微调）
- `CHANGELOG.md`

**Estimated scope:** S (1-2 files)

---

## 重构后 whenReady 目标形态

```javascript
app.whenReady().then(async () => {
  AppLifecycle.initPlatformSecurity();
  await AppLifecycle.initCoreServices();
  AppLifecycle.initScreensaverSystem();
  AppLifecycle.initFeatureServices();
  AppLifecycle.initPetWindow();
  AppLifecycle.initTray();
  AppLifecycle.initSubWindowsAndIpc();
}).catch(err => { console.error('WHEN READY ERROR:', err); });
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 提取方法时意外改变初始化顺序 | High | 现有 `appLifecycle.behavior.test.js` 已验证 call order，提取后运行测试确认 |
| `screensaverController` 模块变量引用丢失 | Medium | 保持模块级变量不变，方法内通过赋值写入 |
| trayManager.init 的长参数对象拷贝不完整 | Medium | 直接移动代码块，不修改参数结构 |
| `require('electron')` 作用域丢失导致报错 | Medium | 将 `session, powerMonitor, screen` 提升至文件顶部导入，供所有初始化方法全局使用 |

## Open Questions

- 无需额外决策，这是一个纯结构重构，行为不变。
