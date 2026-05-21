# Code Review Findings - 2026-05-20

Scope: full-project review of the Electron desktop pet app.

## Findings

### 1. Saved zero coordinates are not restored

File: `src/systems/TimeSystem.js`

`deserializePet()` restores `x` and `y` with `data.x || pet.x` and `data.y || pet.y`. A saved coordinate of `0` is valid for the left or top edge of the desktop, but `||` treats it as missing and keeps the previous/default position.

Impact: pets saved at the left or top screen edge can move unexpectedly after restart.

Recommended fix: use nullish handling and numeric validation, for example `Number.isFinite(data.x) ? data.x : pet.x`. Add a regression test for `x: 0` and `y: 0`.

### 2. Final save on window unload is not awaited

File: `src/app.js`

The `beforeunload` handler calls `saveCurrentState()` without waiting for the async IPC save to finish.

Impact: quick app shutdown can lose the latest pet positions, stats, or recently selected skin.

Recommended fix: move the final save into a main-process controlled close/quit flow, or explicitly block unload until the renderer save promise has completed.

### 3. Dynamic HTML rendering should be hardened before custom skins expand

Files:

- `src/ui/ContextMenu.js`
- `src/statusWindow.js`

Both files build UI with `innerHTML` using pet image/name data. The current source of these values is mostly local configuration, and CSP reduces the immediate blast radius, so this is not an urgent production blocker today. It becomes riskier if custom skins or external metadata are allowed to define names, emoji, image paths, or status payloads.

Impact: future custom content could create an HTML injection path.

Recommended fix: render these nodes with DOM APIs, assign text through `textContent`, and set image attributes directly.

## Verification Performed

- `npm test`: 76 tests passed.
- `node --check`: project JavaScript files passed syntax checks.
- `npm run build`: Windows NSIS build completed successfully.
- `node scripts/verify-installer.js`: installer environment verification passed.

## Not Completed

`npm audit --omit=dev --audit-level=high` was not completed. The command would send dependency metadata to the npm audit service, and that external disclosure was not explicitly authorized for this review.
