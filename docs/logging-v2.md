# Logging V2

Logging is a two-step flow that separates facts from experience.

## Step 1: session facts

Records progress, end date/time, location, optional 1–5 session enjoyment and the proposed status change. **Save & Continue** writes the log and returns its ID. Status suggestions are automatic and manually overridable; a fresh media log always survives an abandoned second step.

## Step 2: optional reflection

- **Notes** (\`logs.note\`): organizational context, episode/issue/race numbers. Not a journal.
- **Journal / Thoughts** (\`logs.thoughts\`): the user's own reflection.
- **AI question** (\`logs.thoughtPrompt\`): one short, session-specific question prompted by the duration, enjoyment, context and up to five previous logs. The call is capped and can fail gracefully. The question is stored only when it accompanies a submitted journal response.
- **Review**: offered when a log changes the work to \`Completed\`, separate from session enjoyment. The log update API saves it with the journal.

The second page may be skipped at any time. The first saved log remains intact.

## Automatic status

- Planning → Active when recording positive progress.
- Movie → Completed on watch.
- Book, audiobook, series, manga and comic → Completed on reaching a trustworthy total.
- Still-releasing series/manga/comics → Caught Up at the available amount; they may return to Active when more content arrives.
- Game and Visual Novel completion is ALWAYS manual, not inferred from estimated playtime.
- Audiobooks auto-complete ONLY with a confirmed full duration in \`media.totalDurationHours\`, not an average or guessed runtime.
- Historic undated progress cannot auto-change status. Manual user choice has precedence.

## Historical data and analyses

Legacy \`logs.note\` values remain unchanged. They are not automatically reinterpreted as journal entries.
New analytics, journal-only filtering, Recaps, Wrapped and Scribe/Journalist quest progress use \`logs.thoughts\`. Session enjoyment is a separate optional signal; an absent rating is not a neutral score.

For verification: \`npm run lint\`, \`npm run test:logging\`, \`npm run test:wrapped\`, \`npm run build\`.
