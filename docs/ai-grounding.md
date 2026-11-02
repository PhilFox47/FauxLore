# FauxLore AI grounding and Dungeon System AI voice

## Purpose

FauxLore is a real media-tracking app with an imaginary RPG overlay. The narrator must remain free to be absurd without inventing choices, attacks, relationships or experiences. Voice is NOT an alternative source of factual authority.

## Single source of truth

- `src/lib/fauxLoreMechanics.ts`: canonical narrative interpretation of features and provenance. `FAUXLORE_MECHANICS_CONTEXT` is attached by `getPersonaDescription()` to every persona-driven narrative call. `FAUXLORE_BOSS_ATTRIBUTION`, `FAUXLORE_ITEM_ATTRIBUTION` and `FAUXLORE_SESSION_CONTEXT` are short task-specific variants.
- `src/lib/personas.ts`: the Dungeon System AI is its own irrational authority, not a broadcaster or bureaucrat. No organizer/management/department comedy; personal cruelty is a voice choice, not license to change facts.

## Verified code-to-narration mapping

| Feature | Implementation | What the narrator may infer | What it MUST NOT infer |
|---|---|---|---|
| Progress logging | `src/components/ProgressModal.tsx`, `server/routes/logs.ts`, `src/lib/logStatus.ts` | Recorded quantity/time/location, optional session enjoyment; source of a status-change log | All status changes were deliberate; all logged sessions contain opinions |
| Notes vs Thoughts | `src/types/schema.ts`, `src/lib/recapAnalytics.ts` | Notes = factual labels; Thoughts/review = user's words | Race/episode/issue note as a journal emotion |
| Auto-Drop and provenance | `src/pages/Dashboard.tsx`, `src/contexts/MediaContext.tsx`, `server/routes/media.ts` | Only Active can auto-drop after 50 days inactivity, with disableAutoDrop, noAutoDrop, Time Travel exemptions; boss failure may follow as a side effect. Both manual and automatic drops generate the same generic status-change entry | Claim to know whether any individual Drop was manually chosen or automatic. This distinction is NOT reliably persisted |
| Session duration estimates | `src/lib/logDuration.ts` | Time-based media track hours; other media have derived durations and end-anchored clock spans | Exact measured minutes for a book/series when estimated rates were applied |
| Atlas/location groups | `src/lib/locationGroups.ts`, `src/pages/Atlas.tsx` | User-classified real-world places with potentially overlapping groups | A location label explains why a person was there; group shares sum to 100% |
| Re-runs | `src/types/schema.ts`, `src/components/MediaFormModal.tsx` | A separately tracked repeat experience | A re-run implies the player previously completed or loved it without supporting records |
| Master Pages/EXP/streaks | `src/lib/scaling.ts`, `src/lib/rpgSystem.ts` | Normalized app metrics and computed rewards | Literal pages, physical accomplishments, personal motivation |
| Quests | `src/lib/rpgSystem.ts` | Goals can become complete as a by-product of regular activity | User consciously targeted or chose each quest |
| World Bosses | `server/services/worldBoss.ts`, `server/lib/bossTargets.ts`, `server/routes/logs.ts`, `server/routes/bosses.ts` | Automatically or manually spawned themed target; earned defeat via logs, or Completed/Caught Up, even with medium still active; deadline failure | User physically killed, attacked, spared or necessarily encountered the named source character |
| Boss Taunt/Reroll/Encore | `server/routes/bosses.ts` | Explicit controls exist; Taunt extends time/raises stakes; Reroll changes generated opponent | User invoked controls absent explicit event evidence |
| Loot/Armory | `server/services/loot.ts`, `src/pages/Armory.tsx`, `server/routes/logs.ts` | In-app generated equipment with rarity/affinity/durability and EXP effects; eligible claim | Physical loot, guaranteed boss drop or story item encountered by the user |
| Media statuses & releases | `src/lib/logStatus.ts`, `src/lib/onHold.ts`, `src/pages/ReleaseRadar.tsx` | Caught Up=latest available content consumed. On Hold=parked until later (usually a release, sometimes a deliberate subscription break with intention to return). Dropped may be manual or automated | On Hold=lost interest; Dropped=conscious permanent decision, dislike or rage quit without stated reason |
| Time Travel | `src/pages/TimeTravel.tsx` | User-designated chronological project with different tracking treatment | Literal time travel or the user visited a fictional place |
| Universes | `src/pages/Universes.tsx` | Curated media/franchise groupings | Physically explored universes |
| Roulette/backlog | `src/pages/Roulette.tsx`, `src/lib/recommend.ts` | Suggestions and ranked possibilities | User chose a suggestion merely because it was displayed |
| Codex | `server/services/codex*.ts` | Researched facts about works, including lore and characters | Player saw/encountered a particular plot event or entity |
| Recaps/Wrapped | `src/services/recapAi.ts`, `src/services/wrappedAi.ts`, `src/lib/wrappedEvidence.ts` | Independent editorials using period evidence | Statistics as proof of feelings or direct combat; history as unrecorded facts |
| AI-generated achievements | `src/services/achievementAi.ts` | Original fictional, funny commentary anchored to real period facts | Real inventory/EXP unlock from an imaginary achievement reward |

## AI entry-point coverage

- `getPersonaDescription` feeds Recaps, Wrapped, Roulette recommendations, Lorekeeper titles and quest text, and the persona-aware boss/loot flavor writing passes.
- Independent editorial selection in `src/services/recapAi.ts` receives the canonical context explicitly.
- Independent achievement generation in `src/services/achievementAi.ts` receives the Dungeon voice and boss attribution explicitly.
- Journal question generation in `src/services/sessionPrompt.ts` receives a compact context only, keeping its latency low.
- Enemy/loot selection prompts receive compact boss/item attribution; the persona-aware flavor passes receive those guards and the selected narrator context.
- Codex research, tagging and image generation should stay fact- and source-directed rather than adopt an abusive narrator voice. They do not interpret user intent and therefore are not a place to inject the whole RPG persona.

## Grounding examples

- GOOD: 'The Dr. Rosalene challenge fell while To the Moon was still underway. My accounting of your progress is merciless, even if you never made a single combat decision.'
- BAD: 'You chose to eliminate Dr. Rosalene before finishing To the Moon.'
- GOOD: 'Your notes say Mexico GP; your review says you loved the season.'
- BAD: 'Mexico GP in Notes proves you were thrilled by that race.'
- GOOD: 'The algorithm granted an achievement for activity that happened anyway.'
- BAD: 'You pursued and completed this quest specifically to please me.'

## Validation and limitations

Run `npm run test:ai-grounding` and the existing `npm run lint`, `npm run build`, `npm run test:wrapped`. Regression tests guarantee the *prompt contract*, not a particular stochastic model response. Manual A/B tests using the same real period are still required to evaluate remaining hallucinations or repetitive phrasing. Existing saved AI prose remains unchanged until explicitly regenerated.

## Questions about actual use (do not silently infer)

- ANSWERED: Caught Up means latest available content consumed. On Hold normally means waiting for a release, but can mean a deliberate pause with intention to return (for example, an FFXIV subscription suspended for several months). User intent cannot be inferred from status alone.
- ANSWERED: Dropped has TWO roles: an explicit 'probably won't continue' choice, and automatic dashboard clean-up when an Active medium is untouched for 50 days. Even manual Dropped does not mean 'never again'. Both pathways save the same generic status change with no source flag. AI must not assert cause without evidence.
- Are Encore and Taunt controls actively used as deliberate challenges, or mostly experimental? Their existence alone does not establish frequency or intention.
- How are media-wide user ratings and reviews used on ongoing works? They may exist before `Completed` in the stored library; they are not necessarily final verdicts.
