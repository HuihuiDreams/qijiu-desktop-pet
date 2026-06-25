# Frontend UI Phase 1 Text Audit
> Date: 2026-06-25
> Parent plan: [frontend-ui-optimization-implementation-plan.md](./frontend-ui-optimization-implementation-plan.md)

## Scope
This audit covers Phase 1 of the frontend UI optimization plan: static fallback text, user-facing package metadata, and i18n fallback paths that affect the pet overlay and compact utility windows.

## Static Window Fallback Text
The following files were checked as the primary static UI entrypoints:

| File | Required fallback state |
|---|---|
| `src/index.html` | Title, context menu labels, pet action fallback, and status title are readable UTF-8 Chinese. |
| `src/pomodoro.html` | Titlebar, setup, running, completed, tooltip, and control fallback text are readable UTF-8 Chinese. |
| `src/city-setting.html` | Titlebar, current city label, empty state, input placeholder, close, and confirm fallback text are readable UTF-8 Chinese. |
| `src/status.html` | Title, titlebar, close label, and footer fallback text are readable. |
| `src/update-progress.html` | Static text is intentionally minimal; dynamic text is provided by `update-progress.js` through safe DOM APIs. |

## Package Display Metadata
The following user-facing package fields are readable UTF-8 Chinese:

- `description`: `岳清源 & 沈清秋 桌面爱宠`
- `build.productName`: `七九爱宠`
- `build.nsis.shortcutName`: `七九爱宠`
- `build.nsis.uninstallDisplayName`: `七九爱宠`

## i18n Fallback Path
The current implementation keeps static HTML fallback text readable while runtime copy is supplied through `src/data/i18n.js` and `data-i18n` attributes. Phase 1 repairs only static fallback text and display metadata. Full dialogue copy cleanup is intentionally not included in Phase 1 because it is broader content work and existing tests cover dictionary presence rather than copy quality.

## Corrected Copy Plan
Use these fallback strings when static HTML or metadata needs repair:

| Key area | zh fallback | en fallback | ja fallback |
|---|---|---|---|
| App title | 岳七 & 沈九 桌面宠物 | Yue Qi & Shen Jiu Desktop Pet | 岳七 & 沈九 デスクトップペット |
| Status title | 修仙状态 | Cultivation Status | 修行状態 |
| City title | 城市设置 | Set City | 都市設定 |
| Pomodoro title | 苍穹静修 | Cang Qiong Seclusion | 蒼穹静修 |
| Close | 关闭 | Close | 閉じる |
| Confirm | 确认 | Confirm | 確認 |

## Automatic Evidence
`test/frontendUiFoundation.test.js` verifies the static fallback text, package display metadata, i18n attributes, shared token coverage, and shared UI class foundation.
