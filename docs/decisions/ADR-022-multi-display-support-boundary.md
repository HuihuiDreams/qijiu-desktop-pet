# ADR-022: 多显示器支持边界

## 状态
Accepted

## 日期
2026-05-12

## 更新日期
2026-05-26

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

2026-05-26 的 macOS 多屏迭代引入了一个平台差异：macOS 下跨多个显示器铺一个超大透明窗口时，窗口可见性、点击穿透和跨屏拖拽的表现更容易受系统窗口管理策略影响。相比继续依赖单个窗口覆盖完整虚拟桌面，macOS 更适合让主窗口只覆盖当前宠物所在的显示器，并在需要跨屏时迁移整个窗口。

## 决策
采用一条统一的多显示器坐标和视觉缩放管线：

1. 主 Electron 窗口继续通过 `getVirtualDisplayBounds(screen.getAllDisplays())` 覆盖完整虚拟桌面。
2. 主窗口在适配显示器变化时同步设置 `minimumSize`、`maximumSize` 和 `bounds`，避免透明窗口被 Windows 或 Electron 自动收缩回主屏。
3. `displayBounds.js` 负责从每个显示器的 `workArea` 生成可行走区域，并先裁剪到该显示器的 `bounds` 内。
4. `getWalkAreasRelativeToBounds(displays, windowBounds, windowScaleFactor)` 将每个显示器工作区转换成主窗口内的相对坐标。
5. `windowScaleFactor` 取自主窗口左上角附近的显示器；当前单透明窗口模型以这个显示器作为 renderer 坐标基准。
6. 每个 `walkArea` 附带 `scaleRatio`：

   ```text
   display.scaleFactor / windowScaleFactor
   ```

7. `MovementSystem.normalizeWalkAreas()` 必须保留 `scaleRatio`，不能只保留 `{ x, y, width, height }`。
8. 移动系统基于这些标准化后的 `walkAreas` 做随机目标选择、旧目标修复、跨屏桥接、以及右/下边缘 clamp。
9. 渲染层使用同一份 `scaleRatio` 保持物理视觉大小一致：
   - `PetRenderer` 根据小人所在显示器缩放小人 DOM。
   - `ContextMenu` 根据右键位置所在显示器缩放自定义菜单。
   - 灵力光环和粒子效果根据小人或互动中心所在显示器缩放。
10. 因为小人 DOM 使用 `transform-origin: top left`，灵力效果定位必须使用缩放后的视觉中心，而不是未缩放逻辑中心：

   ```text
   pet.x + (pet.size * visualScale) / 2
   pet.y + (pet.size * visualScale) / 2
   ```

11. 暴露 `window.__DEBUG_SCREEN()` 作为运行时调试入口，返回原始显示器信息、`windowScaleFactor`、`devicePixelRatio`、窗口尺寸、以及移动系统实际使用的 `walkAreas`。

### macOS 平台例外：单屏窗口迁移模式

macOS 不再沿用“主窗口覆盖完整虚拟桌面”的运行时策略，而采用“当前显示器单窗口 + 跨屏迁移”：

1. `currentPetDisplay` 记录当前桌宠窗口所在显示器。
2. `getDesktopWindowBounds()` 在 macOS 下返回 `currentPetDisplay.bounds`，主窗口只覆盖当前显示器。
3. `fitWindowToAllDisplays()` 在显示器新增、移除或参数变化后校正 `currentPetDisplay`，如果原显示器已不存在则回退到主显示器。
4. `displayBounds.findAdjacentDisplay()` 根据显示器 `bounds` 的方向、重叠量和小间隙容忍度寻找上下左右相邻显示器。
5. `screen-info` 在 macOS 下额外发送 `adjacentDisplays`，让 renderer 知道当前屏幕的四个边缘是否能迁移。
6. 桌宠自动行走到屏幕边缘并且该方向存在相邻显示器时，renderer 通过 IPC 请求窗口迁移。
7. 拖拽桌宠时，主进程轮询鼠标所在显示器；如果鼠标跨到其他显示器，则迁移主窗口。
8. `migrateWindowToDisplay()` 更新 `currentPetDisplay`、调整主窗口 bounds，并向 renderer 发送 `window-migrated`。
9. renderer 收到 `window-migrated` 后按窗口原点变化调整宠物当前坐标和目标坐标，保持跨屏迁移后的相对位置连续。
10. 托盘菜单在 macOS 多屏环境下提供“切换屏幕”子菜单，可手动迁移到指定显示器；显示器热插拔或参数变化后必须同步刷新菜单，避免使用过期显示器列表。

这个 macOS 方案仍然复用 `walkAreas` 和可达性修正，但每次只把当前显示器内的可见工作区暴露给移动系统。它是对原“跨屏单窗口”方案的平台化替换，而不是第二套完全独立的移动系统。

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
- 结论：Windows/Linux 暂不采用。macOS 也没有采用“每屏一个窗口”，而是保留单个主窗口，但让它一次只覆盖当前显示器，并在跨屏时迁移到目标显示器。

### macOS 继续使用跨虚拟桌面超大透明窗口

- 优点：和 Windows/Linux 的实现模型一致，跨屏移动不需要迁移窗口。
- 缺点：macOS 下超大透明窗口跨显示器时，窗口管理、可见性、点击穿透和拖拽跨屏的表现更不稳定；问题会集中在平台窗口边界，而不是移动系统本身。
- 结论：拒绝。macOS 改用单屏窗口迁移模式，将跨屏问题收敛为明确的窗口迁移事件。

### 使用物理像素坐标重建整套移动系统

- 优点：概念上能绕开 Electron DIP 与 CSS 坐标的部分歧义。
- 缺点：renderer 事件、DOM 定位、CSS transform 和 Electron IPC 仍会回到 CSS 坐标；需要在更多边界上来回转换，错误面更大。
- 结论：拒绝。移动和渲染都继续使用 renderer 坐标，只在主进程显示器边界输入处做一次显式转换。

### 只修移动边界，不修视觉缩放

- 优点：变更更小。
- 缺点：小人、右键菜单、灵力效果在副屏上的视觉大小不一致，影响核心体验。
- 结论：拒绝。桌宠的核心体验依赖跨屏后仍然看起来像同一个小人。

## 影响

- `walkAreas` 现在是富对象，至少包含 `{ x, y, width, height, scaleRatio }`。
- macOS 下 `walkAreas` 只代表当前显示器内可行走区域；跨屏通过窗口迁移完成，而不是在同一个 renderer 坐标系中穿越多个显示器区域。
- macOS 下 `screen-info.adjacentDisplays` 是边缘迁移的能力声明，renderer 只能在对应方向存在相邻显示器时请求迁移。
- 后续任何围绕小人定位的视觉元素，都应复用同一套显示器 scale 逻辑，不应直接写 `pet.x + pet.size / 2`。
- 跨屏自动行走允许在显示器之间的不可见坐标空洞上做桥接；同屏移动和到达目标后仍必须 clamp 回可见工作区。
- 拖拽释放、重置位置、读取存档和屏幕信息变化后，都应调用同一套可达性修正，避免遗留坐标停在不可见区域。
- 单元测试需要覆盖：
  - 虚拟桌面边界计算。
  - `workArea` 裁剪到 `bounds`。
  - 混合 DPI 下的 `scaleRatio` 转换。
  - `MovementSystem` 标准化后仍保留 `scaleRatio`。
  - 旧目标修复和副屏右/下边缘 clamp。
  - 相邻显示器识别，包括左/右/上/下方向、负坐标、小间隙、无重叠和非法输入。
  - 灵力光环大小和视觉中心对齐。
- 现场排查多屏问题时，优先在 DevTools 中查看：

  ```js
  window.__DEBUG_SCREEN()
  window.__DEBUG_PETS.yueqi
  window.__DEBUG_PETS.shenjiu
  ```

## 实现备注

- `main.js` 通过 `screen-info` 向 renderer 发送 `width`、`height`、`walkAreas`、`windowScaleFactor` 和原始显示器诊断信息。
- `main.js` 在 `display-added`、`display-removed` 和 `display-metrics-changed` 后重新适配窗口和屏幕信息；macOS 下还要刷新托盘菜单中的屏幕列表。
- macOS 下 `main.js` 通过 `request-window-migration`、`drag-started`、`drag-ended` 和 `window-migrated` IPC 协调窗口迁移。
- `displayBounds.js` 负责显示器边界转换，保证这部分逻辑可以脱离 Electron 做单元测试。
- `displayBounds.js` 同时负责相邻显示器查找，供 macOS 边缘迁移和托盘屏幕切换逻辑复用。
- `MovementSystem` 在 `normalizeWalkAreas()` 中保留 `scaleRatio`，因为 UI 视觉缩放依赖和移动系统一致的显示器区域判断。
- `PetRenderer` 使用 `transform-origin: top left` 缩放小人，因此所有基于小人中心的效果都必须使用缩放后的视觉中心。
- `ContextMenu` 使用 CSS 变量 `--display-scale`，让菜单常态和 reveal 动画保持同一视觉比例。

## 已知边界

- Windows/Linux 当前模型仍以一个跨屏透明窗口承载所有宠物和 UI。它依赖 Electron 在目标 Windows 布局下允许 `enableLargerThanScreen` 和固定窗口 bounds 生效。
- macOS 当前模型以一个单屏透明窗口承载所有宠物和 UI。桌宠不能在同一窗口坐标系中同时分布在多个显示器上；跨屏时所有宠物会随主窗口一起迁移。
- `scaleRatio` 解决的是混合 DPI 下的视觉比例和可见区域换算，不代表每个显示器都有独立 renderer 或独立 `devicePixelRatio`。
- macOS 单屏迁移依赖相邻显示器之间存在水平或垂直重叠；仅对角相邻、没有重叠的显示器布局不会被当作可直接迁移的相邻屏幕。
- 如果现场仍出现副屏不可见区域，需要优先比较 `window.__DEBUG_SCREEN()` 中的 `displays`、`walkAreas`、`movementWalkAreas` 与宠物坐标，而不是先改随机移动逻辑。
