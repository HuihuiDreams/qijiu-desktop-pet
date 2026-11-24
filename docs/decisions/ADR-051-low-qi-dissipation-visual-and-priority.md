# ADR-051: 灵力低下「灵脉散逸」视觉效果与低状态优先级

## Status
Accepted

## Date
2026-11-24

## Context
DeskPet 的修仙养成体系包含饱腹（`hunger`）、灵力（`qi`）、心境（`mood`）与好感（`affection`）四个维度（[ADR-003](./ADR-003-xianxia-nurture-system.md)）。此前处于临界低值时，饥饿（`hunger < 25`）已有 `hungry` 待机立绘与暖橙静态外发光，心境低下（`mood < 25`）已有 `.pet-body` 透明度呼吸与微垂动画，而灵力低下（`qi < 20`，`pet.isLowQi()`）仅有 `DialogBubble.showStatWarning` 的随机状态警告台词，缺少桌面本体视觉反馈。

该效果的设计需要同时满足多条既有约束：
1. **性能边界（[ADR-012](./ADR-012-render-performance-optimization.md)、[ADR-034](./ADR-034-ui-performance-and-visual-upgrades.md)）**：禁止对 `.pet-image` 使用带动画的 `filter: drop-shadow()` 或每帧触发布局重排的样式；主渲染循环在状态未变化时应维持零 DOM 改写，且健康态不应常驻额外的合成层与节点。
2. **视觉区分与皮肤无关**：不可占用仅属于低心境的本体透明度呼吸，也不能强依赖额外 `.webp` 切图（需兼容 `default`、`birds` 及未来皮肤与 emoji 回退）。
3. **多低态叠加与缩放**：`NurtureSystem` 中低灵力会联动扣减心境，且玩家可能同时出现饥饿、低灵力与低心境；效果需自适应 `--pet-size`（50%–150%）与跨屏 `scaleRatio`，并明确「饥饿」与「灵力低下」同时存在时的主次顺序。

## Decision
1. **采用「灵脉散逸」视觉语言（纯 CSS/DOM，无额外切图依赖）**：
   - 在宠物容器 `.pet` 内、`.pet-body` 后方（`z-index: -1`，`pointer-events: none`）定义 `.pet-qi-depletion` 图层：
     - **脚下虚弱灵晕（`.pet-qi-pool`）**：平铺在角色脚底的浅紫虚线光晕，缓慢缩张明灭（`qiPoolWane`）。
     - **身侧紫烟灵缕（`.pet-qi-wisp--1..2`）**：两条沿身体左右向上飘散、拉长并消解的淡紫渐隐烟缕（`qiWispRise`）。
     - **柳叶灵芒碎屑（`.pet-qi-spark--1..3`）**：三枚尖头柳叶形碎芒垂直上浮并缩隐（`qiSparkDissipate`）。
   - 主色通过 CSS 相对颜色语法（[ADR-048](./ADR-048-modern-web-standards-adoption.md)）派生自 `--color-qi`（`#7c3aad`），宽度与飘散位移以 `--pet-size` 计算，并随 `.pet` 继承显示器 `scaleRatio`。
2. **严格执行懒挂载与纯 GPU 合成动效**：
   - `PetRenderer.update()` 通过 `_renderedLowQi` Dirty Check 控制 `.pet-qi-depletion` 的按需挂载与卸载：仅在需要展示低灵力提示的跃迁帧创建/移除节点，健康态或抑制态保持 0 额外 DOM 节点与 0 合成层开销。
   - 容器声明 `contain: layout style` 与 `pointer-events: none`（不扩张鼠标命中区域），`src/effects.css` 内全部关键帧仅动画 `transform` 与 `opacity`。
   - 打坐修炼（`.pet--meditating`）、双人互动（`.pet--interacting`）及互动/屏保隐藏 `.pet-body`（`.pet:has(> .pet-body[style*="hidden"])`）时以 `display: none` 停用动画；`@media (prefers-reduced-motion: reduce)` 下停止动画并隐藏飘散灵缕/灵芒，仅保留脚下静态虚晕。
3. **低状态视觉优先级：饥饿优先于低灵力**：
   - 与 `DialogBubble.showStatWarning` 的判断顺序（`isHungry() > isLowQi() > isLowMood()`）保持一致，`PetRenderer.update()` 计算 `showLowQi = isLowQi && !isHungry`。
   - 当角色同时饥饿与灵力低下时，优先仅展示饥饿立绘与暖橙描边，不挂载 `.pet-qi-depletion`；喂食使饱腹度恢复至 `>= 25` 后，若灵力仍 `< 20`，下一帧自动挂载「灵脉散逸」图层。低心境（`.pet--low-mood`）作用于 `.pet-body`，仍可与饥饿或低灵力独立叠加。

## Alternatives Considered
### 1. 交错双椭圆虚环 + 圆形微粒（环绕轨道构图）
- **Pros**：与 `effects.css` 中的 `.qi-aura` 椭圆光环属于同一几何家族。
- **Cons**：实际在 Electron 中渲染并截图审视后，两条交叉斜椭圆配圆点在视觉上高度像“电子绕原子核运转”，无法传达灵力枯竭、向外消散的修仙意象。
- **Rejected**：替换为脚下平置虚晕 + 向上飘散的紫烟灵缕与柳叶碎芒，消除轨道/电子联想。

### 2. 饥饿与低灵力视觉同时叠加展示
- **Pros**：玩家可同时看到饥饿和低灵力两项低值提示。
- **Cons**：实际叠加预览时，饥饿自带的暖橙外发光与 `hungry` 气泡立绘再叠上紫色灵烟/碎芒，整体桌面小人周围略显杂乱，且与 `DialogBubble.showStatWarning` 的「饥饿优先」直觉不一致。
- **Rejected**：改为与台词一致的饥饿优先，同时直接跳过 `.pet-qi-depletion` 挂载以减少饥饿期间的 DOM 与合成层开销。

### 3. 对 `.pet-image` 叠加动态 `drop-shadow` 或修改本体透明度
- **Pros**：几乎无需新增 DOM 节点。
- **Cons**：违背 [ADR-034](./ADR-034-ui-performance-and-visual-upgrades.md)（动画 `drop-shadow` 触发高频阴影重光栅化；本体透明度脉冲专属于低心境），且会与饥饿的静态 `filter: drop-shadow` 相互覆盖。
- **Rejected**。

### 4. 为全部皮肤新增 `low_qi` 专属 WebP 切图
- **Pros**：可定制表情与动作姿态。
- **Cons**：需要修改多套现有皮肤资源与 [skin-pipeline-guide.md](../skin-pipeline-guide.md) 素材契约，难以平滑覆盖第三方皮肤。
- **Rejected**。

## Consequences
- 灵力低下具备了与饥饿、低心境区分清晰、跨皮肤通用且零长任务开销的桌面视觉表现。
- 「饥饿优先于低灵力」的视觉规则与状态警告台词保持认知一致，减少双状态重合时的视觉噪音，并在喂食后无缝接续低灵力提醒。
- 后续若调整低状态阈值或优先级顺序，需同步核对 `PetRenderer.js`、`DialogBubble.js`、`test/petRenderer.test.js`、`test/lowQiEffectCss.test.js` 与 `test/reducedMotionCss.test.js`。
