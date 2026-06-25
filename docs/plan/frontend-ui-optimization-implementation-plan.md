# Frontend UI Optimization Implementation Plan
> Status: Revised
> Date: 2026-06-25
> Related ADRs: [ADR-033](../decisions/ADR-033-frontend-ui-engineering-and-color-swap.md), [ADR-034](../decisions/ADR-034-ui-performance-and-visual-upgrades.md), [ADR-039](../decisions/ADR-039-city-setting-ui-window.md)

## Overview
This plan applies the `frontend-app-builder` approach to the current Electron desktop pet project without migrating away from vanilla HTML, JavaScript, and CSS. The goal is to make the pet overlay, context menu, status panel, Pomodoro window, city setting window, and update progress window feel like one coherent product while preserving the existing transparent-window, mouse pass-through, multi-display, DPI, i18n, and Electron security boundaries.

The work should be implemented as small, verifiable slices. Do not introduce React, Tailwind, Sass, or a new bundler. Keep shared UI foundations in native CSS custom properties and small renderer helpers only where they reduce real duplication.

## Architecture Decisions
- Keep the current Electron renderer architecture: `main.js` owns windows and IPC, `preload.js` exposes safe APIs, and `src/` owns renderer UI and game systems.
- Treat readable text and encoding cleanup as the first UI quality gate. Several static fallback strings in HTML/docs currently render as mojibake; visual polish should not be built on unreadable copy.
- Use `src/index.css` as the source of shared design tokens for now, then let component/window CSS consume those tokens. Add a separate shared CSS file only if `index.css` becomes harder to reason about after token cleanup.
- Preserve strict CSP in child windows. Do not add inline scripts or unsafe renderer Node access.
- Preserve Electron transparent-window constraints from ADR-034: avoid relying on `backdrop-filter` to blur the OS desktop under transparent windows.

## Task List

### Phase 1: Text, Encoding, and Baseline Audit

#### Task 1: Audit visible fallback text and encoding-sensitive metadata
**Description:** Identify all user-visible mojibake in static HTML, package metadata, docs touched by UI work, and i18n fallback paths. Produce a focused list before editing so the implementation does not mix copy repair with visual refactors.

**Acceptance criteria:**
- [x] Static visible text in `src/*.html` is inventoried.
- [x] `package.json` display metadata and relevant docs are checked for mojibake.
- [x] The plan for corrected zh/en/ja copy is explicit before editing.

**Verification:**
- [x] Run `node --test test/i18n.test.js test/i18nKeyCompleteness.test.js`.
- [ ] Manually inspect pet overlay, Pomodoro, city setting, status, and update windows for unreadable fallback text.

**Dependencies:** None

**Estimated scope:** Small

#### Task 2: Repair static UI fallback text without changing behavior
**Description:** Replace mojibake fallback text in HTML and metadata with readable UTF-8 text that matches existing i18n keys. Do not change IPC names, DOM IDs, or renderer behavior.

**Acceptance criteria:**
- [x] `src/index.html`, `src/pomodoro.html`, and `src/city-setting.html` fallback text is readable.
- [x] `package.json` product/display strings are readable where they are user-facing.
- [x] Existing `data-i18n`, `data-i18n-title`, and `data-i18n-placeholder` attributes remain intact.

**Verification:**
- [x] Run `npm test`.
- [ ] Launch `npm run dev` and confirm no fallback text appears corrupted before i18n replacement completes.

**Dependencies:** Task 1

**Estimated scope:** Medium

### Checkpoint: Readability Gate
- [x] All tests pass.
- [x] No user-visible fallback text in primary windows is mojibake.
- [x] No Electron security settings were weakened.

### Phase 2: Shared Design System Foundation

#### Task 3: Normalize shared CSS tokens
**Description:** Review existing tokens in `src/index.css` and make them complete enough for all current windows: panel surfaces, borders, shadows, typography, control sizes, focus rings, semantic feedback colors, spacing, and motion durations.

**Acceptance criteria:**
- [x] Shared tokens cover panels, buttons, inputs, icon buttons, status messages, and tooltips.
- [x] Existing character color semantics remain aligned with ADR-033.
- [x] Token names are semantic and reusable; no window-specific token leaks into global naming.

**Verification:**
- [x] Run focused CSS source checks by extending existing window tests where helpful.
- [ ] Manually compare context menu, status panel, Pomodoro, and city setting surfaces for consistent color and spacing language.

**Dependencies:** Task 2

**Estimated scope:** Medium

#### Task 4: Define reusable native CSS component classes
**Description:** Add or consolidate native CSS classes for common controls used across windows: panel shell, titlebar, icon button, primary button, ghost button, text input, status feedback, and tooltip. Keep class names simple and opt-in so existing window styles can migrate incrementally.

**Acceptance criteria:**
- [x] Shared classes are documented by usage in CSS comments or a short docs note.
- [x] The classes work under the existing strict CSP.
- [x] Existing window-specific styles can override layout without copying full visual treatment.

**Verification:**
- [x] Run `npm test`.
- [ ] Inspect computed styles for at least one button, one input, one titlebar, and one feedback message.

**Dependencies:** Task 3

**Estimated scope:** Medium

### Checkpoint: Foundation Gate
- [x] Shared tokens/classes exist and are used by at least one migrated window.
- [x] No new dependency or build step was added.
- [ ] The transparent pet overlay still renders correctly.

### Phase 3: Stability-First Window Work

> Revision note: after the status window regression, this phase is no longer a broad visual alignment pass. Treat existing working UI as the baseline. Only change a window when there is a concrete defect, overflow, readability issue, or security/maintainability problem.

#### Task 5: Freeze the current working UI baseline
**Description:** Capture the current accepted visual state before doing any further UI work. The goal is to make "do not make it worse" testable, especially for Electron child windows that share global CSS.

**Acceptance criteria:**
- [ ] List the windows and overlay surfaces that are currently considered acceptable: pet overlay, context menu, status panel, Pomodoro, city setting, status window, and update progress.
- [ ] Record known sensitive selectors such as `.stat-*`, `.status-*`, `.context-menu-*`, and any selectors shared between `index.css` and child-window CSS.
- [ ] Define the rule that child-window fixes must use window-scoped selectors, for example `.status-panel .stat-label`, instead of relying on global class overrides.

**Verification:**
- [ ] Run `npm test`.
- [ ] Manual check: open the status window in English and confirm labels, bars, and values do not overlap and the window is not excessively wide.

**Dependencies:** Task 4

**Estimated scope:** Small

#### Task 6: Fix city setting and Pomodoro only when a concrete defect exists
**Description:** Do not migrate city setting or Pomodoro merely to make them more visually consistent. Touch these windows only for a reported issue such as clipping, overflow, unreadable text, broken state styling, or unsafe duplication.

**Acceptance criteria:**
- [ ] Each change starts from a named bug or visual defect.
- [ ] Edits stay inside the affected window's HTML/CSS/renderer files unless a shared helper is demonstrably necessary.
- [ ] zh/en/ja text still fits in the affected state after the fix.

**Verification:**
- [ ] For city setting defects, run `node --test test/citySettingWindow.test.js test/citySettingI18n.test.js test/citySettingTray.test.js`.
- [ ] For Pomodoro defects, run `node --test test/pomodoroWindow.test.js test/pomodoroSystem.test.js test/pomodoroI18n.test.js test/pomodoroTray.test.js`.
- [ ] Manual check only the affected workflow before and after the change.

**Dependencies:** Task 5

**Estimated scope:** Small to Medium per defect

#### Task 7: Guard overlay UI instead of redesigning it
**Description:** Freeze the context menu, status panel, and dialog bubble unless a specific problem is found. These surfaces are high-risk because they interact with mouse pass-through, transparent windows, scale ratio behavior, and global CSS.

**Acceptance criteria:**
- [ ] No broad restyle of context menu, status panel, or dialog bubble is done for visual consistency alone.
- [ ] Any overlay fix preserves mouse pass-through, hover-only interactivity, drag behavior, anti-overlap constraints, and `scaleRatio`.
- [ ] Overlay CSS changes use scoped selectors and include regression checks for the exact failure mode.

**Verification:**
- [ ] Run relevant focused tests: `node --test test/contextMenuBehavior.test.js test/contextMenuPosition.test.js test/dialogBubble.test.js test/petRenderer.test.js test/mainMousePassthrough.test.js`.
- [ ] For status panel defects, also run `node --test test/statusWindowLayout.test.js test/htmlInjectionHardening.test.js`.
- [ ] Manual check: right-click menu, status panel, pet interactions, drag, and hover behavior on normal and high-DPI displays when available.

**Dependencies:** Task 5

**Estimated scope:** Small to Medium per defect

#### Task 8: Keep utility-window changes defect-driven
**Description:** Status and update progress windows should receive only targeted fixes for readability, layout, security, or broken feedback states. Do not apply a new panel/control language unless the user explicitly approves a redesign.

**Acceptance criteria:**
- [ ] Status window metrics remain compact and stable across zh/en/ja.
- [ ] Update progress renderer continues to use safe DOM APIs and strict preload IPC.
- [ ] Any cache-busting query change is paired with a reason, such as preventing stale child-window CSS.

**Verification:**
- [ ] Run `node --test test/updateProgressSecurity.test.js test/updateManager.test.js` for update-window changes.
- [ ] Run `node --test test/statusWindowLayout.test.js` for status-window layout changes.
- [ ] Manual check only the affected utility window.

**Dependencies:** Task 5

**Estimated scope:** Small per defect

### Checkpoint: Stability Gate
- [ ] No UI work proceeds without a named defect or explicit user-approved redesign.
- [ ] The changed window is manually checked in the language/layout that motivated the change.
- [ ] Shared/global CSS changes are avoided unless they are smaller and safer than a scoped fix.
- [ ] `npm test` and relevant focused tests pass.

### Phase 4: Visual QA, Assets, and Documentation

#### Task 9: Add repeatable visual QA checklist
**Description:** Document the manual visual QA flow for transparent windows, multi-display, DPI, motion, and window-specific interactions. This replaces broad visual alignment as the main remaining UI quality work.

**Acceptance criteria:**
- [ ] QA checklist covers pet overlay, context menu, status panel, Pomodoro, city setting, status window, and update progress.
- [ ] Checklist includes desktop background readability, high-DPI, multi-display, drag, hover, reduced motion, language switching, and window reopening after CSS changes.
- [ ] Checklist references focused tests and notes which checks require manual Electron verification.

**Verification:**
- [ ] Checklist can be followed from a fresh checkout with `npm test` and `npm run dev`.

**Dependencies:** Task 5

**Estimated scope:** Small

#### Task 10: Review sprite and UI asset consistency only for defects
**Description:** Confirm that current pet assets, icon assets, and window images remain complete and unclipped. Do not redraw, regenerate, or restyle assets unless an actual asset defect is found.

**Acceptance criteria:**
- [ ] Current skin assets remain complete under `src/assets/{skinId}`.
- [ ] Pomodoro setup/running/completed images are centered and not clipped.
- [ ] App icons and window controls are not blurry, clipped, or inconsistent in the checked windows.

**Verification:**
- [ ] Run `node --test test/assetDimensions.test.js test/pngColorProfile.test.js test/skinManager.test.js test/skinRendererIntegration.test.js`.
- [ ] Manual screenshot comparison only when an asset-facing change is made.

**Dependencies:** Task 5

**Estimated scope:** Small

#### Task 11: Update docs and changelog
**Description:** Record the revised UI strategy and any completed defect fixes. Add an ADR only if implementation introduces a new durable architectural decision beyond the existing ADR-033/034/039 direction.

**Acceptance criteria:**
- [ ] `CHANGELOG.md` is updated under `Changed` or `Fixed` for shipped UI behavior changes.
- [ ] `docs/structure.md` is updated if file ownership or shared CSS structure changes.
- [ ] This plan and the Chinese plan stay synchronized when the strategy changes.

**Verification:**
- [ ] Run `npm test` when behavior or source files changed.
- [ ] Run any docs/ADR checks already used by the project scripts if available.

**Dependencies:** Tasks 9 and 10, or any completed defect fix that is ready to ship

**Estimated scope:** Small

### Final Checkpoint
- [ ] `npm test` passes.
- [ ] Focused tests pass for every changed window or overlay surface.
- [ ] Manual Electron QA passes for the changed workflow and language.
- [ ] No renderer uses direct Node APIs.
- [ ] No strict CSP is weakened.
- [ ] `CHANGELOG.md` and relevant docs are updated before commit.

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Broad shared CSS changes regress already-good windows | High | Prefer scoped child-window selectors and defect-driven edits; avoid global selector changes such as `.stat-*` unless explicitly required. |
| Transparent Electron windows make glass/blur effects unreliable | High | Use opaque-enough panel backgrounds, borders, and inset shadows instead of depending on OS desktop blur. |
| i18n strings overflow compact windows | Medium | Verify zh/en/ja only on the affected window and keep titlebar/button text truncation deliberate. |
| Token cleanup becomes a broad redesign | Medium | Treat Phase 2 tokens as a foundation, not a mandate to restyle every window. Defer visual consistency work unless the user explicitly approves it. |
| Documentation remains mojibake | Medium | Treat docs touched by this work as UTF-8 and repair only the relevant plan/structure/changelog sections needed for this UI effort. |

## Parallelization Opportunities
- Task 9 can be done independently because it is documentation and QA process work.
- Task 10 can run independently if it remains read-only or defect-report-only.
- Do not parallelize defect fixes that touch shared CSS, overlay behavior, or the same child window.

## Out of Scope
- No framework migration to React/Vite.
- No new package dependency for styling, icons, animation, or screenshots.
- No changes to game logic, nurture formulas, movement behavior, weather sync, meeting auto-hide, or update network behavior except where UI verification exposes a direct regression.
- No new generated pet art unless a concrete asset defect is identified during Task 10.

## Open Questions
- Should the old mojibake `docs/plan/ui-optimization-proposal-plan.md` be repaired, archived, or left as historical context after this plan is accepted?
- Should a future ADR supersede ADR-033/034 if shared component classes become a formal project convention?
