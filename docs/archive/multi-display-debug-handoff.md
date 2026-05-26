# 多显示器移动调试交接文档 (Multi-Display Movement Debug Handoff)

## 当前状态 (Status)

进行中。多显示器移动功能已部分工作，但当前实现仍存在一个已知问题：宠物在副显示器上仍可能会移动到不可见的区域。

## 当前已知行为 (Current Known Behavior)

- 宠物现在可以被拖拽到副显示器上。
- 宠物现在可以自动从副显示器走回主显示器。
- 宠物仍可能在副显示器上走到不可见区域。
- 用户目前没有简单易用的应用内手段来查看宠物的实时坐标。

## 用户观察到的显示器布局 (User's Observed Display Layout)

来自开发过程中的 Windows / Electron 诊断数据：

- 主显示器缩放因子（scale factor）：`1.5`
- 副显示器缩放因子（scale factor）：`1`
- 主透明窗口已成功跨屏放大，超出了主显示器范围。
- 观察到的一组 `createWindow bounds` 结果：

```text
requested: { x: 0, y: 0, width: 3640, height: 1920 }
actual:    { x: 0, y: 0, width: 3640, height: 1920 }
content:   { x: 0, y: 0, width: 3640, height: 1920 }
```

早期的 Windows 屏幕数据也显示，主显示器为 `2560x1440`，副显示器为 `1080x1920`，具有不同的缩放因子。下一次调试不应假设两个显示器共享相同的缩放因子或像素坐标系统。

## 目前已修改的文件 (Files Changed So Far)

### `README.md` 与 `readme.txt`

更新了面向用户的文案，将“小人只能在主屏范围内活动”改为支持多显示器虚拟桌面的描述。

### `main.js`

主宠物窗口相关修改：

- `sendScreenInfo()` 现在除了发送窗口宽高 `width` 和 `height` 外，还会发送 `walkAreas`（可行走区域列表）。
- `walkAreas` 是利用 `screen.getAllDisplays()` 中的 `display.workArea || display.bounds` 衍生而来的。
- 显示器的可用工作区（work areas）被转换为相对于主宠物窗口左上角的坐标。
- 主宠物窗口属性新增了：
  - `resizable: true`
  - `enableLargerThanScreen: true`
- 创建主窗口后，代码调用：
  - `mainWindow.setMinimumSize(width, height)`
  - `mainWindow.setMaximumSize(width, height)`
  - `mainWindow.setBounds({ x, y, width, height })`
- `fitWindowToAllDisplays()` 也会在发送屏幕信息前重新设置最小尺寸、最大尺寸和边界。

这些改动修复了之前“主显示器边缘存在隐形墙”的问题。

### `src/app.js`

- `onScreenInfo(info)` 现在会将 `info.walkAreas` 传入 `movementSystem.setScreenSize(...)`。
- `keepPetReachable(pet)` 现在改用调用 `movementSystem.clampPetToWalkAreas(pet)`。
- 重置位置、保存和加载流程中会调用 `pets.forEach(keepPetReachable)`。
- `PetRenderer` 构造时传入了 `keepPetReachable` 回调，使得拖拽释放和自动移动能够共享相同的边界修正逻辑。

### `src/pet/PetRenderer.js`

- 构造函数现在接收可选的 `keepPetReachable` 回调。
- 拖拽释放事件在回调可用时会调用它。

### `src/systems/MovementSystem.js`

添加了多显示器可行走区域（walk-area）支持：

- `normalizeWalkAreas`
- `getFallbackWalkArea`
- `getWalkAreas`
- `clampToRange`
- `getTargetRange`
- `pickWalkArea`
- `sameArea`
- `findAreaContainingPoint`
- `findAreaContainingPet`
- `bridgeToTargetArea`
- `clampPetToWalkAreas`

具体行为改动：

- `randomTarget(pet)` 现在会从真实的显示器 `walkAreas` 中挑选目标，而不再是虚拟桌面外接矩形的全局随机坐标。
- `randomTarget(pet)` 记录了当前的 `pet.targetArea`。
- 移动算法支持桥接跨显示器之间的系统黑洞/不可见区域坐标。
- 同一屏幕内的移动会将宠物夹回（clamp）至可见的工作区域内。
- 跨屏移动时在接缝处不会立即触发 clamp，从而保证宠物可以正常从副显示器走回主显示器。

### `test/movementSystem.test.js`

新增了以下回归测试用例：

- 随机目标必须落在某个真实的可见显示器区域内。
- 能将宠物夹回（clamp）至最近的可见显示器区域内。
- 分离显示器之间存在坐标空洞时，能够正确桥接移动。
- 当旧目标在可见区域外时，能够将目标夹回。
- 能够正常从副显示器走回主显示器，在接缝处不会被夹死。

当前最新改动后的测试结果：

```text
npm test
63 tests passed
```

## 当前未解决的问题 (Current Unresolved Problem)

宠物在副显示器上仍可能移动到视觉上不可见的区域。

建议接下来的排查重点：

- Electron `display.workArea` 是以 DIP（设备独立像素）为单位的坐标，而当显示器的 `scaleFactor`（缩放因子）不同时，可见输出与 CSS 渲染坐标可能无法完美对齐。
- 副显示器可能是竖屏、不同的缩放率，或者存在当前相对坐标转换未完全捕获的偏移量。
- `pet.size` 设定为 `96`，但由于 hover 放大、投影或者雪碧图本身的空白区域，实际渲染的 Dom 或图像可能会超出设定的逻辑碰撞盒。
- 在发生屏幕改变、皮肤改变、拖拽操作或读取存档时，`targetArea` 可能会变得陈旧。
- `clampPetToWalkAreas()` 采用了最近矩形算法，但在跨屏边缘处，最邻近区域选择可能与用户的视觉预期不一致。

## 推荐的后续调试步骤 (Recommended Next Debug Steps)

1. 添加一个临时仅限开发态的坐标叠加层（overlay）或控制台日志记录器。

有用变量：

```js
window.__DEBUG_PETS.yueqi.x
window.__DEBUG_PETS.yueqi.y
window.__DEBUG_PETS.yueqi.targetX
window.__DEBUG_PETS.yueqi.targetY
window.__DEBUG_PETS.yueqi.targetArea
window.__DEBUG_PETS.shenjiu.x
window.__DEBUG_PETS.shenjiu.y
window.__DEBUG_PETS.shenjiu.targetX
window.__DEBUG_PETS.shenjiu.targetY
window.__DEBUG_PETS.shenjiu.targetArea
```

同时暴露或打印：

```js
movementSystem.getWalkAreas()
window.innerWidth
window.innerHeight
```

2. 如果需要，临时重新加入 `main.js` 中的详细诊断日志：

```js
console.log('screen-info', JSON.stringify({
  windowBounds: mainWindow.getBounds(),
  contentBounds: mainWindow.getContentBounds(),
  displays: screen.getAllDisplays().map((display) => ({
    id: display.id,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    rotation: display.rotation,
    internal: display.internal,
  })),
  walkAreas,
}, null, 2));
```

3. 重现不可见问题，并记录：
   - 哪一只宠物消失了。
   - 它的 `x`、`y`、`targetX`、`targetY` 和 `targetArea`。
   - 当前的 `walkAreas`。
   - 宠物当时的状态（行走、发呆、正在被拖拽，还是在互动中）。

4. 如果坐标都在 `walkAreas` 内部，但宠物依然不可见，应着重检查显示屏的缩放转换或 CSS 渲染边界。
5. 如果坐标确实跑到了 `walkAreas` 外部，则修复 `MovementSystem` 的坐标 clamp 和目标选择逻辑。
6. 如果宠物仅部分可见，或者在副显示器上显得大小不对，检查 `display.scaleFactor` 并考虑按显示器来归一化逻辑宠物大小。

## 重要注意事项 (Important Caution)

请勿盲目回退多显示器的窗口改动，它们修复了之前的“主屏边缘隐形墙”问题：

- 主窗口的实际 boundaries 已经与请求值匹配。
- 拖拽到副显示器的功能已经可以正常工作。
- 修复接缝 clamp 逻辑后，宠物已经能够从副屏走回主屏。

目前遗留的问题仅仅是宠物在副显示器内的坐标正确性，而不是主窗口覆盖副显示器的能力。