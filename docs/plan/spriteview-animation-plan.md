# 引入 SpriteView 精灵视图系统重构动画层 - 功能规划

> 状态：Completed（已完成）  
> 最后更新：2026-05-06

---

## 一、背景与决策（Context & Decision）

### 问题陈述
目前桌面宠物的视觉展示逻辑分散在两个文件中：

- `PetRenderer.js`：负责创建宠物 DOM 容器、更新位置（x, y）、管理状态 CSS 类（如 `pet--walking`）、处理鼠标事件（拖拽与点击穿透），以及管理双人互动 Overlay。
- `PetAnimations.js`：负责根据宠物当前状态返回对应 emoji，并直接切换 `.pet-body` 内的 `<img>` 或文本内容。

这种拆分存在以下问题：

1. 职责边界不清：`PetAnimations.updateDisplay()` 会直接操作 DOM，但它并不拥有宠物 DOM 容器的创建和生命周期。
2. 扩展困难：当前已有按状态切换的单图资源，后续若加入逐帧序列动画、状态转场动画或更细粒度的方向资源，需要继续扩张 `PetAnimations` 和主循环调用。
3. 性能与可维护性隐患：虽然现有逻辑已经缓存了已渲染图片和 emoji，但 `.pet-body` 的渲染策略仍分散在动画类中，不利于统一做脏标记、帧率控制和资源回退。

### 核心决策
新增 `SpriteView` 类（文件 `src/pet/SpriteView.js`），专门负责宠物身体视觉层：

- 管理 `.pet-body` 中显示的图片、emoji 或序列帧。
- 解析 `pet.sprites` 配置，并在没有 `sprites` 配置时兼容现有单图 / emoji 逻辑。
- 使用脏标记与帧计时，只在显示资源实际变化时更新 DOM。

`PetRenderer` 继续负责容器、位置、事件、CSS 状态类和 Overlay，不把拖拽、移动、窗口点击穿透等职责迁入 `SpriteView`。

### 替代方案
- 直接在 `PetAnimations` 中扩展：改动少，但会继续扩大一个已经边界模糊的类。
- 合并进 `PetRenderer`：会让 `PetRenderer` 同时管理位置、事件、Overlay、资源映射和帧动画，职责过重。
- 使用 Canvas 代替 DOM：需要重构现有 DOM 事件、Overlay、点击穿透和 CSS 动画配合，当前阶段收益不足。

### 决策影响
- 优点：职责更清楚；渐进迁移；兼容当前资源；为未来序列帧资产留出配置入口。
- 缺点：新增一个类和脚本加载项；需要补一层兼容逻辑，短期内 `PetAnimations` 可能暂时保留。

---

## 二、功能规格（spec-driven-development）

### Objective（目标）
开发并集成一个独立负责宠物身体视觉表现的组件 `SpriteView`，统一管理资源映射、帧动画驱动、脏标记渲染和现有图片 / emoji 回退。

### Scope（职责边界）

`SpriteView` 负责：

- 找到并管理宠物元素中的 `.pet-body`。
- 根据 `pet.state`、`pet.id`、`pet.image`、`pet.emoji`、`pet.isHungry()` 和 `pet.sprites` 决定当前显示资源。
- 控制序列帧播放，包括 `frames`、`fps` 和帧索引。
- 仅当显示资源变化时更新 DOM。

`SpriteView` 不负责：

- 宠物位置更新。
- 拖拽、点击穿透、右键菜单。
- `pet--walking`、`pet--hungry` 等容器级 CSS class。
- 双人互动 Overlay 和对话气泡。

### Tech Stack（技术栈）

- 原生 JavaScript（ES6+ class）
- DOM API（继续基于现有 DOM，不使用 Canvas）

### Project Structure（涉及文件）

```text
desktop-pet/
├── src/
│   ├── index.html             <- 已加载 SpriteView.js，并移除 PetAnimations.js
│   ├── app.js                 <- 已创建并调用 SpriteView
│   ├── data/
│   │   └── config.js          <- 修改：添加 sprites 配置（可选，先做兼容）
│   └── pet/
│       ├── SpriteView.js      <- 新增：负责身体视觉、帧动画、资源回退
│       ├── PetRenderer.js     <- 小改：创建稳定的 .pet-body 容器，不负责内容更新
│       └── PetAnimations.js   <- Phase 5 已删除
```

### 资源配置结构
在 `src/data/config.js` 中为角色可选定义 `sprites` 映射表：

```javascript
PET_A: {
  id: 'yueqi',
  name: '岳清源',
  nickname: '岳七',
  emoji: '🗡️',
  image: 'assets/left.png',
  sprites: {
    idle: { frames: ['assets/left.png'], fps: 1 },
    walking: { frames: ['assets/left.png'], fps: 1 },
    meditating: { frames: ['assets/left_cultivate.png'], fps: 1 },
    hungry: { frames: ['assets/left_hungry.png'], fps: 1 }
  }
}
```

后续若有多帧资源，可把任意状态扩展为：

```javascript
walking: {
  frames: ['assets/yueqi/walk_01.png', 'assets/yueqi/walk_02.png'],
  fps: 4
}
```

### 推荐接口

```javascript
class SpriteView {
  constructor(options = {}) {}
  attach(pet) {}
  update(pet, deltaMs) {}
  render(pet, resource) {}
  resolveResource(pet) {}
}
```

说明：

- `update(pet, deltaMs)` 比 `update(state, direction, dt)` 更贴合当前代码，因为资源解析需要 `pet.id`、`pet.image`、`pet.emoji` 和 `pet.isHungry()`。
- 方向翻转暂时继续由 `PetRenderer` 的 `pet--facing-left` class 控制，不放进第一版 `SpriteView`。

---

## 三、任务分解（planning-and-task-breakdown）

### 依赖图

```text
[1] 创建 SpriteView，并兼容当前图片 / emoji 逻辑
        |
        v
[2] 接入 app.js 与 index.html，替代每帧 PetAnimations.updateDisplay()
        |
        v
[3] 将 sprites 配置加入 src/data/config.js 并验证单图配置
        |
        v
[4] 用临时多帧配置验证 fps 与帧切换
        |
        v
[5] 确认无回归后，再清理或删除 PetAnimations
```

---

### Phase 1：引入 SpriteView 基础类

#### Task 1：创建 `SpriteView` 类
**Description：** 新增 `src/pet/SpriteView.js`，实现当前显示资源解析、DOM 更新缓存和基础帧计时。

**Acceptance criteria：**
- [x] `SpriteView` 提供 `attach(pet)` 与 `update(pet, deltaMs)`。
- [x] 没有 `sprites` 配置时，显示行为与当前 `PetAnimations.updateDisplay()` 保持一致。
- [x] 当前已有状态图（如 `meditating`、`hungry`、`sleeping`、`eating`、`patted`）仍能正确显示。
- [x] `.pet-body` 只在资源变化时更新 DOM。

**Dependencies：** None  
**Files:** `src/pet/SpriteView.js`  
**Estimated scope:** S

---

### Phase 2：接入现有渲染流程

#### Task 2：调整 `PetRenderer` 与 `app.js`
**Description：** 让 `PetRenderer` 只创建稳定的 `.pet-body` 容器，不再内联初始 `<img>`；在 `app.js` 中创建 `SpriteView` 并替代 `PetAnimations.updateDisplay()` 的每帧调用。

**Acceptance criteria：**
- [x] `PetRenderer.createPetElement()` 仍创建 `.pet-body`，但身体内容由 `SpriteView` 首次渲染。
- [x] `app.js` 中实例化 `SpriteView`。
- [x] 主循环中调用 `spriteView.update(yueqi, deltaMs)` 和 `spriteView.update(shenjiu, deltaMs)`。
- [x] 位置、拖拽、点击穿透、状态 CSS class、Overlay 行为不受影响。

**Dependencies：** Task 1  
**Files:** `src/pet/PetRenderer.js`, `src/app.js`  
**Estimated scope:** M

#### Task 2.1：更新脚本加载顺序
**Description：** 在 `src/index.html` 中加载 `SpriteView.js`，确保 `app.js` 使用前类已定义。

**Acceptance criteria：**
- [x] `SpriteView.js` 在 `app.js` 前加载。
- [x] `SpriteView.js` 加载后不再依赖 `PetAnimations.js`。
- [x] 后续删除 `PetAnimations.js` 时，移除对应 script 标签。

**Dependencies：** Task 1  
**Files:** `src/index.html`  
**Estimated scope:** XS

---

### Phase 3：配置化资源映射

#### Task 3：在 `src/data/config.js` 添加 `sprites` 配置
**Description：** 先用现有单图资产为一个或两个角色添加 `sprites` 配置，验证 `SpriteView` 可从配置中解析资源。

**Acceptance criteria：**
- [x] 至少一个角色配置 `sprites.idle`、`sprites.walking`、`sprites.hungry`。
- [x] 配置后显示资源优先来自 `pet.sprites`。
- [x] 未配置的状态仍回退到现有图片 / emoji 逻辑。

**Dependencies：** Task 2  
**Files:** `src/data/config.js`  
**Estimated scope:** S

---

### Phase 4：多帧动画验证

#### Task 4：用临时或正式序列帧验证 fps
**Description：** 为一个状态配置至少两个 frame，确认帧率计时和状态切换重置行为正常。

**Acceptance criteria：**
- [x] `fps` 控制正常，帧切换不会随主循环帧率漂移。
- [x] 状态变化时帧索引和计时器重置。
- [x] 暂停或隐藏桌宠时不会出现明显跳帧或异常闪烁。
- [x] 若没有正式多帧美术资源，可使用现有两张状态图做临时验证，并在文档中标明。

**Dependencies：** Task 3  
**Files:** `src/data/config.js`, `src/pet/SpriteView.js`  
**Estimated scope:** S

---

### Phase 5：清理废弃代码

#### Task 5：清理或删除 `PetAnimations`
**Description：** 确认 `SpriteView` 已覆盖当前行为后，再移除 `PetAnimations` 的运行时依赖。删除文件是最终步骤，不作为第一轮强制目标。

**Acceptance criteria：**
- [x] `app.js` 不再实例化或调用 `PetAnimations`。
- [x] 若 `SpriteView` 已内置完整回退逻辑，删除 `src/pet/PetAnimations.js`。
- [x] 已选择删除 `PetAnimations`，不再保留兼容映射工具。
- [x] `src/index.html` 中无多余脚本加载。

**Dependencies：** Task 4  
**Files:** `src/app.js`, `src/index.html`  
**Estimated scope:** XS

---

## 四、验证清单

- [x] 启动后两只宠物初始图片正常显示。
- [x] 行走、打坐、饥饿、睡觉、吃饭、摸头等状态图正常切换。
- [x] 右键菜单、拖拽、点击穿透、状态面板不受影响。
- [x] 双人互动 Overlay 仍能隐藏原宠物身体并恢复显示。
- [x] 主循环无报错，DevTools Console 无新增错误。
- [x] 配置 `sprites` 后，单图状态与多帧状态均能正常显示。

---

## 五、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| 一次性迁移导致显示或互动回归 | 高 | `SpriteView` 只接管 `.pet-body` 内容，位置、事件、Overlay 留在 `PetRenderer` |
| 配置路径写错导致资源不显示 | 中 | 明确配置文件为 `src/data/config.js`，资源路径继续以 `src/index.html` 为基准使用 `assets/...` |
| 缺少正式序列帧资产 | 中 | 第一版兼容单图；多帧验证可使用临时资源，正式美术到位后替换配置 |
| 脚本加载顺序错误 | 中 | 将 `SpriteView.js` 明确加入 `src/index.html`，并放在 `app.js` 前 |
| 方向逻辑迁移过多导致 CSS 动画回归 | 中 | 第一版方向继续交给 `PetRenderer` 的 `pet--facing-left` class |

---

## 六、开放问题（待确认 / 待落实）

- [x] 是否抛弃 Canvas 方案？是，当前维持 DOM 方案。
- [x] 配置字段命名是否使用 `sprites`，内含 `frames` 和 `fps`？是。
- [x] 是否已有正式多帧序列资产？若没有，Phase 4 使用临时帧验证。
- [x] `PetAnimations.js` 最终是删除，还是降级为兼容映射工具？建议在 Phase 4 验证后决定。

---

## 七、扩展规划：支持垂直方向行走（上下背影/正面）

基于目前已经完成的 SpriteView 架构，实现垂直方向（背影/正面）视觉呈现的逻辑非常清晰。以下是具体的代码影响分析，区分了已实现的架构支撑和待实现的功能修改：

### ✅ 已实现的架构基础（Implemented）
- **数据驱动架构**：`SpriteView` 已经实现了基于数据配置（`pet.sprites`）的序列帧渲染机制。
- **状态分离**：视觉渲染（`SpriteView`）与物理位置（`MovementSystem`）、DOM 操作（`PetRenderer`）的职责已经完全解耦。
- **翻转控制收束**：最近的优化中，通过 `PetRenderer` 施加的 CSS 水平镜像（`pet--facing-left`）已收束到正确的场景，不再干扰静态图片。

### ⏳ 待实现的修改（To Be Implemented）

#### 1. 移动逻辑判断增强 (`src/systems/MovementSystem.js`)
目前系统仅依靠 X 轴 (`dx`) 判断左右。需要引入对 Y 轴 (`dy`) 的判断，确认当前是垂直主导还是水平主导。
```javascript
// 需要增加的逻辑
if (Math.abs(dy) > Math.abs(dx)) {
  pet.direction = dy > 0 ? 'down' : 'up'; // 垂直主导
} else {
  pet.direction = dx > 0 ? 'right' : 'left'; // 水平主导
}
```

#### 2. 状态键值解析 (`src/pet/SpriteView.js`)
将 `pet.direction` 关联到行走状态的解析中，以便 SpriteView 能拉取对应的方向图片资源。
```javascript
// 需要修改 SpriteView 的 _resolveSpriteKey 方法
_resolveSpriteKey(pet) {
  if (pet.isHungry() && pet.state === 'idle') return 'hungry';
  if (pet.state === 'walking') {
    return `walking_${pet.direction}`; // 返回 walking_up, walking_down 等
  }
  return pet.state || 'idle';
}
```

#### 3. 渲染器样式防御 (`src/pet/PetRenderer.js`)
确保当小人向上或向下走时，不会附带左右行走的镜像反转 CSS 类。
```javascript
// 仅当明确向左走时才加类，否则移除（针对 up / down / right）
if (pet.direction === 'left') {
  el.classList.add('pet--facing-left');
} else {
  el.classList.remove('pet--facing-left');
}
```

#### 4. 配置与美术素材接入 (`src/data/config.js` & `assets/`)
在配置文件中将单一的 `walking` 序列帧拆分为不同方向配置，并放入准备好的背影和正面图片素材。
```javascript
sprites: {
  walking_right: { frames: ['assets/walk_right01.png', ...], fps: 4 }, // 或者直接复用 walking
  walking_left:  { frames: ['assets/walk_left01.png', ...], fps: 4 },  // 若不使用CSS镜像
  walking_up:    { frames: ['assets/walk_back01.png', ...], fps: 4 },  // 向上：背影素材
  walking_down:  { frames: ['assets/walk_front01.png', ...], fps: 4 }, // 向下：正面素材
}
```

---

*生成时间：2026-05-01 | 最后更新：2026-05-06 | 状态：Completed（基础架构），扩展规划中（垂直方向）*
