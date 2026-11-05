# Wrapped Longitudinal Research

## Goal
A monthly Wrapped can explore meaningful long-running media journeys instead of only seeing a short predetermined shortlist of Journal Thoughts. Its subject remains the selected period.

## Pipeline
The manual Generate/Reroll action in src/pages/Recaps.tsx:

1. Builds the normal period evidence. All distinct authored Journal Thoughts can become verified evidence cards. Current-period cards remain the source of exact charts, scene references and user quotes.
2. Builds expanded context in src/lib/wrappedResearchContext.ts: full current-period logs, the prior four calendar months of logs, previously experienced Universe groups, and five preceding non-overlapping Deep Dive Recap stories including their original writing.
3. Loads the previous Saved Wrapped editorial memory through the existing authenticated endpoint, now containing complete **text-only** scene scripts. Up to five previous scripts are provided, alongside the existing shorter memory.
4. Runs a separate archival research AI pass. The model selects up to six current-period media that warrant full lifetime research, based on personal significance, changes and continuity rather than only progress volume.
5. Loads every valid log for the selected titles from their first recorded encounter through the target period end. It also supplies prior recorded reflections from previously experienced works in the same Universes.
6. Calls the independent Wrapped Story Director with verified evidence cards, expanded original context, archival research hypothesis and prior editorial memories. Existing scene validation, visual direction and image generation are unchanged.

The research call is optional. If it fails, the story still receives full current and four-month history, the old editorial scripts, and full histories for up to six evidence-ranked titles. One additional model call and the enlarged writing prompt increase token usage.

## Time and trust boundaries
- All historical logs are capped at the target period end, following the app's existing shifted 05:00 day boundary.
- Previous Deep Dives and Wrappeds are used only from entirely earlier non-overlapping calendar periods. A previous version of the SAME Wrapped may be editorial anti-repetition memory, not factual evidence.
- Older dated Logs / Thoughts can establish an older event, but must not be turned into a new current-period event.
- Prior AI-written Recaps and Wrappeds are fallible interpretations, never evidence of user behavior.
- Only Universe members with recorded sessions before the period cutoff are included. Unplayed future items are excluded.
- The existing Recaps behavior of excluding isHistoric/import-marked logs is retained.

## Testing
Use: node --import tsx --test src/lib/wrappedResearchContext.test.ts src/lib/wrappedEvidence.test.ts src/lib/wrappedEditorialMemory.test.ts

The Wrapped Personal Evidence and Thesis Quality workflow runs the new context regression tests plus a production build.
