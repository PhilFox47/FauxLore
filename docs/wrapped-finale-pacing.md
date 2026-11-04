# Finale Regie and content-responsive Wrapped pacing

## Scope

Story Mode's **editorial closing scene** now has a deliberate, issue-specific editorial job instead of being forced into a wistful summary. The separate final Achievement/Dungeon verdict screen and existing archived stories remain unchanged.

## P1: Specific, unpredictable editorial finales

For NEW AI-generated issues, the story director chooses one `finaleMode` based on the **actual narrative material**, not an ordered rotation:

- `dungeon-verdict`: unreasonably authoritative last judgment
- `sharp-reversal`: a supported change of perspective
- `ruthless-roast`: an earned, flamboyantly insulting joke
- `earned-sincerity`: an occasional serious or intimate moment
- `absurd-callback`: a surprising reuse of one specific earlier detail
- `unsettling-question`: a specific uncomfortable uncertainty
- `unexpected-connection`: a fresh link between verified moments
- `defiant-last-word`: the Dungeon AI doubles down

Every closing must provide `finalePayoff` (the NEW last thought) and `evidenceIds` containing a real source used in a surviving interior scene. `enforceWrappedFinale` is called **after** the thesis editor cuts weak interior scenes, preventing a closing from relying exclusively on a discarded subplot. Invalid finales are retried through the existing story-generation retry path. Stock titles like "Leave the light on", repeatable doorway/lamp/continuation conclusions and a finale that duplicates an interior thesis are rejected. The Dungeon AI can draw outrageous or unfair interpretations but not claim unlogged events as fact.

The same mode/payoff survives client normalization, server validation, SQLite JSON persistence and visual restyles. The separate Visual Director and closing image prompt receive the mode and may stage a theatrical verdict, comic roast, surprise, tense question or honest stillness, without defaulting to the same emotional afterglow or lonely horizon.

## P2: Length and scene count follows source material

`wrappedPacingBudget` estimates **editorial candidate strength**, not the count of Master Pages or progress entries. It groups repeated notes and ratings for the same medium into bounded distinct topic groups. It provides a *soft* total-scene suggestion plus the existing hard maxima (6 week, 9 month, 14 year), never a mandatory output count. The story editor may return just three scenes: hook, one meaningful insight, closing.

The prose directive allows a 15–35-word barb, a 45–85-word argument and a 90–165+-word documented emotional turning point when the evidence warrants it. The renderer scales typography and breathing room for longer content; there is no line clamp to silently discard text.

Monthly scope retains checks against falsely presenting the final week as the entire month. However, one substantial interior scene can contrast several phases, and a genuinely strong single personal memory need not reference otherwise mundane early-month progress just to satisfy a progress-volume quota. If multiple important personal moments occur in distinct phases, those phases remain important editorial evidence.

## Backwards compatibility and tests

Pre-v10 stored stories without `finaleMode` and `finalePayoff` remain readable and visual-only restyles preserve prose. These gates apply to NEW generation only.

- `src/lib/wrappedFinale.test.ts`: all modes, source requirements, stock-ending rejection, persistence and image regie.
- `src/lib/wrappedPacing.test.ts`: lean vs rich sources, varied body lengths, short cross-phase months and one strong Endwalker-style personal memory.
- Existing `wrappedCovers`, `wrappedSceneArt`, `wrappedVisualAction` and `wrappedEditorial` regression tests protect the art/structure, and the CI production build verifies integration.
