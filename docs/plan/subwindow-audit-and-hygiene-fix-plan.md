# 子窗口激活防闪烁、行为测试补全与文档基线同步实施计划

> 针对代码审核发现的假测试、窗口闪现隐患、层级防遮挡、文档滞后及依赖 engines 缺失问题进行系统性修复，划分为三个阶段并分别形成三个原子提交。

---

## 阶段规划与原子提交分解

### 阶段一：子窗口激活防闪烁、焦点节制与真实行为测试
- [x] 1.1 为各窗口模块（`SkinSelectorWindow.js`、`PetScaleWindow.js`、`StatusWindow.js`、`CitySettingWindow.js`、`PomodoroWindow.js`、`PetWindow.js`）的 `setVisibleOnAllWorkspaces` 添加 `skipTransformProcessType: true`
- [x] 1.2 为 5 个子窗口的 `app.focus({ steal: true })` 增加 `if (!win?.isFocused?.())` 守卫，避免重复聚焦时强行偷焦点
- [x] 1.3 重构 `test/subWindowActivation.test.js`，彻底移除纯源码正则匹配，改为加载真实模块/FakeBrowserWindow，断言打开窗口时的置顶/跨桌面选项/焦点抢占，以及 180ms 后的降级回落
- [x] 1.4 在 `test/petScaleWindow.behavior.test.js` 与 `test/skinSelectorWindow.behavior.test.js` 中补齐针对 `alwaysOnTop`、`visibleOnAllWorkspaces` 的行为断言
- [x] 1.5 运行 `npm test` 验证通过
- [x] 1.6 **原子提交 1**：`fix: optimize sub-window activation, prevent macOS dock flicker, and add behavioral tests`

### 阶段二：Node.js engines 环境声明与 Dependabot 测试边界标注
- [ ] 2.1 在 `package.json` 中配置 `"engines": { "node": ">=22.12.0" }`（与 `@electron/asar@4.3.1` 和 ESM `require` 基线对齐）
- [ ] 2.2 完善 `test/dependabotConfig.test.js`，补充注释与测试描述，明确标注其作用域为本地工作流文件防回归哨兵，不能替代 GitHub 仓库级设置
- [ ] 2.3 运行 `npm test` 验证通过
- [ ] 2.4 **原子提交 2**：`chore: specify Node engines requirement and clarify dependabot test boundaries`

### 阶段三：架构决策 ADR、结构文档、规则与 CHANGELOG 同步
- [ ] 3.1 更新 `docs/decisions/ADR-026-macos-manual-update-executable-name.md`，校正为 macOS 13.0 / Electron 45
- [ ] 3.2 更新 `docs/structure.md`，修正 `PetScaleWindow.js` 描述（体现脉冲置顶与跨 Space）及第 496 行 Electron 45+ / Chromium 145+ 基线
- [ ] 3.3 更新 `AGENTS.md` 运行时基线为 Electron 45+（Chromium 145+）
- [ ] 3.4 完善 `CHANGELOG.md`，记录 Electron 45、`@electron/asar@4`、`electron-store@12`、`glob@14` 等依赖升级，明确标注 macOS 13.0 最低版本对 Monterey 的 Breaking 影响，以及阶段一、二的修复项
- [ ] 3.5 勾选完成本计划全部清单并运行全量验证
- [ ] 3.6 **原子提交 3**：`docs: synchronize architecture docs and changelog for Electron 45 baseline and sub-window behavior`
