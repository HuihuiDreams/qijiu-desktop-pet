# ADR-005: 游戏循环异常防护策略

## Status
Accepted

## Date
2026-04-28

## Context
v0.0.1 至 v0.0.3 期间，当两个角色走到一起触发 CP 互动时，应用会完全冻结——角色停止走动，拖曳失效，无任何互动特效。

### 根因分析
按 debugging skill 的 triage checklist 排查：

1. **Reproduce（复现）**: 将两个角色拖到一起即可 100% 复现
2. **Localize（定位）**: 问题在渲染进程的 `app.js` 游戏循环中
3. **Reduce（最小化）**: 
   - `data/dialogues.js` 未在 `index.html` 中引入（只引入了 `data/config.js`）
   - 互动触发后，`app.js` 第 156 行访问 `DIALOGUES.effects[interaction.key]`
   - `DIALOGUES` 未定义 → 抛出 `ReferenceError`
   - 异常未被捕获 → `gameLoop` 函数执行中断
   - 末尾的 `requestAnimationFrame(gameLoop)` 永远不会被调用
   - 游戏循环永久死亡 → 所有依赖每帧更新的功能（渲染、移动、拖曳视觉反馈）全部停止

这是一个**单点故障**：游戏循环中任何一行代码抛出未捕获异常，都会导致整个应用冻结。

## Decision
1. **修复直接原因**：在 `index.html` 中补充引入 `data/dialogues.js`
2. **防护性修复**：在 `gameLoop` 函数体内用 `try/catch` 包裹所有逻辑，确保 `requestAnimationFrame(gameLoop)` 始终在 `catch` 之后执行
3. 错误信息通过 `console.error` 输出到 DevTools，不会静默吞掉

```javascript
function gameLoop(currentTime) {
    const deltaMs = currentTime - lastTime;
    lastTime = currentTime;
    try {
        // ... all game logic ...
    } catch (err) {
        console.error('Game loop error:', err);
    }
    // This line ALWAYS executes, even after an error
    requestAnimationFrame(gameLoop);
}
```

## Alternatives Considered

### 不加 try/catch，只修复 dialogues.js 引入
- Pros: 代码更简洁
- Cons: 下一个类似的 bug 会再次冻结整个应用
- Rejected: 游戏循环是整个应用的心跳，必须有防护

### 使用 window.onerror 全局错误处理
- Pros: 不需要改游戏循环代码
- Cons: 全局处理器无法阻止当前调用栈的中断，`requestAnimationFrame` 仍然不会执行
- Rejected: 无法解决核心问题

## Consequences
- 游戏循环不会再因为单个错误而永久冻结
- 开发阶段可以通过 DevTools Console 看到所有游戏循环中的错误
- 需要注意：try/catch 可能掩盖 bug，开发时应关注 Console 中的错误输出
