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
   skills in your context and load the relevant skill instructions first.
3. Keep changes simple: write the minimum code needed. Avoid speculative
   abstractions and premature object-oriented registry structures.
3. Make surgical edits: modify only the lines needed. Match the existing style
   with vanilla JavaScript and standard CSS. Remove orphaned code created by
   your edits, and do not touch unrelated code.
4. Verify intentionally: define verification steps before coding. Run
   `npm test` or focused `node --test ...` checks. For UI or Electron window
   behavior changes, also use console checks or manual checks as appropriate.

## Architecture Boundaries

1. Main process (`main.js`): owns system tasks, native window management, tray
   behavior, IPC routes, and `electron-store`.
2. Preload (`preload.js`): exposes safe APIs through `window.electronAPI`.
3. Renderer (`src/`): owns the game loop, systems, and UI rendering. Do not use
   direct Node APIs in renderer code.

## Runtime Constraints

1. In `src/app.js`, wrap game-loop step iterations in `try/catch` so renderer
   crashes do not take down the app.
2. Synchronize sprite orientation on transition frames to avoid visual glitches.
3. For multi-display and DPI behavior:
   - Use `displayBounds.js` for coordinate conversion.
   - Keep window refit/debounce behavior in `displayFit.js`.
   - Keep Electron `screen` event coalescing and min/max constraint bridging
     together.
   - Send renderer `screen-info` only after the main transparent window has
     settled to the intended virtual desktop bounds.
   - Apply `scaleRatio` to `PetRenderer`, `ContextMenu`, and effects so physical
     sizing stays consistent across screens.
4. For input and drag behavior:
   - Default to `setIgnoreMouseEvents(true, { forward: true })`.
   - Toggle mouse events to `false` only while hovering interactive elements.
   - Set `isDragging = true` during drag operations, pausing `MovementSystem`
     and `InteractionSystem`.

## Documentation And Versioning

Before commit or push:

1. Update `CHANGELOG.md` and group changes under the exact English headings
   `Added`, `Changed`, `Fixed`, or `Removed` (Chinese entry text is fine).
   Link ADRs when relevant.
2. Update docs when behavior changes. Keep `docs/structure.md` and relevant ADRs
   synchronized with architecture or runtime behavior changes.
3. Use atomic commits with this message shape:

   ```text
   <type>: <short description>

   <body explaining why>
   ```

4. Use `.\push.ps1` for pushing so the project safety checks run.
