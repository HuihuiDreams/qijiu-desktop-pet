# ADR-016: 前端视觉重构与水墨仙侠美学 (Frontend Visual Redesign)

## Status
Accepted

## Date
2026-05-01

## Context
随着桌面宠物功能逻辑的逐渐完善，现有的前端界面（HTML/CSS）暴露出了视觉表达上的不足：排版平庸、颜色单调、动效生硬（如单调的弹跳和单个 Emoji 粒子）。整体设计缺乏与“修仙/仙侠”主题相契合的特色，距离具有高设计感、令人印象深刻的产品体验仍有差距。我们需要一种统一、大胆且制作精良的视觉风格，来消除“通用 AI 生成”的廉价感。

## Decision
基于 `frontend-design` 技能的设计哲学，我们在不改变底层业务逻辑的前提下，对应用的表现层进行了彻底重构，确立了**“水墨写意 (Ink-Wash Xianxia)”**的美学方向：

1. **构建专属调色板与材质体系**：
   - 弃用通用色彩，改用具有修仙意象的色卡：灵玉 (Jade)、仙金 (Gold)、丹砂 (Crimson) 和墨韵 (Ink)。
   - 引入“毛玻璃” (Glassmorphism) 材质，结合多层级阴影与内发光，赋予状态面板和右键菜单“翡翠玉牌”般的通透质感。

2. **本地化的书法排版引擎**：
   - 使用 `Ma Shan Zheng`、`ZCOOL KuaiLe` 等毛笔/手书字体作为标题展示，搭配 `Noto Serif SC` 优雅宋体作为正文。
   - 坚持纯 `local()` 字体调用，不仅免去了网络请求的延迟，且完全兼容既有的 Electron 严格安全策略 (CSP)。

3. **有机且流畅的动效 (Motion & Micro-interactions)**：
   - 废弃线性动画，全面引入 `cubic-bezier(0.34, 1.56, 0.64, 1)` 弹性缓动曲线。
   - 增加了形变动效（如行走时的 Squash & Stretch）、状态条的微光流动 (Shimmer) 渐变。
   - 重构了互动粒子系统（由单调的一个 Emoji 升级为三个具有随机位置、大小和交错延迟时间的动态粒子群）。

## Alternatives Considered
- **维持原有的实用主义 UI**：仅用常规颜色和原生字体。
  - *Rejected*：缺乏沉浸感，无法带给用户情感上的愉悦，不符合桌面宠物作为陪伴软件的情感定位。
- **引入外部 CSS 框架（如 TailwindCSS / Bootstrap）**：
  - *Rejected*：框架往往带来不可控的体积膨胀和通用的“工业感”。对于高度定制化的仙侠 UI，原生 Vanilla CSS 的 CSS Variables 提供了更精确的控制力。

## Consequences
- **极大的沉浸感与审美提升**：视觉品质达到了 Production-grade 级别，界面风格与 IP 设定高度统一。
- **动效反馈增强**：用户的每次交互（右键菜单弹出、抚摸粒子、警告状态脉冲）都有了细腻的情感回馈。
- **维护成本略微上升**：`index.css` 引入了较多复杂的 CSS Variables 和 Keyframes 动画，对后续前端开发的样式管理提出了更高的规范要求。
