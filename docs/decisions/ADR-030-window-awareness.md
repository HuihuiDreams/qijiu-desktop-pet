# ADR-030: Window Awareness Platform Sampling

## Status
Accepted

## Date
2026-05-28

## Context
The pet should be able to notice the current foreground application window and walk to the top edge of that window. The feature must not add OS polling to the renderer game loop, must keep click-through and drag behavior unchanged, and must degrade cleanly on platforms where foreground-window geometry is unavailable.

The existing architecture already separates native work into `main.js`, safe IPC into `preload.js`, and movement/rendering into `src/`. Multi-display geometry is already centralized in `displayBounds.js`.

## Decision
Implement Window Awareness as a main-process provider plus renderer-side cache:

- `activeWindowProvider.js` owns the provider contract and Windows foreground-window sampling.
- `activeWindowAwareness.js` builds renderer payloads, converts active-window geometry into pet-window coordinates, and deduplicates updates before IPC.
- `preload.js` exposes `getActiveWindowInfo()` and `onActiveWindowInfo(callback)`.
- `WindowAwarenessSystem` in the renderer stores only the latest payload and exposes `getCurrentPlatform()` as an O(1) cache read.
- `MovementSystem` receives the current platform through `setActivePlatform()` and only uses it when an idle pet chooses a new target.

Windows uses a lightweight PowerShell/User32 provider at a 1000ms sampling interval. macOS and other platforms return an unavailable fallback for this MVP instead of attempting partial or permission-sensitive support.

## Alternatives Considered

### Query OS Window State From The Renderer
- Pros: Direct access from movement logic.
- Cons: Violates renderer boundary, would require Node/native access in renderer, and risks game-loop stalls.
- Rejected: Native work belongs in the main process.

### Add A Native Dependency
- Pros: Potentially faster and richer window metadata.
- Cons: Adds packaging and signing risk across Windows/macOS builds.
- Rejected for MVP: The current provider is isolated and can be replaced later without changing renderer contracts.

### macOS Accessibility Provider In MVP
- Pros: Feature parity with Windows.
- Cons: Requires Accessibility permission handling, user education, and separate multi-display testing.
- Deferred: macOS returns unavailable fallback until a permission-aware provider is designed.

## Consequences
- Renderer behavior remains deterministic when Window Awareness is unavailable or disabled.
- IPC is sent only when relevant active-window/platform fields change.
- Active-window changes do not immediately force walking or dragging pets to retarget; the platform is used on the next idle target selection.
- Future macOS support should implement a provider behind the same contract and preserve the unavailable fallback when permission is missing.
