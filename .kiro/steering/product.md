---
inclusion: always
---

# 产品概述

好兆头桌宠(Good Omens Desktop Pet,仓库名 qijiu-desktop-pet):一个基于 Electron 的桌面宠物,角色为 Crowley 与 Aziraphale。支持 macOS 与 Windows,界面与文档含中文、英文、日文三种语言。

- 术语表:`docs/GLOSSARY.md`(按需阅读)
- 目录与模块说明:`docs/structure.md`(按需阅读)
- 架构决策记录(ADR):`docs/decisions/`
- 进行中的计划:`docs/plan/*.md`

# 工作方式

- 先说明假设和取舍再动手。游戏逻辑、公式或缩放行为不明确时先提问。
- 满足需求的前提下选最简单的方案,不做推测性抽象,不引入注册表式的面向对象结构。
- 只改必要的行,沿用原生 JavaScript 与标准 CSS 的现有风格。清理自己改动产生的无用代码,不碰无关代码。
- 多步骤任务一次只解决一个问题。每个原子修复完成后验证并更新 `test/` 下对应的单元测试,再进入下一步。
