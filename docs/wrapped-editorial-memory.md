# Wrapped editorial memory & Dungeon editorial freedom

## Editorial memory across periods (P2)

The **Generate/Reroll Wrapped** action fetches a small, authenticated, read-only memory of previously saved Wrapped editorials from SQLite, separately from the period's verified evidence. Navigating the Recaps page or opening an old period does **not** request this memory, schedule text generation or launch image jobs.

**Calendar integrity:** an earlier Wrapped is eligible only when its period ends strictly *before* the target's start. Cross-granularity overlap is excluded: September's full-month Wrapped cannot read a week crossing August into September, and a September week overlapping the October month cannot be used as an earlier completed period. A rerun of the *exact* timeframe and ID may see its already-written version to avoid copying itself. ISO weeks, including week 53 and year-crossing weeks, are calculated explicitly in UTC calendar dates. A historical rerun never receives a genuinely later period's editorial. Data is restricted by the authenticated `userId` in SQL.

The server returns up to ten brief editorial snapshots, prioritized by shared media IDs and then period recency. Each provides former scene titles, written `editorialThesis` fields when present, legacy scene snippets otherwise, and a previous finale payoff. No image blobs, raw session histories, full account data, or unscoped users are returned. An archive lookup failure is nonfatal.

**Old AI opinions are not new facts.** The Director sees these as prior published takes it should NOT mechanically repeat. It can revisit a recurring work if there is a new development, offer a distinct interpretation, contradict its own previous opinion or make a specific callback. The only receipts for the current period remain its verified evidence cards. A conservative near-verbatim similarity check catches repeated previously published *explicit* theses and triggers the existing draft retry. Loose thematic similarity is not automatically banned: a genuinely new interpretation of the same work should be welcome.

No new SQL columns, scheduled work or copying of the old stories is necessary; previous Wrappeds are already saved. Older stories without `editorialThesis` supply weaker contextual summaries and are never hard-rejected solely for textual similarity.

## Opinionated Dungeon editorial voice (updated P3)

The chosen `dungeon-system` persona now has an explicit **Editorial License** in the Wrapped Writer, Deep Dive editorial planner **and** Deep Dive writer. The fictional AI may be magnificently self-important, furious at the player's media decisions, unfair in its interpretations, comically overconfident, profane, absurdly speculative, vindictive about a harmless game habit, and sometimes unexpectedly sincere. No mandatory hedges, forced fairness, hollow disclaimers or generic life lessons.

**The rule is evidence for actual events, freedom for the narrator's verdict.** A ludicrous statement about what a logged activity *means* is a Dungeon-theory, not an observed user motive. The AI may not invent a log, an event, a specific user quote, relationship, emotion or story spoiler. The editorial memory contains a previous narrator's opinion, not new primary evidence. Roasts target harmless habits and choices, not vulnerabilities.

Other personas remain selectable and receive only the general editorial advice to avoid reflexive hedging.

## Tests

- `src/lib/wrappedEditorialMemory.test.ts`: previous/same/future issue sorting, cross-granularity overlap, ISO year crossing, corrupted archives, legacy story, old-thesis similarity and genuinely distinct takes.
- `server/routes/wrapped.editorialMemory.test.ts`: authenticated SQL endpoint, account separation, read-only behavior and calendar scope.
- `src/services/editorialFreedom.test.ts`: inspect actual outgoing generation prompts for Wrapped, Deep Dive editor and Deep Dive writer; verify the selected persona is received by all.
- Workflow `wrapped-editorial-memory.yml`: tests plus the production build. Existing editorial and manual-generation tests must also remain green.

**Live quality:** prompt tests prove the model receives the prior take and the tone instructions. Whether a particular model develops a new and entertaining insight must be assessed from newly generated Wrappeds.
