# ADR-006: 状态持久化与离线收益/衰减机制 (State Persistence & Offline Decay)

## 状态 (Status)
Accepted

## 日期 (Date)
2026-04-28

## 背景 (Context)
作为一个常驻桌面的养成类应用，用户会频繁关闭和开启程序。我们需要一种方式来保存宠物的数值（好感、饱腹、灵力、心境）和屏幕位置，并且在用户重新打开应用时，能够体现出“时间流逝”的影响（例如：关机一整天后，宠物应该变得很饿）。

## 决策 (Decision)
1. **持久化方案**：使用 `electron-store` 库在主进程中管理 JSON 格式的本地存档。通过 IPC 将数据传递给渲染进程。
2. **自动存档**：在渲染进程中，由 `TimeSystem` 每 60 秒触发一次自动保存。
3. **离线处理逻辑**：
   - 在存档中记录 `lastSavedTime`。
   - 应用启动时，读取存档并计算 `currentTime - lastSavedTime`（离线总时长）。
   - 将此时间段传入 `NurtureSystem.applyOfflineDecay()`。
   - 按 `CONFIG.DECAY_INTERVAL`（目前为 5 分钟）为单位，分步执行衰减逻辑。

## 替代方案 (Alternatives Considered)
- **Web LocalStorage**: 无法跨会话稳定保持大量数据，且主进程无法直接访问。
- **SQLite**: 对于如此小规模的配置和数值，SQLite 过于沉重且配置复杂。

## 影响 (Consequences)
- **优点**：实现了真实的养成感，用户离开后宠物依然在“变饿/变累”。
- **风险**：如果用户长时间（如一个月）不打开应用，回来时数值可能会全部归零。目前通过 `clampStat` 保证数值最低为 0，不会出现负数。
