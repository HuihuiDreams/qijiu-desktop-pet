# ADR-022: 多显示器支持边界

## 状态
Accepted

## 日期
2026-05-12

## 背景
桌宠应用使用一个透明的 Electron 窗口作为移动舞台。多显示器支持需要同时解决两个层面的问题：

- 主窗口必须覆盖完整的虚拟桌面，让小人可以被拖曳或自动行走到副屏。
- 移动系统必须避开不可见坐标空洞、任务栏占用区域、以及显示器右边和下边的外侧边缘。
- 在 Windows 混合 DPI 布局中，Electron `screen.getAllDisplays()` 返回的是 DIP 坐标，并且每个显示器都有自己的 `scaleFactor`。

用户实际观察到的布局里，主屏 `scaleFactor` 为 `1.5`，副屏 `scaleFactor` 为 `1`。这类布局下，如果直接把 Electron 的 `bounds` / `workArea` 当成 renderer 里的 CSS 坐标，会出现一串相关问题：

- 小人可以走到副屏，但会从副屏右边缘或下边缘继续走到看不见的位置。
- 小人走到副屏后，视觉大小发生变化。
- 自定义右键菜单在副屏上的视觉大小也发生变化。
- 喂食、修炼等灵力效果的大小和位置需要跟随小人的视觉缩放，否则会出现尺寸正确但中心偏移的问题。

这些问题不是单纯的移动 clamp 问题，而是三套坐标概念混在一起造成的：

- Electron 显示器 `bounds` / `workArea` 的 DIP 坐标。
- 一个跨多屏透明窗口内的 renderer CSS 坐标。
- 不同显示器缩放比例下的物理视觉大小。

## 决策
采用一条统一的多显示器坐标和视觉缩放管线：

1. 主 Electron 窗口继续通过 `getVirtualDisplayBounds(screen.getAllDisplays())` 覆盖完整虚拟桌面。
2. `displayBounds.js` 负责从每个显示器的 `workArea` 生成可行走区域，并先裁剪到该显示器的 `bounds` 内。
3. `getWalkAreasRelativeToBounds(displays, windowBounds, windowScaleFactor)` 将每个显示器工作区转换成主窗口内的相对坐标。
4. 每个 `walkArea` 附带 `scaleRatio`：

   ```text
   display.scaleFactor / windowScaleFactor
   ```

5. `MovementSystem.normalizeWalkAreas()` 必须保留 `scaleRatio`，不能只保留 `{ x, y, width, height }`。
6. 移动系统基于这些标准化后的 `walkAreas` 做随机目标选择、旧目标修复、跨屏桥接、以及右/下边缘 clamp。
7. 渲染层使用同一份 `scaleRatio` 保持物理视觉大小一致：
   - `PetRenderer` 根据小人所在显示器缩放小人 DOM。
   - `ContextMenu` 根据右键位置所在显示器缩放自定义菜单。
   - 灵力光环和粒子效果根据小人或互动中心所在显示器缩放。
8. 因为小人 DOM 使用 `transform-origin: top left`，灵力效果定位必须使用缩放后的视觉中心，而不是未缩放逻辑中心：

   ```text
   pet.x + (pet.size * visualScale) / 2
   pet.y + (pet.size * visualScale) / 2
   ```

9. 暴露 `window.__DEBUG_SCREEN()` 作为运行时调试入口，返回原始显示器信息、`windowScaleFactor`、`devicePixelRatio`、以及移动系统实际使用的 `walkAreas`。

## 备选方案

### 直接把 Electron DIP 坐标当作 renderer CSS 坐标

- 优点：实现简单，在所有显示器缩放一致时看起来可用。
- 缺点：混合 DPI 环境下会算错副屏宽高和可见边界，也会导致视觉尺寸不一致。
- 结论：拒绝。该方案正是副屏右/下边缘越界和视觉大小变化的根因。

### 只在 `MovementSystem` 内加强 clamp

- 优点：改动范围小，移动系统内部即可处理部分旧目标和越界目标。
- 缺点：如果源头的显示器坐标已经错了，移动系统只能在错误边界内 clamp，无法修复视觉缩放。
- 结论：拒绝作为完整方案。保留移动系统防线，但必须配合主进程坐标转换。

### 每个显示器创建一个透明窗口

- 优点：每个窗口可以天然使用所在显示器的缩放和边界。
- 缺点：拖拽跨屏、窗口置顶、点击穿透、状态保存、跨屏行走和互动都会显著复杂化。
- 结论：暂不采用。当前单窗口模型在显式坐标转换后更简单、更可控。

### 只修移动边界，不修视觉缩放

- 优点：变更更小。
- 缺点：小人、右键菜单、灵力效果在副屏上的视觉大小不一致，影响核心体验。
- 结论：拒绝。桌宠的核心体验依赖跨屏后仍然看起来像同一个小人。

## 影响

- `walkAreas` 现在是富对象，至少包含 `{ x, y, width, height, scaleRatio }`。
- 后续任何围绕小人定位的视觉元素，都应复用同一套显示器 scale 逻辑，不应直接写 `pet.x + pet.size / 2`。
- 单元测试需要覆盖：
  - 虚拟桌面边界计算。
  - `workArea` 裁剪到 `bounds`。
  - 混合 DPI 下的 `scaleRatio` 转换。
  - `MovementSystem` 标准化后仍保留 `scaleRatio`。
  - 旧目标修复和副屏右/下边缘 clamp。
  - 灵力光环大小和视觉中心对齐。
- 现场排查多屏问题时，优先在 DevTools 中查看：

  ```js
  window.__DEBUG_SCREEN()
  window.__DEBUG_PETS.yueqi
  window.__DEBUG_PETS.shenjiu
  ```

## 实现备注

- `main.js` 通过 `screen-info` 向 renderer 发送 `walkAreas`、`windowScaleFactor` 和原始显示器诊断信息。
- `displayBounds.js` 负责显示器边界转换，保证这部分逻辑可以脱离 Electron 做单元测试。
- `MovementSystem` 在 `normalizeWalkAreas()` 中保留 `scaleRatio`，因为 UI 视觉缩放依赖和移动系统一致的显示器区域判断。
- `PetRenderer` 使用 `transform-origin: top left` 缩放小人，因此所有基于小人中心的效果都必须使用缩放后的视觉中心。
- `ContextMenu` 使用 CSS 变量 `--display-scale`，让菜单常态和 reveal 动画保持同一视觉比例。
