# DeskPet Agent Instructions

These instructions apply to this repository. Keep `.geminirules` in place for
Gemini-based tooling; this `AGENTS.md` is the Codex-readable project guidance.

Always follow these rules when editing, debugging, reviewing, or planning work
in this project.

## Core Principles

1. Think first: surface assumptions and trade-offs before coding. Ask questions
   when game logic, formulas, or scaling behavior is unclear. Prefer simpler
   paths when they satisfy the requirement. When evaluating an external code
   review, audit, or plan, verify the active branch (`main` vs
   `cp/crowley-aziraphale`), commit baseline vs `HEAD`, exact file/line
   citations, runtime facts (e.g. `process.versions`), missing context, and
   actual test runs before agreeing or acting—never assume a report is free of
   stale items or false positives.
2. Use skills first: Before performing tasks like UI engineering, writing
   documentation, or debugging, you MUST proactively review the available agent
   skills in your context and load the relevant `SKILL.md` via `read_file`
   first (honoring any user-requested `/skill`):
   - Project skills in `.agents/skills/`: `desktop-pet-maintenance` (renderer/main/IPC/display/skins), `skin-asset-pipeline` (sprites/WebP/encryption), `release-and-packaging` (builds/ASAR/signing/workflows).
   - Global skills: `debugging-and-error-recovery`, `frontend-ui-engineering`, `game-ui-ux`, `code-review-and-quality`, `documentation-and-adrs`, and orchestration skills (`swarm`, `subagent-driven-development`).
3. Keep changes simple: write the minimum code needed. Avoid speculative
   abstractions and premature object-oriented registry structures.
4. Make surgical edits: modify only the lines needed. Match the existing style
   with vanilla JavaScript and standard CSS. Remove orphaned code created by
   your edits, and do not touch unrelated code.
5. Goal-Driven Execution & Chain Verification: When executing multi-step tasks or `/goal` requests:
   - Solve exactly ONE issue or task at a time.
   - After each atomic fix, proactively verify and update corresponding unit tests (`test/`). Write behavioral tests (with mocks, fake timers, or `FakeBrowserWindow`) rather than regex/source-matching assertions (`assert.match(source, ...)`), except for intentional static security/manifest invariants. Never claim tests pass or cover behavior without actually running them (`npm test`, plus `npm run test:integration` for IPC/service/window lifecycle changes).
   - **Proactive Documentation & Plan Sync**: YOU MUST automatically:
     1. Check off completed items (`- [x]`) in the active `docs/plan/*.md` file immediately upon completing each task/phase, so cross-platform agents (e.g. macOS / Windows) maintain exact progress visibility.
     2. Update `CHANGELOG.md`, `docs/structure.md`, and relevant ADRs (`docs/decisions/`) in the same step, with explicit cross-links (`[ADR-xxx](docs/decisions/ADR-xxx.md)`), and verify with `npm run check:adrs`. Do not wait for user prompting.
   - **Phase-based Atomic Commits**: For multi-phase plans, create an atomic commit at the end of each completed phase/task together with its tests, plan checkbox updates, and docs. Never batch multiple phases into a mega-commit; this maintains clean bisectability and rollback checkpoints.
   - **Regression Prevention**: For security changes or complex refactors, always explicitly provide the user with manual verification steps to ensure no behavior degradation.
   - Never batch multiple tasks without completing the test and documentation verification loop for each step.

## Architecture Boundaries

1. Main process (`main.js`): owns system tasks, native window management, tray
   behavior, IPC routes, and `electron-store`.
2. Preload (`preload.js`): exposes safe APIs through `window.electronAPI`.
3. Renderer (`src/`): owns the game loop, systems, and UI rendering. Do not use
   direct Node APIs in renderer code.
4. IPC Security Boundary: All sensitive operations (skin selection changes, protected asset loading, file system access) must be strictly validated and authorized within main process IPC handlers.
   When restricting sender ID, always retain/expose E2E QA entry points (e.g., `app.openSkinSelectorForQA`) to avoid smoke test deadlocks.

## Runtime Constraints

1. Game Loop & Time Skew (`src/app.js`): Wrap step iterations in `try/catch` so renderer crashes do not take down the app. Synchronize sprite orientation on transition frames to avoid visual glitches. When calculating elapsed time or greetings across frames, guard against system sleep/wake time jumps (e.g., macOS Dark Wake or overnight sleep) by clamping or validating maximum allowable time deltas.
   When parsing external API metrics (e.g., weather coordinates/temperatures), strictly use finite number validation (`firstFiniteNumber`) to prevent implicit `Number(null)` -> `0` coercion.
2. Multi-Display & DPI Behavior:
   - Use `displayBounds.js` for coordinate conversion.
   - Keep window refit/debounce behavior in `displayFit.js`.
   - Keep Electron `screen` event coalescing and min/max constraint bridging together.
   - Send renderer `screen-info` only after the main transparent window has settled to the intended virtual desktop bounds.
   - Apply `scaleRatio` to `PetRenderer`, `ContextMenu`, and effects so physical sizing stays consistent across screens.
3. macOS vs Windows Window Management & Sub-Window UI: When modifying window states (such as `alwaysOnTop` or visibility during fullscreen/space transitions in `main.js` or sub-windows like settings, skin selector, or pomodoro clock), account for macOS space isolation, `skipTransformProcessType: true` on `setVisibleOnAllWorkspaces`, guarded `app.focus({ steal: true })`, `alwaysOnTop` overlay stacking, and fullscreen window rearrangement to prevent windows from being trapped, hidden, or flickering. For sub-window UI or layout changes, verify zero unintended scroll overflow/clipping across `zh`/`en`/`ja` in real Electron (`npm run test:e2e` or Playwright measurement), not just fake-DOM unit tests.
4. Input & Drag Behavior:
   - Default to `setIgnoreMouseEvents(true, { forward: true })`.
   - Toggle mouse events to `false` only while hovering interactive elements.
   - Set `isDragging = true` during drag operations, pausing `MovementSystem` and `InteractionSystem`.

## Asset Pipeline & Skin System (`src/assets/`, `skinGallery.js`)

1. Pipeline Adherence: When adding or modifying character skins or sprites, strictly follow `docs/skin-pipeline-guide.md`. Use `webp` format and maintain standard orientation prefixes (`walk_left`, `walk_right`).
2. Multi-Language & Manifest Synchronization: Any addition or modification of skins must be synchronized across `skinGallery.js`, `protectedAssetLoader.js`, and updated in all three language Readmes (`readme_zh.txt`, `readme_en.txt`, `readme_ja.txt`). When using `pet-asset://` protocols, ensure all sub-window HTML CSPs allow `pet-asset:`.
3. Skin Selector State Machine: The skin selector UI (`skinSelectorPreload.js` / `skinGallery.js`) must support a preview-confirm workflow (`isPreview`). Selecting a skin previews it on the active pet without committing; clicking cancel safely restores the previous skin.

## Browser Support & Web Standards Policy

1. Runtime Baseline: Electron 45+ (Chromium 156+ runtime baseline). All renderer code targets modern Chromium web standards directly.
2. Zero External Polyfills / CDNs: Never introduce polyfills, external component libraries, or CDN scripts/styles. Maintain a strict Content Security Policy (CSP) and zero-dependency renderer footprint.
3. Native Modern Web Standards:
   - Popover API (`popover="manual"`, `showPopover()`, `hidePopover()`) for top layer elevation without `z-index` competition.
   - CSS Anchor Positioning (`position-anchor`, `position-area`, `position-try-fallbacks`) for interest-triggered tooltips.
   - CSS Relative Color Syntax (`rgb(from var(...) r g b / <alpha>)`) for derived alpha colors and glow shadows.
   - CSS `@starting-style`, `overlay`, and `transition-behavior: allow-discrete` for top layer entry and exit transitions.
   - `content-visibility: auto` paired with `contain-intrinsic-size` for heavy below-the-fold list rendering (e.g., skin gallery).
   - Standard ARIA semantics (e.g., `role="meter"` with `aria-labelledby`, `aria-disabled="true"`) and `@media (prefers-reduced-motion: reduce)`.
4. Test Environment Graceful Degradation: Unit tests run in Node.js test runner using lightweight fake-DOM mock objects. All modern web API calls in renderer JavaScript (e.g. `showPopover`, `hidePopover`, `getAnimations`) MUST use feature detection or optional chaining (`typeof el.showPopover === 'function'`, `el.showPopover?.()`, fallback timers) so fake-DOM tests run seamlessly without error.

## Documentation And Versioning

Before commit or push:

1. Update `CHANGELOG.md`: Group changes strictly under exact English headings `Added`, `Changed`, `Fixed`, `Removed`, or `Security`. 
   - **CRITICAL**: Ensure headings are NEVER duplicated under the same version header (e.g., do not create two `Fixed` sections; merge them into one).
   - All entries under `Unreleased` MUST be placed directly beneath `## [Unreleased]` in clear Chinese (except code terms/proper nouns) and strictly separated from published release headers. Link ADRs when relevant (e.g. `[ADR-048](docs/decisions/ADR-048-modern-web-standards-adoption.md)`).
   - Run `./push.sh` (or `.\push.ps1`) early to catch CHANGELOG format errors during preflight validation before attempting push.
2. Update docs when behavior changes: Keep `docs/structure.md`, `docs/git-workflow.md`, `README.md` / `readme_*.txt`, relevant ADRs, and `package-lock.json` (when dependencies or `engines` change) synchronized with verified runtime behavior and versions.
3. Use atomic commits with this message shape:

   ```text
   <type>: <short description>

   <body explaining why>
   ```

4. Automated Push Checks: Use `./push.sh` (macOS/Linux) or `.\push.ps1` (Windows) to commit/push changes so project safety checks run. Note that `push.sh`/`push.ps1` reject unstaged untracked files, run `npm run sync:cp` on `main` only (this script is not present on `cp/crowley-aziraphale`), and accept `[skip-cp]` in the commit message for `main`-only changes that should not sync to `cp/crowley-aziraphale`.
