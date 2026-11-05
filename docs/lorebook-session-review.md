# Lorebook: retrospective per-log editing

## Workflow

Open **Lorebook** and select a month (e.g. October 2026), optionally a media type and the **Needs Journal** filter. The progress counter shows how many logs have Journal Thoughts, Impact and Quick Moodlets.

Every progress session card shows individual written reflections, small separate organizational Notes, Impact and Moodlets. Select **Reflect / Edit log** (single-log) or **Review / Edit N logs** (session made of several stored logs). A multi-log session displays every underlying log by time and its own edit tab. Saving modifies **one selected log**, never all grouped session members. Use **Save & next** to move to the next underlying log in the same session.

The inline editor prioritizes **Journal Thoughts**, then the shared SessionReflectionSignals (enjoyment, personal impact and at most 4 Moodlets). Expand **Notes & log details** only when changing organizational Notes, timestamp, progress amount or location. The UI preserves both kinds of text in their original fields and does not automatically move or infer meaning from Notes.

Both **Cancel** and changing a month, search, media filter, or selected log warn before discarding unsaved changes. Saves disable switching, report a visible failure while retaining the draft, and show a success message after the normal MediaContext refresh. Saved Journal/Impact/Moodlets are immediately available to future Recaps/Wrappeds, but **old generated output is not silently rewritten**. Generate a fresh Recap/Wrapped after reviewing the period.

## Technical boundaries

- Reuses the existing authenticated `MediaContext.updateLog` → `DatabaseService.updateProgressLog` → `PUT /api/logs/:id` chain, with no new table, mutation endpoint or AI request.
- `lorebookDraftChanges` only sends fields that actually changed. Adding a thought does not round timestamp precision, adjust progress, change location, modify status or advance an artifact. Existing server account-scoping remains intact.
- The Lorebook groups consecutive same-media logs within six hours for reading, but editing is always per original log ID. Automatic `statusChange` records are displayed read-only.
- The review filter uses **Journal Thoughts existence**, not a mandatory rating; missing Journal does not mean a bad experience. Missing Impact or Moodlets is also not considered a negative judgment.
- The month selector is based on actual logged local calendar dates. The full timeline remains available through **All months**.
- An interrupted edit keeps its local draft until the user explicitly cancels, changes context with confirmation, or successfully saves.

## Verification

`src/lib/lorebookEditing.test.ts` covers month navigation, independent Journal signals, precise reflection-only patches, deleting/clearing ratings, invalid metadata, the 6-hour multi-log session and server-side rendering of the shared reflection form. Existing log API tests verify Journal, Impact, Moodlets and user isolation. The Lorebook CI workflow includes a feature-scoped TypeScript compiler gate, existing tests and a production build.
