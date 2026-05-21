# ADR-024: 多语言支持 (i18n)

## 状态 (Status)
已接受 (Accepted)

## 日期 (Date)
2026-05-20

## 背景 (Context)
桌面宠物需要面向多语言用户群体，原始代码中的 UI 文字、对话气泡、托盘菜单、状态面板和更新弹窗均为中文硬编码。需要在不破坏现有架构的前提下，支持 **中文 (zh)**、**英语 (en)**、**日语 (ja)** 三种语言，并允许运行时热切换。

语言判定规则：
- OS 语言为简体/繁体中文 → `zh`
- OS 语言为日语 → `ja`
- 其他所有 OS 语言 → `en`

## 决策 (Decision)

### 1. 统一字典架构

新增 `src/data/i18n.js`，导出一个以 locale 为键的 `I18N` 对象。每个 locale 包含两个层级：

- **`ui`**：所有静态 UI 字符串（菜单、状态面板、托盘菜单、更新弹窗等）。
- **`dialogues`**：所有对话气泡的台词池（`greet`、`shareFood`、`cultivate`、`kiss`、`hug`、`throwup`、`idle`、`hungry`、`lowQi`、`lowMood`），每个池包含 `yueqi` 和 `shenjiu` 两个角色的台词数组。

```
I18N.zh.ui.feed        → '🍎 喂食'
I18N.en.ui.feed        → '🍎 Feed'
I18N.zh.dialogues.kiss.yueqi[0] → '小九…'
```

### 2. 翻译函数

- **渲染进程**：`window.t(key)` 从 `I18N[window.__currentLocale].ui` 取值，回退到 `I18N.zh.ui`，再回退到 key 本身。
- **主进程托盘**：`trayT(key)` 从本地维护的 `TRAY_I18N` 字典取值，同样带中文回退。
- **状态面板**（独立 BrowserWindow）：有自己的局部 `t(key)` 函数，读取同一份 `I18N` 字典。

### 3. 对话气泡字典动态初始化

`src/data/dialogues.js` 中的 `initDialogues(locale)` 在启动时被 `app.js` 调用，将 `I18N[locale].dialogues` 赋值给 `window.DIALOGUES`。中文硬编码作为兜底（`_DIALOGUES_ZH_FALLBACK`）。

### 4. 运行时语言热切换

用户可通过**托盘菜单 → 🌐 语言**或**右键菜单**随时切换语言，无需重启应用。切换流程：

1. 渲染进程调用 `window.electronAPI.setLocale(lang)`。
2. 主进程保存到持久存储，刷新托盘菜单，并向**所有窗口**广播 `locale-changed` 事件：
   - `mainWindow`（宠物主窗口）
   - `statusWindow`（状态面板）
3. 各窗口监听器更新：
   - `app.js`：更新 `window.__currentLocale`、`window.I18N_UI`、重建 `DIALOGUES`、刷新 DOM `data-i18n` 元素。
   - `statusWindow.js`：更新局部 `currentLocale`、刷新 `data-i18n` 元素、**立即用缓存数据重新渲染所有状态条**。

### 5. DOM 翻译绑定

HTML 中通过 `data-i18n="key"` 属性标记需要翻译的元素，`applyI18n()` 遍历所有这类元素并更新 `textContent`。动态生成的内容（如 `renderPetStats`）在拼装时直接调用 `t(key)`。

### 6. 更新弹窗 (updateManager.js)

主进程 `updateManager.js` 的所有 `dialog.showMessageBox` 调用改为使用注入的 `t` 函数（`trayT`），支持完整的多语言错误提示。

### 7. 调试脚本 (debug.js)

`testShareFoodThrowup()` 等测试函数不再硬编码中文，而是从 `DIALOGUES.throwup` 动态取台词。

### 8. UI 适配

- **单人对话气泡**：保持 `white-space: nowrap`，单行自然延展，不限制宽度。
- **双人互动气泡** (`.overlay-bubble`)：使用 `white-space: pre-wrap`、`max-width: 130px`、`word-wrap: break-word`，英文长文本受限折行后向上增长（`bottom` 定位），避免两人气泡重叠。
- **状态面板** (`.stat-label`)：宽度从 72px 增至 85px，加 `white-space: nowrap`，确保英文标签（如 "❤️ Affection"）不折行，所有属性名右对齐。

## 替代方案 (Alternatives Considered)

### 使用成熟的 i18n 库（如 i18next）
- **优点：** 复数、插值、命名空间等功能齐全。
- **缺点：** 本项目翻译量极小（约 80 个 UI key + 约 70 条对话），引入外部依赖增加了打包体积和学习成本，Electron 主进程/渲染进程的双端加载也需额外胶水代码。
- **结论：** 拒绝。轻量的自写字典完全胜任。

### 每种语言单独一个 JSON 文件
- **优点：** 便于交给翻译人员单独编辑。
- **缺点：** 需要异步加载和版本管理多个文件；对话气泡需要支持函数类型字符串（如 `returnYueqi: (n) => ...`），纯 JSON 无法承载。
- **结论：** 拒绝。统一放在 `i18n.js` 中既简洁又支持函数。

### 不支持运行时切换，改为跟随 OS 语言 + 重启生效
- **优点：** 实现简单，不需要事件监听和全量重绘。
- **缺点：** 用户体验差，切换后需要完全退出并重启才能看到效果。
- **结论：** 拒绝。桌面宠物是长时间驻留型应用，运行时切换是刚需。

## 影响 (Consequences)

- 所有用户可见的文字均已纳入 `I18N` 字典管辖，新增 UI 字符串时必须在 `zh`、`en`、`ja` 三套中同步添加。
- `DIALOGUES` 不再是全局硬编码常量，而是在 `initDialogues()` 调用后才可用；`debug.js` 和 `InteractionSystem.js` 中对 `DIALOGUES` 的访问需做 null-safe 检查。
- 切换语言时主进程向所有窗口广播事件，新增窗口类型时需确保将其加入广播列表。
- 状态面板使用 `lastRenderData` 缓存最近一次数据，语言切换时强制重绘；若缓存为空（面板从未收到数据），则跳过重绘，无副作用。
- 英文 UI 天然比中/日文更长，涉及固定宽度区域（菜单、气泡、标签）时需测试三种语言下的显示效果。

## 涉及文件 (Files Changed)

| 文件 | 变更 |
|---|---|
| `src/data/i18n.js` | 新增，统一多语言字典 |
| `src/data/dialogues.js` | 重构为 `initDialogues(locale)` 动态初始化 |
| `src/app.js` | 新增 `window.t()`、`updateI18nRefs()`、`locale-changed` 监听 |
| `src/statusWindow.js` | 新增局部 `t()`、`locale-changed` 监听、`lastRenderData` 缓存重绘 |
| `src/ui/ContextMenu.js` | 菜单项文字改用 `window.t()` |
| `src/debug.js` | 硬编码台词改为读取 `DIALOGUES` |
| `src/index.css` | `.overlay-bubble` 新增折行样式 |
| `src/status.css` | `.stat-label` 加宽至 85px |
| `main.js` | 新增 `trayT()`、语言持久化、向所有窗口广播 `locale-changed` |
| `updateManager.js` | `dialog` 文案改用注入的 `t` 函数 |
| `preload.js` | 新增 `getLocale`、`setLocale`、`onLocaleChange` 桥接 |
