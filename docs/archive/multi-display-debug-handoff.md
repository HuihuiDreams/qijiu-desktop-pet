# Multi-Display Movement Debug Handoff

## Status

In progress. Multi-display movement partially works, but the current implementation still has a known bug: pets can still move to an invisible area on the secondary display.

## Current Known Behavior

- Pets can now be dragged to the secondary display.
- Pets can now walk back from the secondary display to the primary display.
- Pets may still walk into an area on the secondary display where they are not visible.
- The user does not currently have an easy in-app way to inspect pet coordinates.

## User's Observed Display Layout

From Windows / Electron diagnostics during development:

- Primary display scale factor: `1.5`
- Secondary display scale factor: `1`
- The main transparent window successfully grew beyond the primary display.
- One observed `createWindow bounds` result:

```text
requested: { x: 0, y: 0, width: 3640, height: 1920 }
actual:    { x: 0, y: 0, width: 3640, height: 1920 }
content:   { x: 0, y: 0, width: 3640, height: 1920 }
```

Earlier Windows screen data also showed a layout where the primary display was `2560x1440` and the secondary display was `1080x1920`, with different scale factors. The next debugging pass should not assume the two displays share the same scale factor or pixel coordinate system.

## Files Changed So Far

### `README.md` and `readme.txt`

Updated user-facing wording from "pets only move on the primary display" to multi-display support wording.

### `main.js`

Main pet window changes:

- `sendScreenInfo()` now sends `walkAreas` in addition to `width` and `height`.
- `walkAreas` are derived from `screen.getAllDisplays()` using `display.workArea || display.bounds`.
- Display work areas are converted into coordinates relative to the main pet window.
- The main pet window now uses:
  - `resizable: true`
  - `enableLargerThanScreen: true`
- After creating the main window, code calls:
  - `mainWindow.setMinimumSize(width, height)`
  - `mainWindow.setMaximumSize(width, height)`
  - `mainWindow.setBounds({ x, y, width, height })`
- `fitWindowToAllDisplays()` also resets minimum size, maximum size, and bounds before sending screen info.

These changes fixed the earlier "invisible wall at the primary display edge" symptom.

### `src/app.js`

- `onScreenInfo(info)` now passes `info.walkAreas` into `movementSystem.setScreenSize(...)`.
- `keepPetReachable(pet)` now calls `movementSystem.clampPetToWalkAreas(pet)`.
- Reset-position and save-load flows call `pets.forEach(keepPetReachable)`.
- `PetRenderer` is constructed with `keepPetReachable` so drag release and automatic movement share the same boundary correction.

### `src/pet/PetRenderer.js`

- Constructor accepts an optional `keepPetReachable` callback.
- Drag release uses the callback when available.

### `src/systems/MovementSystem.js`

Added multi-display walk-area support:

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

Behavior changes:

- `randomTarget(pet)` picks a target from real display `walkAreas` rather than the virtual desktop bounding rectangle.
- `randomTarget(pet)` stores `pet.targetArea`.
- Movement can bridge invisible coordinate gaps between displays.
- Same-display movement clamps the pet back into the visible work area.
- Cross-display movement does not immediately clamp at the seam, so pets can walk back from secondary display to primary display.

### `test/movementSystem.test.js`

Added regression tests for:

- Random targets staying inside visible display areas.
- Clamping pets back to a visible display.
- Bridging an invisible coordinate gap between separated displays.
- Clamping stale out-of-area targets.
- Walking from secondary display back to primary display without being clamped at the seam.

Current test result after the latest changes:

```text
npm test
63 tests passed
```

## Current Unresolved Problem

Pets can still walk to a visually invisible area on the secondary display.

Most likely causes to investigate next:

- Electron `display.workArea` is in DIP coordinates, while visible output and CSS rendering may not line up cleanly across displays with different `scaleFactor` values.
- The secondary display may be portrait, scaled differently, or offset in a way the current relative-coordinate conversion does not fully capture.
- `pet.size` is `96`, but the visible sprite, animation transform, hover scale, drop shadow, or sprite image content may exceed the assumed logical body box.
- `targetArea` can become stale after display changes, skin changes, drag operations, or save/load restoration.
- `clampPetToWalkAreas()` uses the nearest rectangle, but when a pet is near a boundary between displays, nearest-area selection may not match the user's visual expectation.

## Recommended Next Debug Steps

1. Add a temporary dev-only coordinate overlay or console logger.

Useful values:

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

Also expose or log:

```js
movementSystem.getWalkAreas()
window.innerWidth
window.innerHeight
```

2. Re-add expanded `main.js` diagnostics temporarily if needed.

Suggested log:

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

3. Reproduce the invisible-area issue and capture:

- Which pet disappeared.
- Its `x`, `y`, `targetX`, `targetY`, and `targetArea`.
- The current `walkAreas`.
- Whether the pet is walking, idle, being dragged, or interacting.

4. If coordinates are inside `walkAreas` but the pet is invisible, investigate display scale conversion or CSS rendering bounds.

5. If coordinates are outside `walkAreas`, fix `MovementSystem` clamping/target selection.

6. If the pet is visible only partially or appears resized on the secondary display, inspect `display.scaleFactor` and consider normalizing logical pet size per display.

## Important Caution

Do not revert the multi-display window changes blindly. They fixed the earlier primary-screen wall:

- Main window actual bounds now match requested bounds.
- Dragging to the secondary display now works.
- Pets can walk from secondary display back to primary display after the latest seam-clamping fix.

The remaining issue appears to be coordinate correctness within the secondary display, not whether the main window can cover the secondary display.



今天主要改了这些，方便下一个 agent 接手：

README 文档
README.md
readme.txt
把“小人只能在主屏范围内活动”改成了“支持多显示器虚拟桌面/副屏”。

主窗口跨屏
main.js
改动点：

主宠物窗口改为：
resizable: true
enableLargerThanScreen: true
创建后调用：
setMinimumSize(width, height)
setMaximumSize(width, height)
setBounds({ x, y, width, height })
fitWindowToAllDisplays() 里也会重新设置 minimum/maximum size 和 bounds。
sendScreenInfo() 不再只发送 { width, height }，还发送 walkAreas。
walkAreas 来自 screen.getAllDisplays().map(display => display.workArea || display.bounds)，并转换成主窗口内相对坐标。
渲染进程接收多屏可走区域
src/app.js
改动点：

onScreenInfo(info) 里调用：
movementSystem.setScreenSize(screenWidth, screenHeight, info.walkAreas)
keepPetReachable() 改为调用：
movementSystem.clampPetToWalkAreas(pet)
重置位置、读取存档后会调用 pets.forEach(keepPetReachable)。
PetRenderer 初始化时传入 keepPetReachable。
拖拽边界
src/pet/PetRenderer.js
改动点：

构造函数新增第二参数 keepPetReachable。
拖拽结束后优先调用传入的 keepPetReachable(pet)，让拖拽和自动移动使用同一套多屏边界逻辑。
移动系统多屏逻辑
src/systems/MovementSystem.js
新增/修改内容：

构造函数支持 walkAreas。
setScreenSize(w, h, walkAreas) 支持更新多屏区域。
新增：
normalizeWalkAreas
getFallbackWalkArea
getWalkAreas
clampToRange
getTargetRange
pickWalkArea
sameArea
findAreaContainingPoint
findAreaContainingPet
bridgeToTargetArea
clampPetToWalkAreas
randomTarget(pet) 现在会从真实显示器区域中按面积加权选目标，并记录 pet.targetArea。
moveTowardTarget() 现在：
支持跨显示器移动。
如果两块屏幕之间有系统坐标空洞，会桥接到目标屏边缘。
同屏移动会夹回可见区域。
跨屏接缝处不会再被强行夹回当前屏，所以能从副屏走回主屏。
测试
test/movementSystem.test.js
新增了多屏相关测试：

随机目标必须落在某块真实显示器区域内。
小人能被夹回最近可见显示器区域。
分离显示器之间有空洞时会桥接。
旧目标在可见区域外时会被夹回。
从副屏走回主屏时不会被接缝处夹住。
当前验证：

npm test
63 tests passed
当前仍未解决的问题：

小人现在能跨屏、也能从副屏走回主屏。
但仍可能走到副屏上“看不见的地方”。
用户不知道如何获取小人坐标。
下一个 agent 建议优先加临时 debug 能力，例如在开发态暴露/打印：
window.__DEBUG_PETS.yueqi.x/y
window.__DEBUG_PETS.shenjiu.x/y
movementSystem.getWalkAreas()
当前 pet.targetX/targetY/targetArea
也建议让 main.js 临时打印展开后的 walkAreas，因为用户副屏可能有缩放/旋转/负坐标/任务栏导致 Electron workArea 和视觉区域不一致。