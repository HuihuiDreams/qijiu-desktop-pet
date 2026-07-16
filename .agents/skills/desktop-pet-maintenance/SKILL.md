---
name: desktop-pet-maintenance
description: Maintain or debug the DeskPet Electron app. Use when changing its renderer game loop, transparent-window behavior, preload IPC boundary, skin pipeline, desktop interaction, display/DPI handling, release packaging, automatic updates, or related tests and documentation.
---

# DeskPet Maintenance

Read the repository `AGENTS.md` before changing code. Keep work scoped to the
requested behavior and preserve the main/preload/renderer boundary.

## Choose the owning layer

- Put native windows, tray behavior, `electron-store`, and privileged IPC
  validation (`sender.id` check + `app.openSkinSelectorForQA` QA hook) in `main.js`.
- Expose only safe renderer-facing APIs from `preload.js`; do not use Node APIs
  directly in `src/`.
- Keep game state, animation, UI, and rendering in `src/`.

## Protect desktop-pet behavior

- For window bounds or multiple displays, use `displayBounds.js` and retain the
  existing `displayFit.js` debounce/refit flow. Apply `scaleRatio` to pet,
  menus, and effects consistently.
- For movement or interaction changes, keep the window click-through by default
  and pause `MovementSystem` and `InteractionSystem` while dragging.
- For game-loop and weather changes, catch step errors, synchronize sprite orientation
  on transitions, clamp elapsed-time (`lastVisibleTime`), strictly validate external
  metrics (`firstFiniteNumber`) against `0` coercion, and suppress wind particles during thunderstorms.
- For skins (`pet-asset://`), follow `docs/skin-pipeline-guide.md`, retain WebP
  naming, ensure sub-window HTML CSP `img-src` allows `pet-asset:`, and synchronize
  the gallery, protected loader, and three readmes.

## Release and update workflow

When touching `updateManager.js`, `updateProgressPreload.js`, electron-builder,
release workflows, version metadata, or installer assets:

1. Trace both Windows and macOS paths, including signing/notarization and
   fullscreen/Space behavior where windows are involved.
2. Preserve downloaded-package integrity checks and explicit update error
   states; never treat a successful download as a verified release.
3. Run the smallest applicable checks first: `npm test`, then
   `npm run verify:installer` and `npm run verify:signatures` when packaging or
   signing changes, and `npm run build` for builder configuration changes.
4. Check release workflows (`.github/workflows/`): run `npm run protect:assets` before
   `electron-builder`, keep `retention-days: 7` on artifacts, and use `secrets['...']` bracket
   syntax with `# noinspection` comments to prevent CI quota and IDE check errors.
5. Document any platform-specific limitation or rollback step before declaring the change complete.

## Verify each change

1. Add or update the focused test in `tests/` for behavior changes.
2. Run the focused Node test, then `npm test` when practical.
3. Update `CHANGELOG.md` under `Unreleased` in Chinese and update the relevant
   structure/runtime documentation when behavior or architecture changes.
4. Review the diff for unintended changes before committing or using the
   project push script.
