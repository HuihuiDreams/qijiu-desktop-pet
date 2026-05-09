# ADR-002: 鼠标穿透与交互区域切换策略

## Status
Accepted

## Date
2026-04-28

## Context
桌面宠物应用创建了一个覆盖全屏的透明窗口。面临的核心矛盾是：
- 透明区域必须让鼠标事件穿透到桌面（用户能正常使用电脑）
- 角色本体、右键菜单、状态面板必须能接收鼠标事件

Electron 提供了 `BrowserWindow.setIgnoreMouseEvents(ignore, options)` API。`{ forward: true }` 选项允许在穿透模式下仍然接收 `mousemove` 事件，使得我们可以检测鼠标是否进入了角色区域。

## Decision
采用"动态切换"策略：

1. **默认状态**: `setIgnoreMouseEvents(true, { forward: true })` — 全窗口鼠标穿透
2. **鼠标进入角色/菜单/面板**: `setIgnoreMouseEvents(false)` — 解除穿透
3. **鼠标离开交互区域**: 恢复穿透（但需检查是否有菜单/面板打开）

关键守卫条件（在 `mouseleave` 中）：
```javascript
const menuOpen = !document.getElementById('context-menu').classList.contains('hidden');
const panelOpen = !document.getElementById('status-panel').classList.contains('hidden');
if (!pet.isDragging && !menuOpen && !panelOpen) {
  window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
}
```

## Alternatives Considered

### 多窗口方案（每个角色一个小窗口）
- Pros: 天然不需要全屏穿透，每个窗口只包含角色
- Cons: 两个独立窗口之间无法做碰撞检测（不知道对方坐标），需要 IPC 通信
- Rejected: 增加架构复杂度，碰撞检测延迟不可控

### CSS `pointer-events` 方案（不切换 Electron API）
- Pros: 纯前端实现，不需要 IPC
- Cons: `pointer-events: none` 只能阻止网页内的事件传播，不能让事件穿透到桌面
- Rejected: 无法实现真正的桌面穿透

## Consequences
- 所有新增的可交互 UI 元素（菜单、面板、对话框）都必须在 `mouseenter` 时调用 `setIgnoreMouseEvents(false)`，在关闭/隐藏时恢复穿透
- `mouseleave` 守卫条件需要随 UI 元素增加而更新
- 拖曳期间必须锁定非穿透状态直到 `mouseup`
