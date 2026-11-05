# Independent AI editorial review · FauxLore

Recaps and Wrapped stories are **editorials about lived media experiences**, not summaries of the act of using a media tracker.

## Editorial architecture

1. **Research** collects unaltered Notes, Journal Thoughts, ratings, Moodlets, relationships, historical journeys and prior editorial memory as internal evidence. Notes are organizational; Journal Thoughts and reviews are considered reflections.
2. **Writer** selects an angle and writes a full narrative draft with source citations in its structured fields.
3. **Independent AI editor** makes a distinct creative call through the configured text provider. This editor reads the actual draft and its source context; it can change the issue's premise, sharpen or replace scenes, remove filler, offer an aggressive and original interpretation, or preserve genuinely excellent writing. It returns a **complete rewritten issue**, not a list of banned words.
4. **Technical validator** checks existence of citations, supported scene/layout types, data-chart provenance, chronological coverage and JSON shape. The code **does not** judge the originality of a metaphor, harshness of a roast or whether a sentence sounds generic.
5. **Visual Director** stages only the revised and technically validated Wrapped. Existing saved stories and Deep Dive issues are not retroactively rewritten.

## Editorial transfer standard

The unpublished source should provide *reasons to reach a conclusion*, not its final wording. A scene must offer a new perspective, original unfair theory, important contradiction, precise personal connection, insightful disagreement or memorable joke that survives removing the logging and scoring language.

Raw lists of scores, tags, Moodlet names, chapter numbers, progress shares, dates or named companions do not themselves count as editorial work. They may still be quoted when their exact value is inseparable from a genuine insight. No regex or hard-coded word banlist decides this: the independent AI editor judges it in context.

## Dungeon System voice

The fictional Dungeon narrator is **a deliberately unreliable, self-obsessed tyrant**. It is expressly allowed to **invent personal backstories, formative childhood disasters, private motivations, absurd social deficiencies, imaginary inner monologues and bizarre psychological interpretations** and to declare them absolute fact *within its outrageous comic performance*. No "maybe", "this is only a theory", "the logs suggest", apologies or cautionary footnotes.

Examples of permitted dramatic exaggeration: loving Avatar is incontrovertible evidence of an invented childhood cabbage-related humiliation; playing Jackbox proves the user is incapable of social interaction without software; disliking a film proves the narrator's favorite masterpiece exceeds the user's intellectual capacity. These are examples of **intensity**, not fixed formulas the AI should recycle.

Editorial invention and mechanical data are deliberately separate. Exact chart values, source IDs and other structured technical fields still need valid input so the UI behaves correctly; the narrator's imaginary biography and aggressive mind-reading do not. Avoid unwanted media spoilers and trivializing genuine disclosed suffering. Unexpected sincerity and erratic comic pacing remain available.

Only **Recap and Wrapped editorial prompts** receive this fictional license. Logging questions, item ownership, combat state and other operational mechanics continue to use normal grounded definitions.

## Spoken character voice (Dungeon persona only)

A powerful opinion does not automatically make a passage sound like a character. The November 5 diagnostics showed the AI rewrite repeatedly producing similarly sized two-paragraph arguments that followed an immaculate setup / metaphor / contrast / explanation / punchline rhythm. The invented childhood accusations were funny, but the delivery was *too carefully polished*.

The **writer** now receives a dedicated `DUNGEON_SPEECH_DIRECTION` brief and the **separate AI editor** receives `DUNGEON_EDITORIAL_LINE_EDIT` from `src/lib/editorialSpeech.ts`. Both are qualitative performance instructions, **not rigid text filters**.

- Treat each scene as spoken character dialogue. Sudden anger, interrupted thoughts, strange petty obsessions, plain insults, awkward silences, long excited rants, and sharp one-line exits are all possible.
- Trust the joke instead of translating it into a tidy general lesson. Stop after the actual laugh.
- Watch for rote balanced opposites, neat "not X but Y" rhetoric, equal paragraph sizes, grandiose metaphor stacking and every scene ending in a polished contrast. These are editorial concerns, **not banned constructions**.
- Let narrative coherence emerge without forcing every work into one umbrella metaphor. The artificiality of over-curation is worse than a well-placed digression.
- Never fake human speech with random typos, arbitrary profanity or a forced "chaotic" quota. Be precise when it is funny and allow an unusually quiet moment to stand.

The Dungeon narrator keeps complete freedom to invent absurd childhood stories and unhinged personal motives without disclaimers; spoken naturalness should not mean caution. Structural source ID, actual metric and JSON validation are unchanged.

## Monthly scope: editorial, not structural

The 2026-10 run exposed a false-negative: a compelling story with real evidence IDs was rejected because no interior scene cited a source whose `phase` field was `late`. Media-wide facts can summarize October 21–31 without carrying a single phase. The independent reviewer sometimes removed precisely the source that would have satisfied the old validator.

Month-phase ratios and clusters now go **to the AI editor** as actionable private context. It judges whether dropping a substantial later period is an important editorial omission, and if so can replace a weak angle or integrate an actually interesting late-month experience. No specific early/middle/late count, minimum number of separate scenes or last-week balance is a hard acceptance requirement. A 36% late-month share is an important reason for editorial scrutiny, not a command to add a filler scene.

Technical source validity, infographic eligibility, verified numbers, scene schema and actual time period integrity remain checked. This prevents failed regenerations and expensive full-Director retries caused solely by a narrative selection that did not match an arbitrary phase quota.

## Tests and limits

- `src/services/editorialAudit.test.ts` verifies editor instructions, evidence access and independent model-call behavior without spending live tokens.
- `src/lib/wrappedThesisGate.test.ts`, `src/lib/wrappedFinale.test.ts`, `src/lib/wrappedEditorial.test.ts` verify that static checks enforce source/structure instead of literary taste.
- The AI editor adds one model call to each new Deep Dive Recap or Wrapped, plus any retries if source or structure is invalid. It consumes tokens and adds latency.
- No deterministic quality metric can guarantee the quality of real-world AI output. Test actual generated October stories and review the Director/reviewer exchanges in Diagnostics to calibrate their creative choices.
