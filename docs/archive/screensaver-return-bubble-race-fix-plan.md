# 开盖回归气泡与屏保竞态修复计划

> 状态：已完成  
> 最后更新：2026-08-06  
> 关联 Bug：macOS 开盖后屏保仍在播放，但宠物已弹出「你走了 X 个时辰」  
> 备注：代码评审后追加了“加固”改动；随后又进行了简化与序列令牌修正，当前实现以文末「后续简化与序列令牌修正」为准。

---

## Objective

修复 macOS 开盖唤醒后，离线回归气泡与 CP 屏保的时序竞态：确保屏保先完成退出动画，再弹出离线回归气泡。

## User Value

消除开盖后两个系统同时表演的视觉混乱。让屏保的被抓包/跑回动画完整播放后，宠物才说出「你走了 X 个时辰」，体验连贯且自然。

## Scope / Non-goals

**在 Scope 内：**
- `OfflineReturnSystem` 感知屏保状态
- 气泡延迟到屏保结束后弹出
- 对应的单元测试

**Non-goals：**
- 不修改 `ScreensaverController` 主进程逻辑
- 不改变属性衰减（`applyOfflineDecay`）的时序 — 衰减照常立刻执行
- 不改变非屏保场景下的行为（除气泡序列在途时 `pendingReturnBubble` 保留数据外，见「评审加固」）

## 根因概述

`powerMonitor.resume` 同时触发两条独立的事件链：

1. **BreakReminderController** → 立刻发 `system-resumed` IPC → `OfflineReturnSystem.handleSystemResume()` → 1.5s/3s 后弹出时辰气泡
2. **ScreensaverController** → 重置 poll timer → 可能在 5s 内重新触发屏保（用户还没碰鼠标，idleTime 仍高）

两个系统之间没有协调机制，离线回归气泡在屏保仍活跃时就弹出了。

## Architecture Decisions

- **在渲染进程层面协调**（而非主进程）：OfflineReturnSystem 和 ScreensaverSystem 都在渲染进程，通过回调注入即可互通，无需跨进程 IPC。
- **依赖注入方式**：新增 `isScreensaverActive` 回调，保持 OfflineReturnSystem 的可测试性。
- **暂存而非丢弃**：气泡参数暂存到 `pendingReturnBubble`，屏保结束后主动 flush，不漏消息。

## Dependencies

- 无外部依赖
- 内部依赖：`OfflineReturnSystem`、`ScreensaverSystem`、`app.js`（游戏循环）

## Boundaries

- Always: `applyOfflineDecay` 衰减始终立刻执行，不受屏保状态影响
- Always: 非屏保场景下行为不变
- Always: 暂存的气泡最多只有一份（后到的覆盖前一份）
- Never: OfflineReturnSystem 不直接引用 ScreensaverSystem 实例，只通过回调

## Commands

- Dev: `npm run dev`
- Test all: `npm test`
- Focused test: `node --test test/offlineReturnSystem.test.js`

## Project Structure

涉及文件：

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/systems/OfflineReturnSystem.js` | 修改 | 增加 `isScreensaverActive` 依赖、`pendingReturnBubble` 暂存、`scheduleReturnBubbles()`（触发时重新检查屏保状态）、`flushPendingReturnBubble()`、`handleScreensaverStart()` |
| `src/systems/ScreensaverSystem.js` | 修改 | 注入 `onScreensaverStart` / `onScreensaverEnd` 事件钩子（评审加固：替代游戏循环边沿检测） |
| `src/app.js` | 修改 | 注入依赖 + 屏保事件钩子接线，移除游戏循环的 rAF 边沿检测 |
| `test/offlineReturnSystem.test.js` | 修改 | 新增屏保感知/暂存/flush/触发时重检/屏保开始重置 相关测试用例 |
| `CHANGELOG.md` | 修改 | 添加修复记录 |

---

## Task Breakdown

### Task 1: OfflineReturnSystem 增加屏保感知与气泡暂存

**Description:** 在 `OfflineReturnSystem` 中新增 `isScreensaverActive` 可选依赖注入。修改 `handleOfflineReturn()` 使其在屏保活跃时不立刻弹出气泡，而是将气泡参数暂存到 `this.pendingReturnBubble`。新增 `flushPendingReturnBubble()` 方法用于屏保结束后弹出暂存气泡。

**Acceptance criteria:**
- [x] 构造函数接受可选 `isScreensaverActive` 回调，默认 `() => false`
- [x] `handleOfflineReturn()` 在 `isScreensaverActive()` 返回 `true` 时暂存气泡参数到 `this.pendingReturnBubble`，不调用 `setTimeout`
- [x] `handleOfflineReturn()` 在 `isScreensaverActive()` 返回 `false` 时直接调度弹出（行为不变；评审加固后序列在途时 `pendingReturnBubble` 保留数据）
- [x] `flushPendingReturnBubble()` 存在暂存气泡时弹出并清空 `this.pendingReturnBubble`
- [x] `flushPendingReturnBubble()` 无暂存气泡时是无操作
- [x] 属性衰减（`applyOfflineDecay`）始终立刻执行，不受屏保状态影响

**Verification:**
- [ ] `node --test test/offlineReturnSystem.test.js` 通过
- [ ] 原有全部测试不回归

**Dependencies:** 无

**Files likely touched:**
- `src/systems/OfflineReturnSystem.js`

**Estimated scope:** S (1 file)

**具体改动方案：**

```diff
 // constructor
 constructor(deps = {}) {
+    this.isScreensaverActive = typeof deps.isScreensaverActive === 'function'
+      ? deps.isScreensaverActive
+      : () => false;
+    this.pendingReturnBubble = null;
     // ... existing code
 }
```

```diff
 // handleOfflineReturn — 气泡弹出部分
     if (shichensAway >= 1 && isUserPresent) {
       const i18nUi = this.getI18nUi();
       const returnMsgYueqi = ...;
       const returnMsgShenjiu = ...;
-      setTimeout(() => {
-        this.dialogBubble.show(yueqi, returnMsgYueqi, 4000);
-      }, 1500);
-      setTimeout(() => {
-        this.dialogBubble.show(shenjiu, returnMsgShenjiu, 4000);
-      }, 3000);
+      if (this.isScreensaverActive()) {
+        this.pendingReturnBubble = { yueqi, shenjiu, returnMsgYueqi, returnMsgShenjiu };
+      } else {
+        setTimeout(() => {
+          this.dialogBubble.show(yueqi, returnMsgYueqi, 4000);
+        }, 1500);
+        setTimeout(() => {
+          this.dialogBubble.show(shenjiu, returnMsgShenjiu, 4000);
+        }, 3000);
+      }
     }
```

```diff
+  flushPendingReturnBubble() {
+    const pending = this.pendingReturnBubble;
+    if (!pending) return;
+    this.pendingReturnBubble = null;
+    setTimeout(() => {
+      this.dialogBubble.show(pending.yueqi, pending.returnMsgYueqi, 4000);
+    }, 1500);
+    setTimeout(() => {
+      this.dialogBubble.show(pending.shenjiu, pending.returnMsgShenjiu, 4000);
+    }, 3000);
+  }
```

---

### Task 2: 为 Task 1 编写单元测试

**Description:** 在 `test/offlineReturnSystem.test.js` 中新增 3 个测试用例，验证屏保活跃时气泡暂存行为、flush 行为和非屏保场景不受影响。

**Acceptance criteria:**
- [x] 测试：屏保活跃时 `handleOfflineReturn()` 不调度 `setTimeout`，`pendingReturnBubble` 非空
- [x] 测试：调用 `flushPendingReturnBubble()` 后暂存气泡被弹出（屏保已结束时）
- [x] 测试：屏保不活跃时 `handleOfflineReturn()` 调度弹出，序列在途时保留 `pendingReturnBubble`，展示窗口结束后释放

**Verification:**
- [ ] `node --test test/offlineReturnSystem.test.js` 全部通过
- [ ] `npm test` 全部通过

**Dependencies:** Task 1

**Files likely touched:**
- `test/offlineReturnSystem.test.js`

**Estimated scope:** S (1 file)

---

### Checkpoint: Task 1–2 完成后

- [x] `node --test test/offlineReturnSystem.test.js` 通过
- [x] `npm test` 通过
- [x] `OfflineReturnSystem` 在屏保活跃时不弹气泡、在屏保不活跃时行为不变（序列在途时保留 pending 数据）

---

### Task 3: app.js 注入依赖 + 屏保事件钩子接线（评审加固后）

**Description:** 在 `app.js` 中注入 `isScreensaverActive`；在 `ScreensaverSystem` 构造时注入 `onScreensaverStart` / `onScreensaverEnd` 事件钩子，分别桥接到 `offlineReturnSystem.handleScreensaverStart()` 与 `offlineReturnSystem.flushPendingReturnBubble()`；`ScreensaverSystem` 在 `onStart()` 调用开始钩子、在 `reset()` 末尾调用结束钩子。游戏循环中不再跟踪屏保状态边沿（评审后改为事件驱动，避免窗口隐藏/节流时 rAF 暂停导致 flush 被无限推迟）。

**Acceptance criteria:**
- [x] `OfflineReturnSystem` 构造时传入 `isScreensaverActive: () => screensaverSystem.isActive()`
- [x] `ScreensaverSystem` 构造时注入 `onScreensaverStart` / `onScreensaverEnd` 两个可选回调，缺省为空操作
- [x] `onStart()` 中 `removeForPets` 之后调用 `onScreensaverStart`，通知回归气泡整组重置为未展示
- [x] `reset()` 末尾调用 `onScreensaverEnd` 触发 flush；游戏循环中删除 `wasScreensaverActive` 边沿检测
- [x] 不修改 `ScreensaverController` 的任何代码

**Verification:**
- [ ] `npm run dev` 启动后手动验证：
  1. 等屏保触发 → 合盖 → 等 ≥2 小时 → 开盖
  2. 屏保先完成退出 → 然后才弹出时辰气泡
- [ ] `npm test` 通过

**Dependencies:** Task 1

**Files likely touched:**
- `src/app.js`

**Estimated scope:** XS (1 file，几行改动)

**具体改动方案：**

```diff
 // OfflineReturnSystem 构造，约 L161
 const offlineReturnSystem = new OfflineReturnSystem({
     getPets: () => pets,
     nurtureSystemA,
     nurtureSystemB,
     timeSystem,
     skinManager,
     dialogBubble,
     getI18nUi: () => window.I18N_UI,
     CONFIG,
+    isScreensaverActive: () => screensaverSystem.isActive(),
   });
```

注意：`screensaverSystem` 在 L211 才创建，但 `isScreensaverActive` 是一个闭包函数，在调用时（游戏循环运行后）才取值，此时 `screensaverSystem` 已存在。所以**无需调整创建顺序**。

```diff
  // ScreensaverSystem 构造
  const screensaverSystem = new ScreensaverSystem({
      ...
+     onScreensaverStart: () => offlineReturnSystem.handleScreensaverStart(),
+     onScreensaverEnd: () => offlineReturnSystem.flushPendingReturnBubble(),
    });
```

```diff
  // ScreensaverSystem.onStart — removeForPets 之后
+    if (typeof this.onScreensaverStart === 'function') {
+      this.onScreensaverStart();
+    }

  // ScreensaverSystem.reset — 方法末尾
+    if (typeof this.onScreensaverEnd === 'function') {
+      this.onScreensaverEnd();
+    }
```

```diff
  // 游戏循环：删除 rAF 边沿检测
-  let wasScreensaverActive = false;
   ...
-  // 屏保退出边沿检测：flush 暂存的离线回归气泡
-  if (wasScreensaverActive && !isScreensaverActive) {
-    offlineReturnSystem.flushPendingReturnBubble();
-  }
-  wasScreensaverActive = isScreensaverActive;
```

---

### Task 4: 更新 CHANGELOG

**Description:** 在 `CHANGELOG.md` 的 `Unreleased` 下 `Fixed` 中记录此修复。

**Acceptance criteria:**
- [x] `Fixed` 条目描述：macOS 开盖后屏保与离线回归气泡的时序竞态
- [x] 不新增重复的 `Fixed` heading

**Dependencies:** Task 3

**Files likely touched:**
- `CHANGELOG.md`

**Estimated scope:** XS

---

### Checkpoint: 全部完成

- [x] `npm test` 通过
- [ ] `npm run dev` 手动验证通过（待验证：开盖后屏保先完成退出动画，再弹出时辰气泡）
- [x] CHANGELOG 已更新

---

## 评审加固（Review Hardening，2026-08-06）

代码评审发现原方案的两处缺口，已一并修复：

### H-1：屏保重新触发（待机轮询）时气泡仍可能被清掉

原方案只在“结算瞬间屏保活跃”时暂存；但 macOS 开盖唤醒后，主进程待机轮询（5s）可能随后重新触发屏保会话，其 `onStart()` 的 `removeForPets` 会清掉正展示中的回归气泡（此时 `pendingReturnBubble` 已随 flush 清空，消息丢失）。

修复（三层防线）：
1. **触发时重检**：`scheduleReturnBubbles()` 的每个 setTimeout 回调在展示前重新检查 `isScreensaverActive()`，屏保又开始了就重新暂存；
2. **序列在途保留**：`pendingReturnBubble` 在末条气泡展示窗口结束（`RETURN_BUBBLE_SEQUENCE_MS`）前保持非空，屏保打断时数据不会随 flush 丢失；
3. **屏保开始重置**：`onStart()` 通过注入的 `onScreensaverStart` 钩子调用 `handleScreensaverStart()`，把整组重置为未展示状态，屏保结束后 `reset()` → `onScreensaverEnd` → flush 完整补发；`shown` 标记保证已完整展示的部分不重复。

### H-2：flush 依赖 rAF 循环，窗口隐藏时被无限推迟

原方案在游戏循环中检测屏保退出边沿；窗口隐藏/最小化时 rAF 暂停，暂存气泡要等窗口重新可见才弹出。改为由 `ScreensaverSystem.reset()`（屏保结束的事件驱动路径）直接触发 flush，不依赖循环调度。

## 后续简化与序列令牌修正（2026-08-07）

本归档中 H-1 记录的是当时采用 `shown`、`onScreensaverStart` 与展示窗口计时器的加固方案，已被后续实现替代。当前代码保留 `scheduleReturnBubbles()`，用 `returnBubbleSequenceId` 让屏保打断前的旧定时器失效；`pendingReturnBubble` 仅在当前序列的两条回调都成功触发后才释放。该令牌也覆盖了“屏保很快结束、flush 已调度补发，但旧的第二条回调仍待执行”的交错情形，避免重复展示。

### 行为变更说明

- 屏保不活跃且序列在途时，`pendingReturnBubble` 从「始终为 null」变为「保留至当前序列两条回调均成功触发」，这是保证补发数据不丢失的必要代价；
- `ScreensaverSystem` 保留 `onScreensaverEnd` 回调；`OfflineReturnSystem.returnBubbleSequenceId` 使补发后仍待执行的旧回调成为无操作。

### 相关测试

- `test/offlineReturnSystem.test.js`：覆盖「触发时重检重新暂存」「短暂屏保结束后旧回调失效」「flush 无暂存无操作」等用例；
- 全套 `npm test` 通过。

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `screensaverSystem` 在 `OfflineReturnSystem` 构造时尚未创建 | Low | `isScreensaverActive` 是闭包，运行时才求值；且两者都在同一 `async` 函数内顺序创建 |
| 屏保持续播放很久时气泡大幅延迟 | Low | 合理行为 — 用户此时不在看；且气泡暂存只保留最新一份 |
| 屏保被 cancel（静默取消）时无 runningBack 动画 | None | `reset()` 事件钩子不区分退出方式，cancel 同样触发 flush |
| 屏保在序列展示期间重复开始 | Low | `returnBubbleSequenceId` 会使旧回调失效；当前暂存序列在屏保结束后重新调度 |

## Testing Strategy

用 `withStubbedSetTimeout` 模式测试 `OfflineReturnSystem` 的暂存/flush 行为。验证：
1. 屏保活跃时 `handleOfflineReturn()` 不调度 setTimeout，暂存参数非空
2. `flushPendingReturnBubble()` 调度 setTimeout，暂存清空
3. 原有测试（屏保不活跃场景）全部不回归

手动验证 macOS 开盖场景（需 ≥2 小时离线才能触发时辰气泡）。

## Success Criteria

- 屏保活跃时离线回归气泡不弹出，暂存到屏保结束
- 屏保结束后暂存气泡自动弹出（1.5s/3s 延迟）
- 非屏保场景行为完全不变
- `npm test` 全部通过
- 无新依赖、无主进程改动
