# Claude Code Project Instructions for DeskPet

This file contains project-specific guidance for Claude Code when working on the DeskPet repository.

## Core Principles

1. **Think First**: Surface assumptions and trade-offs before coding. Ask questions when game logic, formulas, or scaling behavior is unclear. Prefer simpler solutions when they satisfy requirements.

2. **Load Relevant Skills Proactively**: Before performing specialized tasks, load the appropriate skill instructions:
   - Use `debugging-and-error-recovery` when investigating crashes, bugs, or OS-specific issues
   - Use `frontend-ui-engineering` when modifying CSS, window styling, or interactive UI animations
   - Use `code-review-and-quality` before completing PRs, release branches, or multi-file refactoring
   - Use `documentation-and-adrs` when making architectural decisions or creating ADRs

3. **Keep Changes Minimal**: Write only the code needed. Avoid speculative abstractions and premature object-oriented registry structures.

4. **Make Surgical Edits**: Modify only the lines needed. Match existing style with vanilla JavaScript and standard CSS. Remove orphaned code created by edits, but do not touch unrelated code.

5. **Goal-Driven Execution with Chain Verification**: For multi-step tasks or `/goal` requests:
   - Solve exactly ONE issue or task at a time
   - After each atomic fix: verify unit tests in `test/`, run `npm test` or focused `node --test` checks
   - Update `CHANGELOG.md`, `docs/structure.md`, and ADRs before moving to the next step
   - Never batch multiple tasks without completing the test and documentation loop for each

## Architecture Boundaries

- **Main Process** (`main.js`): System tasks, native window management, tray behavior, IPC routes, and `electron-store`
- **Preload** (`preload.js`): Exposes safe APIs through `window.electronAPI`
- **Renderer** (`src/`): Game loop, systems, and UI rendering. Do NOT use direct Node APIs in renderer code
- **IPC Security**: All sensitive operations (skin changes, protected asset loading, file system access) must be validated in main process IPC handlers. When restricting sender ID, retain/expose E2E QA entry points (e.g., `app.openSkinSelectorForQA`) to avoid smoke test deadlocks

## Runtime Constraints

### Game Loop & Time Skew (`src/app.js`)
- Wrap step iterations in `try/catch` to prevent renderer crashes from taking down the app
- Synchronize sprite orientation on transition frames to avoid visual glitches
- Guard against system sleep/wake time jumps (macOS Dark Wake, overnight sleep) by clamping/validating maximum time deltas
- Strictly validate external API metrics using finite number checks (`firstFiniteNumber`) to prevent implicit coercion like `Number(null)` → `0`

### Multi-Display & DPI Behavior
- Use `displayBounds.js` for coordinate conversion
- Keep window refit/debounce logic in `displayFit.js`
- Coalesce Electron `screen` events and coordinate constraint bridging
- Send `screen-info` to renderer only after the main transparent window has settled to intended virtual desktop bounds
- Apply `scaleRatio` to `PetRenderer`, `ContextMenu`, and effects for consistent physical sizing across displays

### macOS vs Windows Window Management
- Account for macOS space isolation and fullscreen rearrangement when modifying window states (`alwaysOnTop`, visibility, etc.) in `main.js` and sub-windows (e.g., pomodoro clock)
- Prevent windows from being trapped or hidden across spaces

### Input & Drag Behavior
- Default to `setIgnoreMouseEvents(true, { forward: true })`
- Toggle mouse events to `false` only while hovering interactive elements
- Set `isDragging = true` during drag operations to pause `MovementSystem` and `InteractionSystem`

## Asset Pipeline & Skin System

### Pipeline Adherence
- When adding or modifying skins/sprites, strictly follow `docs/skin-pipeline-guide.md`
- Use `webp` format and maintain standard orientation prefixes (`walk_left`, `walk_right`)

### Multi-Language & Manifest Synchronization
- Any skin addition/modification must be synchronized across:
  - `skinGallery.js`
  - `protectedAssetLoader.js`
  - All three language READMEs (`readme_zh.txt`, `readme_en.txt`, `readme_ja.txt`)
- When using `pet-asset://` protocols, ensure all sub-window HTML CSPs allow `pet-asset:`

### Skin Selector State Machine
- The skin selector UI (`skinSelectorPreload.js` / `skinGallery.js`) must support preview-confirm workflow (`isPreview`)
- Selecting a skin previews it without committing; canceling safely restores the previous skin

## Commit & Documentation Standards

Before commit or push:

1. **Update CHANGELOG.md**
   - Group changes under exact English headings: `Added`, `Changed`, `Fixed`, `Removed`
   - All entries under `Unreleased` MUST be written in clear Chinese (except code terms/proper nouns)
   - Keep `Unreleased` section strictly separate from published version headers
   - Link ADRs when relevant

2. **Update Docs When Behavior Changes**
   - Keep `docs/structure.md` synchronized with architecture changes
   - Keep relevant ADRs aligned with runtime behavior updates

3. **Use Atomic Commits**
   ```text
   <type>: <short description>

   <body explaining why>
   ```

4. **Automated Push Checks**
   - Use `./push.sh` (macOS/Linux) or `.\push.ps1` (Windows) to run project safety checks before pushing
