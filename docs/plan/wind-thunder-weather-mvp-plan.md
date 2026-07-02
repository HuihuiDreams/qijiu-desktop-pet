# Implementation Plan: Wind and Thunder Weather MVP

> Status: Proposed  
> Last updated: 2026-07-02

## Overview

This MVP enriches the existing weather feature with local, low-distraction wind and thunderstorm atmosphere. The app should prefer ambience over meteorological precision: strong wind adds pet-local wind streak particles, and thunderstorm keeps rain particles while occasionally flashing small lightning near each pet. Weather still remains optional, private, cached by the main process, and consumed by the renderer only as normalized state.

## Goals

- Add wind and thunderstorm visual effects without changing pet movement or interaction behavior.
- Add wind and thunderstorm idle chatter for both pets and all supported locales.
- Keep effects local to pet positions and compatible with existing skins.
- Preserve the current graceful fallback behavior when Open-Meteo is unavailable or returns malformed data.

## Non-goals

- Do not add full-screen flashes, screen filters, warnings, notifications, or sound.
- Do not make wind push pets, alter pathfinding, or change nurture stats.
- Do not add per-skin weather sprites, umbrellas, capes, or required weather assets.
- Do not build a full combination matrix for every weather plus time plus intensity state.
- Do not add a second weather provider or a user-facing weather dashboard.

## Architecture Decisions

- Treat thunderstorm as a primary `weatherKind` for dialogue and body dataset semantics, but render it as rain plus a local lightning overlay.
- Treat wind as a lightweight atmosphere state: clear/cloudy plus strong wind can become `windy`; rain/snow/thunderstorm can carry wind through `windIntensity` without changing the primary precipitation kind.
- Keep the external API boundary in `weatherSyncService.js`; renderer code must not access raw Open-Meteo responses.
- Use bounded DOM/CSS particles in `WeatherParticleLayer`, matching the current rain/snow approach and applying `scaleRatio`.
- Keep debug injection available through `window.__DEBUG_WEATHER` so manual QA can force `windy` and `thunderstorm` states.

## Dependency Graph

```text
Open-Meteo payload normalization
    |
    v
Renderer weather state parsing
    |
    +--> Dialogue weather keys
    |
    v
WeatherParticleLayer DOM model
    |
    v
CSS visual effects
    |
    v
Manual QA and documentation
```

## Task List

### Phase 1: Weather Contract Foundation

## Task 1: Normalize Wind Fields in Weather Payload

**Description:** Extend the main-process weather payload to include sanitized wind speed, wind direction, and wind gust fields from Open-Meteo. Prefer the modern `current=` query shape if it can be introduced without breaking existing tests; otherwise support both `current_weather` and `current` response shapes during the transition.

**Acceptance criteria:**
- [x] `fetchWeather()` returns `windSpeed`, `windDirection`, and `windGusts` as numbers or `null`.
- [x] Out-of-range or malformed wind values are discarded at the main-process boundary.
- [x] Existing temperature, `weatherCode`, `isDay`, fallback, cache, and timeout behavior remain unchanged.

**Verification:**
- [x] Focused tests pass: `node --test test/weatherSyncService.test.js`
- [x] Add or update tests for valid wind fields and malformed wind fields.

**Dependencies:** None

**Files likely touched:**
- `weatherSyncService.js`
- `test/weatherSyncService.test.js`

**Estimated scope:** Small: 2 files

## Task 2: Map Thunderstorm and Wind State in Renderer

**Description:** Update `WeatherAwarenessSystem` so thunderstorm codes become `thunderstorm`, strong wind can become `windy` when there is no stronger precipitation state, and precipitation states can carry a separate `windIntensity`.

**Acceptance criteria:**
- [x] WMO codes `95`, `96`, and `99` map to `thunderstorm`.
- [x] Strong wind or gusts can produce `weatherKind: 'windy'` for clear/cloudy baseline weather.
- [x] Rain, snow, and thunderstorm keep their primary weather kind while exposing `windIntensity`.
- [x] `isKnownWeatherKind()` accepts `windy` and `thunderstorm`.

**Verification:**
- [x] Focused tests pass: `node --test test/weatherAwarenessSystem.test.js test/timeWeatherRendererIntegration.test.js`
- [x] Add or update tests for thunderstorm codes, windy clear/cloudy weather, and wind-over-rain behavior.

**Dependencies:** Task 1

**Files likely touched:**
- `src/systems/WeatherAwarenessSystem.js`
- `test/weatherAwarenessSystem.test.js`
- `test/timeWeatherRendererIntegration.test.js`

**Estimated scope:** Medium: 3 files

### Checkpoint: Contract

- [x] Weather service tests pass.
- [x] Weather awareness tests pass.
- [x] Renderer state remains backward-compatible with old payloads that do not include wind fields.

### Phase 2: Visual Effects

## Task 3: Add Wind Particles to WeatherParticleLayer

**Description:** Extend `WeatherParticleLayer` to render bounded wind streak particles for `weatherKind: 'windy'` and for precipitation states with `windIntensity` above `none`.

**Acceptance criteria:**
- [x] Wind-only weather creates local wind particle groups near each visible pet.
- [x] Rain/snow with wind retains precipitation particles and adds wind styling or a bounded secondary wind layer.
- [x] Particle counts remain capped and stable across repeated `sync()` calls.
- [x] Hidden pets, `visible: false`, and inactive weather still clear particles immediately.

**Verification:**
- [x] Focused tests pass: `node --test test/weatherParticleLayer.test.js test/weatherParticleStability.test.js`
- [x] Add or update tests for `windy`, wind-over-rain, and layer reuse.

**Dependencies:** Task 2

**Files likely touched:**
- `src/ui/WeatherParticleLayer.js`
- `test/weatherParticleLayer.test.js`
- `test/weatherParticleStability.test.js`

**Estimated scope:** Medium: 3 files

## Task 4: Add Local Thunderstorm Lightning CSS

**Description:** Add CSS and DOM hooks for short, pet-local lightning flashes during thunderstorm weather. Thunderstorm should visually read as rain plus occasional lightning, not as a full-screen storm overlay.

**Acceptance criteria:**
- [x] Thunderstorm creates rain particles and local lightning elements within each pet weather group.
- [x] Lightning is low-frequency, short-lived, and does not cover the whole transparent window.
- [x] `prefers-reduced-motion: reduce` disables the animated weather layer consistently.
- [x] Existing rain and snow visuals remain unchanged unless wind is present.

**Verification:**
- [x] Focused tests pass: `node --test test/weatherParticleLayer.test.js test/weatherVisualScope.test.js`
- [ ] Manual check via debug weather state confirms lightning stays around pets.

**Dependencies:** Task 3

**Files likely touched:**
- `src/ui/WeatherParticleLayer.js`
- `src/effects.css`
- `test/weatherParticleLayer.test.js`
- `test/weatherVisualScope.test.js`

**Estimated scope:** Medium: 4 files

### Checkpoint: Visual

- [x] Weather particle tests pass.
- [x] Visual scope tests confirm weather effects remain local and non-interactive.
- [ ] Manual debug states for `windy` and `thunderstorm` do not interfere with click-through or interaction hover behavior.

### Phase 3: Dialogue and Debugging

## Task 5: Add Wind and Thunderstorm Dialogue Pools

**Description:** Add `weather_windy` and `weather_thunderstorm` dialogue entries for Yueqi and Shenjiu in the fallback dialogue table and all locale dictionaries.

**Acceptance criteria:**
- [x] Chinese fallback includes both new weather dialogue keys.
- [x] `zh`, `en`, and `ja` dictionaries include matching keys for both pets.
- [x] Existing `DialogBubble.showIdleChatter()` can use the new keys without new branching.
- [x] Debug weather dialogue helper works for `windy` and `thunderstorm`.

**Verification:**
- [x] Focused tests pass: `node --test test/i18nKeyCompleteness.test.js test/i18nFallback.test.js test/dialogBubble.test.js`
- [x] Add or update tests that assert the new dialogue keys exist.

**Dependencies:** Task 2

**Files likely touched:**
- `src/data/dialogues.js`
- `src/data/i18n.js`
- `test/i18nKeyCompleteness.test.js`
- `test/dialogBubble.test.js`

**Estimated scope:** Medium: 4 files

## Task 6: Expand Debug Weather Injection

**Description:** Make the existing `window.__DEBUG_WEATHER` helper able to force `windy`, `thunderstorm`, and wind-over-rain states for manual QA without waiting for real weather.

**Acceptance criteria:**
- [x] Debug helper can set `weatherKind: 'windy'`.
- [x] Debug helper can set `weatherKind: 'thunderstorm'`.
- [x] Debug helper can set rain with non-`none` `windIntensity`.
- [x] Debug helper cleanup still clears particles and resets weather state.

**Verification:**
- [x] Focused tests pass: `node --test test/debugTools.test.js test/timeWeatherRendererIntegration.test.js`
- [ ] Manual check in DevTools: `window.__DEBUG_WEATHER.force('windy')` or equivalent documented helper works.

**Dependencies:** Tasks 2, 3, and 4

**Files likely touched:**
- `src/app.js`
- `test/debugTools.test.js`
- `test/timeWeatherRendererIntegration.test.js`

**Estimated scope:** Small: 2-3 files

### Checkpoint: Dialogue and Debug

- [x] Weather dialogue keys are complete across locales.
- [x] Debug helpers can force every MVP state.
- [x] Weather chatter probability and fallback behavior are unchanged.

### Phase 4: Documentation and Final Verification

## Task 7: Update Architecture Documentation and Changelog

**Description:** Document the new weather states, the wind/thunderstorm rendering boundary, and the API payload extension. Add a changelog entry under the required headings.

**Acceptance criteria:**
- [x] `docs/structure.md` mentions `windy`, `thunderstorm`, local lightning, and wind particles.
- [x] ADR-038 is updated if the API contract or provider query shape changes materially.
- [x] `CHANGELOG.md` includes entries under `Added` and/or `Changed`.

**Verification:**
- [x] Documentation links remain valid.
- [x] ADR check passes if ADR files are touched: `node --test test/checkAdrsScript.test.js`

**Dependencies:** Tasks 1-6

**Files likely touched:**
- `docs/structure.md`
- `docs/decisions/ADR-038-weather-sync.md`
- `CHANGELOG.md`
- `test/checkAdrsScript.test.js` only if needed

**Estimated scope:** Small: 2-3 files

## Task 8: Run Focused and Full Validation

**Description:** Run the focused weather, i18n, debug, and visual scope tests, then run the full project test suite. Perform a short manual visual QA pass in Electron if the environment supports it.

**Acceptance criteria:**
- [x] Focused weather tests pass.
- [x] Full `npm test` passes.
- [ ] Manual QA confirms wind and thunderstorm effects stay near pets and do not block mouse passthrough.
- [x] No long-lived extra DOM nodes appear after weather is disabled or pets are hidden.

**Verification:**
- [x] `node --test test/weatherSyncService.test.js test/weatherAwarenessSystem.test.js test/weatherParticleLayer.test.js test/weatherParticleStability.test.js test/weatherVisualScope.test.js test/timeWeatherRendererIntegration.test.js test/dialogBubble.test.js test/i18nKeyCompleteness.test.js test/debugTools.test.js`
- [x] `npm test`
- [ ] Optional manual: `npm run dev`

**Dependencies:** Tasks 1-7

**Files likely touched:**
- None expected unless verification finds issues

**Estimated scope:** Small: validation only

### Checkpoint: Complete

- [x] All non-manual task acceptance criteria are met.
- [x] Focused and full tests pass or any failures are documented with root cause.
- [ ] Manual visual QA confirms the feature is atmospheric, local, and non-disruptive.
- [ ] Ready for review before commit.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Open-Meteo response shape differs between `current_weather` and `current` | Medium | Support both shapes during normalization and cover both with tests. |
| Wind thresholds feel too eager or too rare | Medium | Start with conservative thresholds, keep debug override, and tune visually before adding more logic. |
| Lightning feels distracting | Medium | Keep lightning local, brief, low-opacity, and disabled by reduced-motion settings. |
| Particle layer becomes too complex | Medium | Keep bounded counts, reuse the existing layer lifecycle, and avoid nested weather system abstractions. |
| Dialogue keys drift across locales | Low | Use i18n completeness tests and keep new keys in the existing dictionary shape. |
| Weather effects interfere with mouse passthrough | High | Preserve `pointer-events: none`, keep effects in the existing weather layer, and verify visual scope tests. |

## Parallelization Opportunities

- After Task 2 defines the renderer state contract, Task 5 dialogue additions can be done in parallel with Task 3 visual particles.
- Task 7 documentation can begin after the implementation direction is stable, but final changelog wording should wait until behavior is verified.
- Task 8 must be sequential and last.

## Open Questions

- What exact wind thresholds should ship? Shipped ambience-first thresholds: wind speed >= 19.8 km/h (5.5 m/s) or gusts >= 28.8 km/h (8.0 m/s) for `windy`, with `heavy` at wind speed >= 28.8 km/h (8.0 m/s) or gusts >= 45 km/h (12.5 m/s).
- Should thunderstorm with snow-like codes `96` and `99` visually prefer rain plus lightning, or snow plus lightning in cold conditions? MVP recommendation: always rain plus lightning for readability.
- Should `windIntensity` be exposed on `document.body.dataset` for CSS-only hooks, or kept inside `WeatherParticleLayer` state only? MVP recommendation: keep it inside the particle layer unless CSS selectors need it.
