---
name: desktop-pet-maintenance
description: Maintain or debug the DeskPet Electron app. Use when changing its renderer game loop, transparent-window behavior, preload IPC boundary, skin pipeline, desktop interaction, display/DPI handling, release packaging, automatic updates, or related tests and documentation.
---

# DeskPet Maintenance

Read the repository `AGENTS.md` before changing code. Keep work scoped to the
requested behavior and preserve the main/preload/renderer boundary.

## Choose the owning layer

- Keep `main.js` as the entry point and `src/main/AppLifecycle.js` as the
  composition layer. Change the owning module in `src/main/windows/`,
  `src/main/services/`, `src/main/DisplayService.js`, or `src/main/TrayManager.js`
  for native windows, persistence, IPC, display handling, or tray behavior.
- Reuse `src/main/services/IpcSenderAuthorization.js` to validate IPC senders
  and validate sensitive arguments in the owning main-process handler. Retain
  `app.openSkinSelectorForQA` in `AppLifecycle.js` when restricting skin IPC.
- Expose only safe renderer-facing APIs from `preload.js` and the dedicated
  sub-window preloads; do not use Node APIs directly in renderer code.
- Keep `src/app.js` as the renderer composition root. Reuse `SkinSwitchController`
  for skin switching, `StageGeometry` for screen geometry, and `OfflineReturnSystem`
  for offline decay, return greetings, and saves in `src/systems/`.

## Protect desktop-pet behavior

- For window bounds or multiple displays, use `displayBounds.js` and retain the
  existing `displayFit.js` debounce/refit flow through `DisplayService.js`.
  Keep screen-event coalescing and min/max constraint bridging together; send
  `screen-info` only after the transparent window settles to its intended bounds.
  Apply `scaleRatio` to pet, menus, and effects consistently.
- For visibility or always-on-top changes, account for macOS fullscreen/Space
  transitions in the owning window module, including the pomodoro window.
- For movement or interaction changes, keep the window click-through by default
  with `setIgnoreMouseEvents(true, { forward: true })`, enable mouse events only
  over interactive elements, and set `isDragging` to pause `MovementSystem` and
  `InteractionSystem` while dragging.
- For game-loop and weather changes, catch step errors, synchronize sprite orientation
  on transitions, clamp or validate elapsed deltas across sleep/wake and system clock
  jumps, and keep `OfflineReturnSystem.lastVisibleTime` current when saving while
  visible. Strictly validate external metrics (`firstFiniteNumber`) against `0`
  coercion, and suppress wind particles during thunderstorms.
- For skins (`pet-asset://`), follow `docs/skin-pipeline-guide.md`, retain WebP
  naming, ensure sub-window HTML CSP `img-src` allows `pet-asset:`, and synchronize
  the gallery, protected loader, and three readmes.
- Preserve the skin preview-confirm workflow across `SkinService.js`,
  `SkinSwitchController`, and the selector window/preload. Preview with
  `isPreview: true` without persisting; confirm only the current successful load.
  Cancel or close must restore the confirmed skin, and stale load/confirmation
  results must not commit after another selection or a new session.

## Release and update workflow

When touching `updateManager.js`, `updateProgressPreload.js`, electron-builder,
release workflows, version metadata, or installer assets:

1. Trace both Windows and macOS paths, including signing/notarization and
   fullscreen/Space behavior where windows are involved.
2. Preserve downloaded-package integrity checks and explicit update error
   states; never treat a successful download as a verified release.
3. Run focused tests, then `npm test` for behavior changes. For packaging changes,
   run `npm run verify:installer` for Windows prerequisites, build with
   `npm run build` or the relevant platform's smoke-build command, then run
   `npm run verify:package` against the new `dist/**/app.asar` output. For Windows
   signing changes, use `npm run verify:signatures` (a PowerShell script);
   validate macOS signing/notarization on macOS using the release workflow checks.
4. Check release workflows (`.github/workflows/`): run `npm run protect:assets` before
   `electron-builder`, keep `retention-days: 7` on artifacts, and use `secrets['...']` bracket
   syntax with `# noinspection` comments to prevent CI quota and IDE check errors.
5. Document any platform-specific limitation or rollback step before declaring the change complete.

## Changelog ordering

- Add every new entry to the end of its category under `Unreleased`; never
  prepend it above earlier entries in that category.
- Within each version and category (`Added`, `Changed`, `Fixed`, `Removed`,
  `Security`), keep entries in implementation/commit order from oldest to
  newest. When backfilling or correcting a released version, reorder the
  complete affected category to that same order instead of mixing prepend and
  append styles.
- Use one category per change and merge related follow-up wording into its
  existing entry when appropriate; do not duplicate category headings.

## Verify each change

1. Complete one issue's test and documentation loop before starting the next.
   Add or update the focused test in `test/` for behavior changes; real Electron
   integration checks live in `test/e2e/`.
2. Run the focused Node test, then `npm test`. For documentation-only changes,
   verify the documented paths, commands, and invariants instead of adding tests
   that merely match wording.
3. Update `CHANGELOG.md` under `Unreleased` in Chinese and update the relevant
   structure/runtime documentation when behavior or architecture changes.
4. For security changes or complex refactors, provide manual verification steps
   for the affected behavior and report any platform checks not performed.
5. Review the diff for unintended changes. When commit/push is requested, use
   `.\push.ps1` on Windows or `./push.sh` on macOS/Linux so project safety checks
   run, with an atomic `<type>: <short description>` message and a body explaining why.
