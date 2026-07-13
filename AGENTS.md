# DeskPet Agent Instructions

These instructions apply to this repository. Keep `.geminirules` in place for
Gemini-based tooling; this `AGENTS.md` is the Codex-readable project guidance.

Always follow these rules when editing, debugging, reviewing, or planning work
in this project.

## Core Principles

1. Think first: surface assumptions and trade-offs before coding. Ask questions
   when game logic, formulas, or scaling behavior is unclear. Prefer simpler
   paths when they satisfy the requirement.
2. Use skills first: Before performing tasks like UI engineering, writing
   documentation, or debugging, you MUST proactively review the available agent
   skills in your context and load the relevant skill instructions via `view_file` first:
   - `debugging-and-error-recovery`: Load when investigating crashes, bugs, or OS-specific anomalies.
   - `frontend-ui-engineering`: Load when modifying CSS, window styling, or interactive UI animations.
   - `code-review-and-quality`: Load before completing PRs, release branches, or multi-file refactoring.
   - `documentation-and-adrs`: Load when making architectural decisions or creating ADRs.
3. Keep changes simple: write the minimum code needed. Avoid speculative
   abstractions and premature object-oriented registry structures.
4. Make surgical edits: modify only the lines needed. Match the existing style
   with vanilla JavaScript and standard CSS. Remove orphaned code created by
   your edits, and do not touch unrelated code.
5. Goal-Driven Execution & Chain Verification: When executing multi-step tasks or `/goal` requests:
   - Solve exactly ONE issue or task at a time.
   - After each atomic fix, verify and update corresponding unit tests (`tests/`), run `npm test` or focused `node --test` checks, and update related documentation (`CHANGELOG.md`, `docs/structure.md`, ADRs).
   - Never batch multiple tasks without completing the test and documentation verification loop for each step.

## Architecture Boundaries

1. Main process (`main.js`): owns system tasks, native window management, tray
   behavior, IPC routes, and `electron-store`.
2. Preload (`preload.js`): exposes safe APIs through `window.electronAPI`.
3. Renderer (`src/`): owns the game loop, systems, and UI rendering. Do not use
   direct Node APIs in renderer code.
4. IPC Security Boundary: All sensitive operations (skin selection changes, protected asset loading, file system access) must be strictly validated and authorized within `main.js` IPC handlers.

## Runtime Constraints

1. Game Loop & Time Skew (`src/app.js`): Wrap step iterations in `try/catch` so renderer crashes do not take down the app. Synchronize sprite orientation on transition frames to avoid visual glitches. When calculating elapsed time or greetings across frames, guard against system sleep/wake time jumps (e.g., macOS Dark Wake or overnight sleep) by clamping or validating maximum allowable time deltas.
2. Multi-Display & DPI Behavior:
   - Use `displayBounds.js` for coordinate conversion.
   - Keep window refit/debounce behavior in `displayFit.js`.
   - Keep Electron `screen` event coalescing and min/max constraint bridging together.
   - Send renderer `screen-info` only after the main transparent window has settled to the intended virtual desktop bounds.
   - Apply `scaleRatio` to `PetRenderer`, `ContextMenu`, and effects so physical sizing stays consistent across screens.
3. macOS vs Windows Window Management: When modifying window states (such as `alwaysOnTop` or visibility during fullscreen/space transitions in `main.js` or sub-windows like the pomodoro clock), account for macOS space isolation and fullscreen window rearrangement to prevent windows from being trapped or hidden across spaces.
4. Input & Drag Behavior:
   - Default to `setIgnoreMouseEvents(true, { forward: true })`.
   - Toggle mouse events to `false` only while hovering interactive elements.
   - Set `isDragging = true` during drag operations, pausing `MovementSystem` and `InteractionSystem`.

## Asset Pipeline & Skin System (`src/assets/`, `skinGallery.js`)

1. Pipeline Adherence: When adding or modifying character skins or sprites, strictly follow `docs/skin-pipeline-guide.md`. Use `webp` format and maintain standard orientation prefixes (`walk_left`, `walk_right`).
2. Multi-Language & Manifest Synchronization: Any addition or modification of skins must be synchronized across `skinGallery.js`, `protectedAssetLoader.js`, and updated in all three language Readmes (`readme_zh.txt`, `readme_en.txt`, `readme_ja.txt`).
3. Skin Selector State Machine: The skin selector UI (`skinSelectorPreload.js` / `skinGallery.js`) must support a preview-confirm workflow (`isPreview`). Selecting a skin previews it on the active pet without committing; clicking cancel safely restores the previous skin.

## Documentation And Versioning

Before commit or push:

1. Update `CHANGELOG.md`: Group changes under exact English headings `Added`, `Changed`, `Fixed`, or `Removed`. All entries under `Unreleased` MUST be written in clear Chinese (except code terms/proper nouns) and strictly separated from published version headers. Link ADRs when relevant.
2. Update docs when behavior changes: Keep `docs/structure.md` and relevant ADRs synchronized with architecture or runtime behavior changes.
3. Use atomic commits with this message shape:

   ```text
   <type>: <short description>

   <body explaining why>
   ```

4. Automated Push Checks: Use `./push.sh` (macOS/Linux) or `.\push.ps1` (Windows) to commit/push changes so project safety checks run.
