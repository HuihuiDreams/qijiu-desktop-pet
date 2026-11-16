---
inclusion: fileMatch
fileMatchPattern: '{displayBounds.js,displayFit.js,main.js,src/app.js,src/pet/**,src/ui/**,src/main/**}'
---

# 多显示器与 DPI

- 坐标换算统一使用 `displayBounds.js`。
- 窗口重新贴合与防抖逻辑保留在 `displayFit.js`。
- Electron `screen` 事件合并与最小/最大尺寸约束桥接要放在一起维护。
- 仅当主透明窗口已稳定到目标虚拟桌面边界后,才向渲染进程发送 `screen-info`。
- 将 `scaleRatio` 应用到 `PetRenderer`、`ContextMenu` 与各类特效,保证不同屏幕上的物理尺寸一致。
