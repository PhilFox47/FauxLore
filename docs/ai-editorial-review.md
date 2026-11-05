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

The fictional Dungeon persona can be savage, intrusive, arrogantly certain, profane, grotesquely judgmental and wildly unfair **about harmless media choices and the narrator's own theories**. The punchline should be a new interpretation, not merely an insult attached to a spreadsheet.

Verifiable statements about events, dates, people, first-hand emotions and source plot must remain supported. No invented dialogue, meetings or spoiler experiences; no attacks on actual vulnerabilities. Unexpected sincerity and unpredictable pacing remain available.

## Tests and limits

- `src/services/editorialAudit.test.ts` verifies editor instructions, evidence access and independent model-call behavior without spending live tokens.
- `src/lib/wrappedThesisGate.test.ts`, `src/lib/wrappedFinale.test.ts`, `src/lib/wrappedEditorial.test.ts` verify that static checks enforce source/structure instead of literary taste.
- The AI editor adds one model call to each new Deep Dive Recap or Wrapped, plus any retries if source or structure is invalid. It consumes tokens and adds latency.
- No deterministic quality metric can guarantee the quality of real-world AI output. Test actual generated October stories and review the Director/reviewer exchanges in Diagnostics to calibrate their creative choices.
