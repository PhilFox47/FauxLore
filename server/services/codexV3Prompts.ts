
import { createHash } from "node:crypto";
import { FACET_SPECS, subjectSeason, subjectYear, type CodexSubject } from "./codexResearch";
import type { CodexKnowledge, KnowledgeEntry, ManifestTarget } from "./codexV3Knowledge";
import { collectLanguageIssues } from "./codexV3Language";

export const V3_PHASES = [
  "identity","discovery","core","cast","world","story","craft","audience",
  "coverage","review",
] as const;
export type V3Phase=typeof V3_PHASES[number];
export const v3Fingerprint=(subject:CodexSubject,model:string,known?:string|null)=>
  createHash("sha256").update(JSON.stringify({v:3,subject,model,known})).digest("hex");

export function v3Prompt(phase:V3Phase, subject:CodexSubject, knowledge:CodexKnowledge,
  missing:ManifestTarget[], known?:string|null):string {
  const title=subject.title;
  const scope=`EXACT WORK: ${title} (${subjectYear(subject)||"year unknown"}, ${subject.mediaType})`
    + (subjectSeason(subject)?` season ${subjectSeason(subject)}`:"")
    + (subject.creator?`; by ${subject.creator}`:"")
    + (subject.subtitle?`; ${subject.subtitle}`:"")
    + (subject.description?`\nExisting metadata (may be incomplete): ${subject.description.slice(0,700)}`:"")
    + (subject.franchises?.length?`\nFranchise: ${subject.franchises.join(", ")}`:"");
  const identity=JSON.stringify(knowledge.identity);
  const common=`Research the EXACT released work, not sequels, remakes, later seasons or adaptations.
Use native web_search strategically, including dedicated wikis, walkthroughs, reviews,
samples, sourcebook pages and community posts. Real facts are more important than neat
prose. The result becomes a durable knowledge base for other AI tasks, NOT an article.
Prefer extensive specific information over compact summaries. Avoid speculative facts,
but do not drop plausible information only because an individual URL is missing.
Where available, provide full page URLs for traceability. If no source matches a
particular claim, omit the URL; the record is kept with "uncertain" provenance.
Do not confuse facts about the work with the user's personal experiences. No invented
chapter markers or progress percentages.
LANGUAGE POLICY (MANDATORY FOR ALL JSON FIELDS, NOT JUST THE SUMMARY):
- Write the entire Codex in fluent ENGLISH. German is acceptable only when
  it is genuinely appropriate to a German-language original work (especially
  an authentic German quote). Do not use any other language for prose,
  characters, entries, quotes, terms, lists or descriptions.
- Japanese, Chinese, Korean, Russian etc. sources are allowed for RESEARCH,
  but do not reproduce their writing systems in the OUTPUT.
- Use official English/localized names where available, otherwise established
  romanizations in Latin letters. NEVER append original Japanese spellings in
  parentheses, including in "name", "relatesTo", credits or inventory.
- Memories: seek an attested English-localized quotation. If the exact English
  wording cannot be confirmed, use a concise English REFERENCE describing the
  recognizable moment, set details.kind="reference", NOT a made-up direct quote.
- Keep genuine German-language quotations unchanged when they suit the work.
- Preserve factual meaning and provenance; do not invent canonical translations.
- Source URLs can retain their original spelling/encoding because they are
  references, not displayed prose. Return only valid JSON.`;
  const entry=`{"entries":[{"area":"characters | antagonists | locations | factions | items | terminology | events | flavorTexts",
"name":"canonical name / exact quote","facts":["specific concrete fact 1","distinct fact 2"],
"details":{"appearance":"precise visual traits","personality":"concrete behavior"},
"relatesTo":["canonical name of related entity"],"priority":"essential | important | supporting",
"sourceUrls":["https://page-url-when-available"],"introducedAt":"optional documented chapter/mission"}]}`;
  if(phase==="identity")return `${scope}\n${common}\nIdentify original work and boundaries with authoritative sources.
Return {"identity":{"title":"","year":2007,"type":"","creator":"",
"coverage":"abundant | moderate | thin","excludedWorks":["sequel or adaptation"],
"sourceUrl":"https://source-if-available"},"sources":["https://searched-page"]}`;
  if(phase==="discovery")return `${scope}\n${common}\nWORK IDENTITY: ${identity}
Make an INVENTORY OF RELEVANT CONTENT before describing it. Discover important
named characters (including companions, antagonists and memorable supporting roles),
factions, locations, objects, vocabulary, major story events. Do not stop at protagonists
or at an arbitrary number. An encyclopedic game may need a very long inventory;
a small novel may need a short one. 'essential' means central to THIS work;
'important' means meaningfully recurring or distinctive; 'supporting' only
when recognizable or useful. The inventory is a COVERAGE CHECKLIST, not a finished
Codex. Use search across several different kinds of pages. Never invent to pad.
Return JSON {"manifest":[{"name":"","area":"characters | antagonists | locations | factions | items | terminology | events",
"priority":"essential | important | supporting","reason":"specific importance"}]}`;
  const base=`${scope}\n${common}\nRESEARCH IDENTITY: ${identity}
COVERAGE INVENTORY (do not forget essential entries):
${JSON.stringify(knowledge.manifest).slice(0,40000)}
${known?`\nExisting Codex being expanded; find additional facts too: ${known.slice(0,2600)}`:""}`;
  if(phase==="core")return `${base}
Research the GENERAL, ALWAYS-USEFUL IDENTITY of this work in depth. Produce
specific prose about creative premise, overview, setting, tone, themes, structure,
distinctive identity, conflicts, how the world operates, everyday life, production,
reception, aesthetic signature, sound and audience. Not marketing slogans. For
genres/tags, describe what the work ACTUALLY is so FauxLore's existing auto-tagging
taxonomy can later classify it. Tags are not arbitrary fandom proper nouns:
include genre, gameplay/form, setting, tone, narrative and thematic hooks.
These fields are key to Enemy Forge, Loot, image prompts AND the Spotify-Wrapped
style recap, where the app will supply the user's actual progress and scores.
Do not claim the player made particular choices. For a book with little coverage,
describe only supported details; keep uncertain parts honestly qualified.
Return {"core":{"premise":"","overview":"","setting":"","tone":"","themes":[],
"structure":"","distinctive":"","conflicts":[],"worldRules":"","everydayLife":"",
"production":"","reception":"","signatureMoments":[],"soundAndMusic":"",
"audience":"","contentWarnings":[],"relatedWorks":[],"artStyle":{
"summary":"","form":"","medium":"","palette":"","iconography":"",
"lighting":"","linework":"","composition":"","characterDesign":"",
"styleKeywords":[],"notLike":""},
"genres":[],"tags":[]},"sources":["https://page-if-used"]}`;
  if(phase==="cast")return `${title} protagonist companion supporting characters canon relationships appearances
${base}
DEEP RESEARCH: PEOPLE, ANTAGONISTS, AND THEIR RELATIONSHIPS.
Use the manifest as a checklist and expand beyond it when reliable sources
identify additional notable figures. For each important person record a useful
PROFILE, not one encyclopedia sentence: identity, visual design, role, motives,
temperament, individual voice, affiliations, abilities, relationships, relevant
events, and why this person matters. Cross-link entities by canonical name.
If a person is an antagonist, place in antagonists (and, if central as a cast
member, also in characters); never lose the person. Do NOT impose count quotas.
Reference brief (follow for depth, not any fixed count):
${FACET_SPECS.cast.brief.slice(0,6500)}
Return ${entry} with area only "characters" or "antagonists".
Missing/unknown details can be omitted. Do not fabricate first appearances.`;
  if(phase==="world")return `${title} universe setting factions locations objects technology laws vocabulary
${base}
DEEP RESEARCH: WORLD, PLACES, GROUPS, OBJECTS, SYSTEMS and terminology. For
each significant location: appearance, hierarchy, atmosphere, what happens there.
For factions: members, beliefs, rivalries, aims and identifiers. For objects:
visual identity, material, use, origin, ownership and plot relevance. For terms:
what the concept actually MEANS, not a shallow one-liner. Distinguish ships,
tools, locations and organizations. Follow the entire manifest and find other
important elements the original index missed. No arbitrary list size.
WORLD BRIEF: ${FACET_SPECS.world.brief.slice(0,3800)}
OBJECT BRIEF: ${FACET_SPECS.things.brief.slice(0,3800)}
Return ${entry} with areas only locations, factions, items, terminology.`;
  if(phase==="story")return `${title} major missions chapters story turning points causal consequences events
${base}
DEEP RESEARCH: STORY FACTS AND SEQUENCES. The Codex may store SPOILERS
internally; they must be separated from the spoiler-free core and never handed
to Wrapped or a user before appropriate progress. Search actual chapter or
mission guides where available. Store distinct EVENTS: what happens, the setup,
who participates, where, what causes it, what it changes, optional branches and
relevant character arcs. Never claim optional branches are a single required
outcome. Episode/chapter/mission intro ONLY when documented, otherwise omit.
For nonlinear games distinguish optional from mandatory events. Do not mistake
a critic's appraisal of a mission for an event.
Return ${entry} with area only "events"; details may include chronology,
participants, location, consequences and optional.`;
  if(phase==="craft")return `${title} iconic visual art direction score creative techniques production lore genre taxonomy
${base}
DEEP RESEARCH: CRAFT AND DISTINCTIVE IDENTITY for downstream image generation,
classification and Wrapped. Return extra facts on visual signature, character
design, materials, environments, score, sounds, mechanics, genre/setting, themes,
production/cultural reception. Extract concrete supported details, not generic
atmosphere adjectives. For non-visual books, describe cover/public illustration
as such and do not invent a canonical visual adaptation. Structured core updates
MUST BE ADDITIVE to the previous core: include only fields you meaningfully
enrich, never overwrite concrete statements with shorter summaries.
Return JSON {"core":{"distinctive":"","soundAndMusic":"","artStyle":{},
"genres":[],"tags":[],"production":"","reception":"","themes":[]},
"entries":[],"sources":["https://page-if-used"]}.
Entries may use any existing entity area if you have meaningful NEW information,
but a source-backed fact should not be discarded because it repeats a name.`;
  if(phase==="audience")return `${title} fan quotes beloved scenes memorable lines inside jokes reddit forum iconic
${base}
Research the actual experience and fandom, not press copy. Distinguish DIRECT
QUOTES from fan references/jokes. Authentic wording matters; do not manufacture
quotes from a novel without reliable source. Prefer multiple distinct topics
and recognizable moments. Store ALL good candidates in the knowledge base;
the UI's handful of library-header quotes are a separate presentation choice,
not a research cap. Every candidate should stand alone and be recognizable.
If nothing genuinely documented exists, return empty entries.
Return ${entry} using only area "flavorTexts".
In "name" store the English (or appropriate original German) memorable line.
Use a verified official English translation for kind="quote". If the only
known original is Japanese or another language, give an English explanatory
reference (kind="reference"), never untranslated text or a fabricated quote.
"facts" explain why it matters;
"details" include kind (quote|reference|joke), attribution, topic, why.
Do not copy prompt examples.`;
  if(phase==="coverage")return `${title} exact missing character location item event research
${base}
The existing work inventory contains these important items NOT YET DOCUMENTED:
${JSON.stringify(missing)}
Perform a TARGETED WEB SEARCH specifically for these missing targets. Do not
restart or summarize the whole Codex. Cover missing essential/important entries
and meaningful new relations, when sources allow. Do not invent to force a
complete checklist. A short sourced profile beats an unsourced assertion.
Return ${entry} for any relevant area except flavorTexts, plus {"sources":[]}
if helpful. Output should have a top-level entries array.`;
  const languageIssues=collectLanguageIssues(knowledge);
  const candidates=knowledge.entries.map(e=>({id:e.id,area:e.area,
    name:e.name,facts:e.facts.slice(0,2).map(x=>x.slice(0,165))}));
  return `${scope}\nThis is a FAST NO-WEB SANITY REVIEW, not exhaustive fact-checking
or an editorial rewrite. All records were collected in research already.
Keep EVERYTHING by default. Reject ONLY obvious wrong-work canon, sequel-only
figures, impossible contradictions or obviously forged attributions.
Give a clear short reason for every explicitly rejected ID.
Omitted IDs remain ACCEPTED. Do not trim for length, reading quality, or
lack of a perfectly matching citation. If unsure, leave it.
ITEMS: ${JSON.stringify(candidates)}
ADDITIONAL LANGUAGE-ONLY REPAIR (do NOT research or rewrite everything):
The previous native-search phases may have copied non-Latin original language
text. Provide an ENGLISH rendering for EACH of these field paths, preserving
proper names by their established Latin-letter spelling. For Japanese-only
dialogue with no verified published English wording, render it as a brief
English descriptive reference, NOT a purported verbatim quote. If a field
is a credit/name, romanize it when reliably possible. Include ALL paths below
in "languageFixes", even when there are no obvious factual errors.
LANGUAGE ISSUES: ${JSON.stringify(languageIssues)}
JSON ONLY {"rejectedIds":[],"reasons":[],"languageFixes":[{"path":"entries.0.name","english":"English rendering"}]}`;
}
