# Logging V2: factual progress + optional reflection

Logging is a two-step flow that separates **what happened** from **how the session felt and what it meant**.

## Step 1: session facts

Records progress, end date/time, location and proposed status change. **Save & Continue** writes the log and returns its ID. Status suggestions are automatic and manually overridable; the log survives an abandoned second step.

## Step 2: optional reflection

- **Session Enjoyment (1–5)**: how much fun or immediate satisfaction a session gave. Not a rating for the complete work.
- **Session Impact (1–5)**: how much the experience mattered or stayed with the user, independently from enjoyment. 1 can be very fun but fleeting; 5 can be frustrating yet unforgettable. Unrated means **unknown**, never zero/neutral.
- **Quick Moodlets (0–4, multi-select)**: fixed IDs with English labels and emojis: Moving, Funny, Frustrating, Immersed, Distracted, Unwinding, Exciting, Tense, Just Passing Time, Thought-Provoking, Social.
  - Immersed and Distracted describe noticeable focus states. No selected focus Moodlet is **not** evidence of normal focus.
  - Unwinding intentionally combines the old Comforting and Relaxing concepts.
  - Session tags describe one experience, **not** the user's permanent relationship with the work.
- **Notes** (`logs.note`): organizational context, episode/issue/race numbers. Not a journal.
- **Journal / Thoughts** (`logs.thoughts`): the user's own reflection.
- **AI question** (`logs.thoughtPrompt`): one optional session-specific prompt. Stored only when it accompanies a submitted journal response.
- **Review**: offered when the log changes the work to `Completed`, separate from the session ratings.

The second page can be skipped without loss of progress. All ratings, tags and reflections are optional. Existing log details allow later editing and clearing signals.

## Storage and validation

`logs.sessionImpact` is a nullable SQLite integer with a 1–5 check. `logs.moodlets` is nullable JSON containing only the fixed canonical IDs, at most four unique values. `ProgressLog.moodlets` is an array on the API; the backend validates input and decodes on read. The migration adds fields without assigning values to older logs.

## Editorial behavior

Deep Dive and Wrapped receive the same editorial signal analysis:

- **Consumption**: progress and Master Pages remain authoritative for *how much* was consumed, not *how important* it was.
- **Resonance**: explicit impact scores, Moodlets and journal writing supply optional personal reaction evidence.
- **Contrasts**: short high-impact sessions and long, explicitly low-impact sessions are good editorial candidates, but never obligatory plot points.

The story writer should consider qualitative candidates beyond the top three Master Page titles; the analytic charts still report real numeric rankings. Unrated/untagged older sessions have **unknown** reaction, not low impact, normal focus or indifference. Do not invent feelings or treat one session as a work-wide review.

## Automatic status

- Planning → Active when recording positive progress.
- Movie → Completed on watch.
- Book, audiobook, series, manga and comic → Completed on reaching a trustworthy total.
- Still-releasing series/manga/comics → Caught Up at the available amount; they may return to Active when more content arrives.
- Game and Visual Novel completion is ALWAYS manual, not inferred from estimated playtime.
- Audiobooks auto-complete ONLY with a confirmed full duration in `media.totalDurationHours`, not an average or guessed runtime.
- Historic undated progress cannot auto-change status. Manual user choice has precedence.

## Tests

`npm run test:logging`, `node --import tsx --test src/lib/quickMoodlets.test.ts src/lib/recapSalience.test.ts src/lib/wrappedEvidence.test.ts server/routes/logs.moodlets.test.ts`, `npm run build`.
