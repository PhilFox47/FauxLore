# Wrapped editorial quality: Personal Moments and Thesis Gate

## Goals

A Wrapped or Deep Dive must not mistake quantity for personal importance. A short, high-impact session or a handwritten journal about a shared experience should have a real chance to become the most substantial event of the period, regardless of Master Pages. A narrative slide should **make one point**, not simply re-list activity that was already logged.

## P0: Reflective Journal Thoughts and organizational Notes are DIFFERENT

- `logs.thoughts` = **Journal Thoughts**, intentionally written subjective reflections about the user's experience. Select and promote these before Master Pages, using explicit Impact and Moodlets to help the selection.
- `logs.note` = **Notes**, usually organizational bookmarks: issue/chapter/episode numbers, in-fiction encounters, companions, session landmarks. These can provide factual context but must NOT be treated as emotional opinions or inherently meaningful events. A Porcupine fight recorded in Notes does not show that it mattered to the player.
- `src/lib/personalMoments.ts` separately provides `selectPersonalMoments` (Journals ONLY) and `selectSessionContextNotes` (strictly capped organizational context). It never promotes Notes to personal writing based on length, plot-keyword mentions or Impact signals.
- `buildWrappedEvidence` reserves early evidence for reflective Journals. It **does not create** `reference-*` insight cards from Notes; up to 8 Notes for a week/month, 14 for a year, with a per-media cap, appear as `backgroundNotes` outside the citable Evidence Card collection. This prevents note-only slides and notes from expanding the story's pacing budget.
- Deep Dive uses the same distinction: a dedicated high-priority Journal reflection section and a tiny, separately labeled organizational Note appendix. The AI planner and writers are told to use notes only to clarify an independently meaningful argument.
- Monthly phase highlights select significant Journal Thoughts rather than automatically using the first two records. A large chronological pile of ordinary Notes cannot bury a late high-impact Journal.

### September regression

`src/lib/personalMoments.test.ts` supplies 160 ordinary Notes and two Endwalker sessions. It verifies that a real Journal from September 27 (MSQ finale with the entire FC, high Impact and Moving/Social) receives first-class editorial evidence, while even a detailed Note stays in the background. Explicit Moodlets and Impact remain sourced separately.

A separate Comic regression verifies that 'Porcupine fight' and specific Issue numbers are **not** citable insight cards. The Wrapped thesis gate rejects bare issue/plot inventories, and the AI prompt's evidence and background sections remain distinct.

`server/routes/logs.moodlets.test.ts` still verifies the real HTTP Notes-to-Journal editing and persistence path.

## P1: Claim-first editorial scenes

- Every **new** interior Wrapped scene is requested with `thesis`: an authored, specific editorial interpretation. It must cite 1–5 existing fact IDs and argue the point in its body.
- `curateWrappedTheses` runs **before** the expensive Visual Director and image work. It removes scenes with no point, bare counts, generic summaries, missing/unknown evidence anchors, and highly similar repeated theses.
- It may produce a shorter Wrapped; the goal of 3–5/4–7/6–11 scenes for week/month/year is **not a quota**. Minimum is opening + one substantial interior + closing. Existing chronology/period coverage and analytic/infographic safeguards are still enforced by `normalizeWrappedStory`.
- If no grounded interior remains, the generator requests a corrected draft through its existing retry rather than inventing a scene.
- `editorialThesis` is persisted in validated story scenes and preserved on restyles. Old saved stories without this field **remain backwards compatible**.
- Interpretations may be brazen, biased, funny, confidently uncharitable and thoroughly Dungeon-System-AI-like. They **cannot** turn fictional jabs into purportedly observed activity, statements or emotions.

### Limits

The local gate checks **structure**, source IDs and common filler patterns. It cannot semantically prove that every interpretation follows from its citation. The image/story writer still gets explicit instructions not to invent events. Actual live outputs require editorial inspection, especially if a future model takes the requested sarcasm as permission to fabricate.
