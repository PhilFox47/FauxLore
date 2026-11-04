# Wrapped editorial quality: Personal Moments and Thesis Gate

## Goals

A Wrapped or Deep Dive must not mistake quantity for personal importance. A short, high-impact session or a handwritten journal about a shared experience should have a real chance to become the most substantial event of the period, regardless of Master Pages. A narrative slide should **make one point**, not simply re-list activity that was already logged.

## P0: Reliable journal and Notes evidence

- Logs keep `note` (user-authored session Notes) and `thoughts` (explicit Journal Thoughts) distinct. **Do not silently migrate, reinterpret or label a Note as a Journal.**
- `src/lib/personalMoments.ts` scores candidate messages from the period's actual logs using available **explicit** evidence: Impact, selected Moodlets, length, and concrete recorded language. These determine **selection**, not new factual claims.
- `buildWrappedEvidence` now creates personal journal and authored Notes cards **before** volume, location and statistics. This prevents the 90-card limit from displacing journal entries. It also removes the old `slice(0,20)` selection of chronological Notes.
- Notes are called **user-authored session notes**, not only administrative labels. Their verbatim content can support interpretation without being presented as a Journal-field quote.
- Month-phase journal highlights choose the most significant written reflections from each substantive period phase rather than the first two in timestamp order.
- Deep Dive also uses the shared moment selector; this avoids handing the Writer 140 random Notes while losing a late-month, high-impact personal memory.
- The stored data and historical record are never rewritten by this editorial selection. Missing writing remains unknown and cannot be invented.

### September regression

`src/lib/personalMoments.test.ts` reproduces 160 routine September logs plus two Final Fantasy XIV sessions, including a September 27 Endwalker MSQ conclusion with the Free Company. It checks both original `Notes` and edited `Journal Thoughts` modes: real wording, Impact 5 and Moving/Social appear as source evidence.

`server/routes/logs.moodlets.test.ts` additionally verifies the actual SQLite HTTP `PUT → GET → buildWrappedEvidence` path after a session is moved from Notes to Journal Thoughts.

## P1: Claim-first editorial scenes

- Every **new** interior Wrapped scene is requested with `thesis`: an authored, specific editorial interpretation. It must cite 1–5 existing fact IDs and argue the point in its body.
- `curateWrappedTheses` runs **before** the expensive Visual Director and image work. It removes scenes with no point, bare counts, generic summaries, missing/unknown evidence anchors, and highly similar repeated theses.
- It may produce a shorter Wrapped; the goal of 3–5/4–7/6–11 scenes for week/month/year is **not a quota**. Minimum is opening + one substantial interior + closing. Existing chronology/period coverage and analytic/infographic safeguards are still enforced by `normalizeWrappedStory`.
- If no grounded interior remains, the generator requests a corrected draft through its existing retry rather than inventing a scene.
- `editorialThesis` is persisted in validated story scenes and preserved on restyles. Old saved stories without this field **remain backwards compatible**.
- Interpretations may be brazen, biased, funny, confidently uncharitable and thoroughly Dungeon-System-AI-like. They **cannot** turn fictional jabs into purportedly observed activity, statements or emotions.

### Limits

The local gate checks **structure**, source IDs and common filler patterns. It cannot semantically prove that every interpretation follows from its citation. The image/story writer still gets explicit instructions not to invent events. Actual live outputs require editorial inspection, especially if a future model takes the requested sarcasm as permission to fabricate.
