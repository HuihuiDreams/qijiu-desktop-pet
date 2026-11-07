# 11/5-6 提交代码审查修复计划

> 针对 2026-11-05 至 2026-11-06 提交代码的五维审查结论，通过并行子代理修复子窗口置顶竞争、番茄钟取消置顶闪烁、跨平台测试覆盖以及依赖与安全报告同步问题，并按阶段形成原子提交。

---

## 阶段一：子窗口置顶守卫协同、无闪烁取消置顶与跨平台行为测试
- [x] 1.1 在 `src/main/windows/PomodoroWindow.js` 中为 `createPomodoroWindow` 补齐 `show: false`，并在 `applyPomodoroWindowPinState` 取消置顶分支传入 `{ skipTransformProcessType: true }`，同步更新 `test/pomodoroTray.test.js`
- [x] 1.2 在 `src/main/windows/CitySettingWindow.js` 中为 `createCitySettingWindow` 补齐 `show: false`，并将 `restore` 事件回调统一为 `pulseCitySettingWindowTop()`，消除递归调用 `raiseCitySettingWindow()`；移除 `SkinSelectorWindow.js` 与 `PetScaleWindow.js` 打开窗口时紧随 `pulse*WindowTop()` 之后的冗余 `win.moveTop()`
- [x] 1.3 在 `src/main/windows/PetWindow.js` 的 `keepPetWindowOnTop()` 中，当 `mainWindow` 执行 `moveTop()` 后，对当前可见且处于 `alwaysOnTop` 态的子窗口（`statusWindow`、`pomodoroWindow` 等）顺次补调 `moveTop()`，防止 3 秒置顶定时器将同级子窗口压到桌宠画布下方；在 `test/petWindow.test.js` 中补充对应回归测试
- [x] 1.4 在 `test/subWindowActivation.test.js` 中增加跨平台（模拟 `darwin` 与 `win32`）焦点抢占行为断言与番茄钟取消置顶 `skipTransformProcessType: true` 断言
- [x] 1.5 运行聚焦测试与全量 `npm test` 并完成阶段一原子提交

## 阶段二：Dependabot Playwright 分组、undici 安全补丁与安全报告同步
- [x] 2.1 对齐 `package.json` 与 `package-lock.json` 中的 `"playwright": "^1.64.1"`，并在 `.github/dependabot.yml` 中配置 `playwright` 组合更新（`groups.playwright`），在 `test/dependabotConfig.test.js` 中补充断言
- [x] 2.2 将 `package-lock.json` 中 `node_modules/undici` 从 `7.29.0` 升级至兼容安全补丁版 `7.30.2`，消除 High 级别安全通告，并在 `test/dependencyUriSecurity.test.js`（或平台/依赖测试）中补充版本防回退断言
- [x] 2.3 同步更新 `docs/security_best_practices_report.md`（Electron `^45.2.1` 基线及 `SBP-001` 已解决状态标记）、`docs/structure.md`、`docs/decisions/ADR-029-security-audit-and-local-hardening.md` 与 `CHANGELOG.md`
- [x] 2.4 运行 `npm test` 与 `npm audit --omit=dev` 验收并完成阶段二原子提交
