# ADR-036: CP Interaction Anti-Overlap Logic (CP 互动防交叠机制)

## Status
Accepted

## Date
2026-06-08

## Context
When pets trigger a "greeting" or "CP interaction" (e.g., sharing food, cultivating, kissing, hugging), they face each other and play their animation. The interaction triggers when the `distance` between their centers falls below `CONFIG.INTERACTION_DISTANCE` (180px) and the cooldown timer has expired.
However, because pets can walk freely or be dragged and dropped by the user, they can occasionally end up standing on the exact same X/Y coordinates when the cooldown expires. If they interact from exactly the same location (or very close X coordinates), their visuals heavily overlap, which looks visually broken and breaks immersion.

## Decision
We decided to implement a dynamic anti-overlap mechanism inside `InteractionSystem.js` and `app.js` specifically triggered at the start of an interaction.

1.  **Horizontal Separation (`InteractionSystem.js`)**:
    *   When an interaction triggers, the system checks the X-axis distance between the two pets.
    *   If their X distance is less than 80% of `pet.size` (i.e., less than ~76.8px), they are symmetrically pushed apart on the X-axis until they meet this minimum distance.
    *   This ensures they always stand comfortably face-to-face.

2.  **Boundary Clamping (`app.js`)**:
    *   Because the symmetric push might force a pet outside the visible screen bounds (if the interaction happens at the extreme edge of the screen), we immediately call `movementSystem.clampPetToWalkAreas(pet)` after the interaction is generated.
    *   This forces the pets back into the reachable bounds safely.
    *   After clamping, we perform a secondary check to guarantee they are still facing each other (in case the clamping inverted their left/right order).

## Alternatives Considered
*   **Rejecting interactions when too close**: We considered simply returning `null` from `InteractionSystem.update()` if they are too close. However, this would prevent interactions entirely if the user drags and drops one pet onto another (a common way users try to force an interaction).
*   **Gradual walking into position**: We considered forcing them to walk to predefined offsets before starting the interaction. While more realistic, it would significantly increase the complexity of the state machine (requiring a new `walking_to_interact` state) and delay the visual feedback of the interaction. The immediate snap-separation is lightweight and visually acceptable for a desktop pet.

## Consequences
*   **Positive**: Pets no longer overlap when interacting, regardless of how they were brought together (random walking, cooldown expiry, or manual drag-and-drop).
*   **Positive**: Interactions reliably occur even if users stack the pets intentionally.
*   **Negative**: There is a minor "teleport" effect if they are stacked exactly on top of each other when the cooldown expires, but it is small enough (usually < 38px) that it just looks like a quick hop into position.

## Testing Strategy
Added `test/interactionSystem.test.js` to simulate the worst-case scenario (exact coordinate overlap) and assert that the distance after `InteractionSystem.update()` satisfies the minimum X-distance threshold, and that their directions are correctly set to face each other.
