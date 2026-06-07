# ADR-004: 拖曳实现方案

## Status
Accepted

## Date
2026-04-28

## Context
初始版本中，宠物角色无法被用户拖曳移动。原因是 `PetRenderer.js` 只实现了 `mouseenter`/`mouseleave` 切换鼠标穿透，但完全缺少拖曳相关的事件处理链。

拖曳在桌面宠物应用中的特殊难点：
1. 透明窗口全局穿透模式下，`mousemove` 和 `mouseup` 事件可能在鼠标移出角色元素后丢失
2. 拖曳期间移动系统不能覆盖用户设定的位置
3. 拖曳结束后需要恢复鼠标穿透状态

## Decision
在 `PetRenderer.createPetElement()` 中实现完整的拖曳链：

1. `mousedown`（在角色元素上）：
   - 设置 `pet.isDragging = true`
   - 记录鼠标与角色左上角的偏移量
   - 锁定 `setIgnoreMouseEvents(false)` 防止穿透
   - 将角色状态切换为 `idle` 并暂停走动

2. `mousemove`（绑定在 `document` 上，而非角色元素上）：
   - 仅当 `pet.isDragging` 时更新 `pet.x` / `pet.y`
   - 绑定在 `document` 上确保鼠标移出角色范围后仍能追踪

3. `mouseup`（绑定在 `document` 上）：
   - 设置 `pet.isDragging = false`
   - 延迟 100ms 后恢复 `setIgnoreMouseEvents(true, { forward: true })`
   - 重置 `pet.idleTimer` 使角色在放下后稍作停留再开始走动

同时在 `MovementSystem.update()` 顶部增加守卫：
```javascript
if (pet.isDragging || pet.isBusy()) return;
```

## Alternatives Considered
### HTML5 Drag and Drop API
- Pros: 浏览器原生支持
- Cons: 会显示拖曳幽灵图像，触发 `dragstart` 后原元素不可控，不适合实时位置更新
- Rejected: 需要的是实时位置跟随，不是文件拖放语义

### 使用 CSS `transform` 而非 `left`/`top`
- Pros: GPU 加速，理论性能更好
- Cons: 碰撞检测依赖 `pet.x`/`pet.y` 数值，用 `transform` 需要额外解析
- Rejected: `left`/`top` 在当前规模下性能足够，且代码更直观

## Consequences
- `Pet` 类新增 `isDragging` 属性
- 每个角色在 `document` 上注册了 `mousemove` 和 `mouseup` 监听器（共 4 个）
- 未来如果角色数量增加，需要考虑事件监听器的管理和清理
