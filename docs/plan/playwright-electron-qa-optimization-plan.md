# Playwright Electron QA Optimization Plan

## Overview

This plan turns the Playwright no-change health check into small, verifiable
improvements. The first goal is to make Electron QA repeatable without touching
the real user profile. The second goal is to make pet visibility easier to
diagnose when meeting auto-hide, manual hide, or pomodoro focus mode hides the
stage. The final user-visible polish is improving context menu readability on a
transparent desktop window.

## Baseline Findings

- `npm test` passed with 405 tests.
- Playwright can import successfully after installing `playwright@1.61.1`.
- Launching Electron against the real `desktop-pet` user profile can hit profile
  lock and `DevToolsActivePort` permission errors.
- Launching with an isolated `--user-data-dir` and diagnostic Electron flags can
  start the app reliably.
- The main pet window covered the virtual desktop at `3640x1920` with no
  document scroll or clipping.
- Two displays were detected: primary `2560x1440` at `1.5x` and secondary
  `1080x1920` at `1x`.
- The pets were hidden during the check because Teams was detected as active by
  meeting auto-hide, not because rendering failed.
- Temporarily showing the stage confirmed both pets render at about `96x96` with
  loaded WebP sprites.
- Status, pomodoro, and city-setting windows rendered without scroll or clipping.
- The context menu worked, but readability was weak on a dark transparent-window
  background, especially for disabled items.

## Phase 1: Stable QA Launch

### Task 1: Add an isolated Playwright Electron smoke entry

Create a small QA entry point for launching Electron with an isolated profile.
This should avoid the real `AppData/Roaming/desktop-pet` profile and keep
Playwright diagnostics reproducible.

Acceptance criteria:
- [x] A single command can run an Electron smoke launch from the project root.
- [x] The launch uses an isolated user data directory under the workspace or temp
  directory.
- [x] The command verifies the main window title and basic renderer readiness.
- [x] Temporary QA data is cleaned up after the check.

Verification:
- [x] Run the new smoke command.
- [x] Confirm Playwright can find the main Electron window.
- [x] Confirm the command does not leave files outside the intended QA directory.

Likely files:
- `package.json`
- `tools/playwright-electron-smoke.js`

Estimated scope: Small.

## Phase 2: Visibility Diagnostics

### Task 2: Expose debug-only pet visibility reason

Add a debug-readable visibility state so QA can tell whether the pet stage is
hidden because of manual hide, meeting auto-hide, or pomodoro focus mode. This
should not add visible UI or weaken the renderer/main process boundary.

Acceptance criteria:
- [x] Playwright can read the current pet visibility reason during a QA session.
- [x] Existing hide/show behavior remains unchanged.
- [x] The renderer still uses safe preload APIs instead of direct Node APIs.

Verification:
- [x] Add focused tests for the visibility reason path or source-level contracts.
- [x] Run `npm test`.
- [x] In Playwright, confirm the QA-visible visibility reason can distinguish
  visible, manual, meeting, and pomodoro states.

Likely files:
- `main.js`
- `preload.js`
- `src/app.js`
- `test/*.test.js`

Estimated scope: Medium.

## Checkpoint 1

- [x] `npm test` passes.
- [x] The new Playwright smoke command launches Electron with an isolated profile.
- [x] A QA run can explain why the pet stage is hidden.

## Phase 3: Context Menu Readability

### Task 3: Improve context menu contrast on transparent backgrounds

Adjust menu styling so text remains readable on dark or visually busy desktop
backgrounds. Keep behavior and placement unchanged.

Acceptance criteria:
- [x] Normal menu items are clearly readable on dark backgrounds.
- [x] Disabled items are still visibly disabled but not illegible.
- [x] Menu size, positioning, and existing menu actions do not regress.

Verification:
- [x] Run context menu focused tests.
- [x] Run `npm test`.
- [x] Use Playwright to capture a right-click menu screenshot over the transparent
  window and inspect contrast, clipping, and spacing.

Likely files:
- `src/context-menu.css`
- Optional focused tests if source assertions already cover this area.

Estimated scope: Small.

## Phase 4: Documentation And Changelog

### Task 4: Document the QA workflow

Record the isolated Playwright Electron workflow so future QA runs do not repeat
the real-profile lock issue.

Acceptance criteria:
- [x] The QA command and expected behavior are documented.
- [x] The changelog is updated under an exact English heading such as `Added`,
  `Changed`, or `Fixed`.
- [x] Documentation stays focused on the workflow and does not duplicate code.

Verification:
- [x] Run the documented command.
- [x] Confirm `CHANGELOG.md` uses the required heading format.

Likely files:
- `CHANGELOG.md`
- `docs/structure.md` or a dedicated QA note under `docs/`

Estimated scope: Small.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Isolated QA launch diverges from real app launch | Medium | Keep the smoke check narrow and still run normal manual checks when profile-specific behavior matters. |
| Visibility diagnostics become user-facing clutter | Low | Expose through debug/preload paths only, not visible UI. |
| Context menu visual changes affect layout tests | Low | Keep dimensions stable and verify existing positioning tests. |
| Teams active state makes visual QA confusing | Medium | Record the visibility reason before forcing the stage visible for screenshots. |

## Open Questions

- Resolved: the Playwright smoke command is a regular npm script:
  `npm run qa:electron:smoke`.
- Resolved: visibility reason is exposed through a preload method and mirrored
  to `window.__DEBUG_VISIBILITY` for QA.
