/**
 * How the Codex is researched.
 *
 * The dossier used to be one call: identify the work, research everything about
 * it, and emit a large JSON document — all at once, with web search on. That has
 * two problems, and both cap quality no matter how much the schema is expanded.
 *
 * First, `:online` is retrieval, not an agent. The provider runs a search keyed
 * on the message and injects the results before the model writes a word; the
 * model cannot go and look again. So "search harder" instructions do nothing,
 * and a 4,000-word prompt of JSON schema and rules is a terrible search query —
 * the part that identifies the work is a dozen words buried in the middle.
 *
 * Second, one search had to serve every question the dossier asks. A result set
 * good enough to describe the art style is not the one that lists the cast.
 *
 * So research is now split two ways:
 *
 *   IDENTIFY   one short, search-shaped call that settles which work this is and
 *              what else it is called.
 *   FACETS     one call per subject area, each with its own tight query, run in
 *              parallel. These return prose, not JSON — the schema is not
 *              competing with the research for the model's attention.
 *   STRUCTURE  one cheap, non-web call per facet that turns that prose into the
 *              dossier's shape. Reasoning over text already retrieved needs no
 *              search and no expensive model.
 *
 * Wall-clock is three rounds instead of one. The search bill is a few cents,
 * once, for the life of the entry.
 */

export interface CodexSubject {
  title: string;
  mediaType: string;
  /** Which season of a series this entry is. Scopes the whole dossier. */
  season?: number | null;
  subtitle?: string;
  creator?: string;
  publisher?: string;
  year?: number | null;
  expectedReleaseDate?: string | null;
  releaseStatus?: string | null;
  description?: string;
  franchises?: string[];
  platforms?: string[];
  language?: string | null;
}

/**
 * Which season the dossier is about.
 *
 * The season field is authoritative, but entries created from a season pick are
 * titled "Show - Season 2" and may carry nothing else, so the title and subtitle
 * are read as a fallback.
 *
 * Not only series. A live-service game runs numbered seasons that are as
 * distinct from each other as a show's are — different heroes, different maps,
 * different events — and a dossier for "Marvel Rivals - Season 7" that describes
 * Marvel Rivals in general is describing the wrong thing, and will happily reach
 * into a season that has not happened yet.
 *
 * The pattern is stricter off Series, though. The bare "S2" shorthand is safe on
 * a show and disastrous elsewhere: "The Sims 4" would read as season 4.
 */
const SEASON_IN_SERIES_TITLE = /\b(?:season|series|staffel|saison|s)\s*\.?\s*(\d{1,2})\b/i;
const SEASON_IN_ANY_TITLE = /\b(?:season|staffel|saison)\s*\.?\s*(\d{1,2})\b/i;

export function subjectSeason(subject: CodexSubject): number | null {
  const explicit = Number(subject.season);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const isSeries = /series/i.test(subject.mediaType || "");
  const pattern = isSeries ? SEASON_IN_SERIES_TITLE : SEASON_IN_ANY_TITLE;
  for (const text of [subject.title, subject.subtitle]) {
    const m = String(text || "").match(pattern);
    if (m) {
      const n = Number(m[1]);
      if (n > 0) return n;
    }
  }
  return null;
}

/**
 * Which VERSION of a work this entry is, when the difference is not a number.
 *
 * A season is the common case but far from the only one. A remake is not its
 * original, a Director's Cut is not the theatrical release, a remaster is not
 * the game people played twenty years ago, and a dossier that quietly merges the
 * two is wrong about the cast, the art style and half the facts in it.
 *
 * Read from the title the user actually typed, because that is where they said
 * which one they meant.
 */
const EDITION_WORDS = [
  "remake", "remaster(?:ed|s)?", "reboot", "redux", "definitive edition",
  "director'?s cut", "extended (?:edition|cut)", "final cut", "uncut",
  "anniversary edition", "complete edition", "game of the year edition",
  "goty edition", "special edition", "ultimate edition", "deluxe edition",
  "enhanced edition", "hd remaster", "hd edition", "reforged", "rewind",
];
const EDITION_PATTERN = new RegExp(`\\b(${EDITION_WORDS.join("|")})\\b`, "i");

export function subjectEdition(subject: CodexSubject): string | null {
  for (const text of [subject.title, subject.subtitle]) {
    const m = String(text || "").match(EDITION_PATTERN);
    if (m) return m[1];
  }
  return null;
}

/** The release year we can hold the research to, from whichever field has one. */
export function subjectYear(subject: CodexSubject): number | null {
  if (subject.year) return Number(subject.year);
  const expected = subject.expectedReleaseDate ? new Date(subject.expectedReleaseDate) : null;
  if (expected && !Number.isNaN(expected.getTime())) return expected.getFullYear();
  return null;
}

/**
 * What each of the app's media types means as a *work*, so the search does not
 * wander into an adaptation. The most common failure is grabbing the famous
 * version of a name: the 2010 live-action film when asked for the 2026 animated
 * one, or the original cartoon when asked for the film.
 */
export const TYPE_BRIEF: Record<string, string> = {
  Game: "a video game. NOT a film, series, book or comic adaptation of it",
  "Visual Novel": "a visual novel / interactive fiction game. NOT its anime, manga or film adaptation",
  Book: "a written book or novel. NOT a film, series or game adaptation of it",
  Audiobook: "an audiobook OR a podcast. For an audiobook, describe the written work's own content and NOT a film or series adaptation. For a podcast — including a non-fiction one — describe the show itself: its hosts, format and subject matter. Do not go looking for a book that does not exist",
  Manga: "a manga (Japanese comic). NOT its anime, film or live-action adaptation",
  Comic: "a comic book or graphic novel. NOT its film or series adaptation",
  Series: "an episodic television or streaming series. NOT a feature film, book or game of the same name. This is not only fiction: it also covers reality and competition shows (Game Changer, Taskmaster), documentary series, talk and panel shows, and recurring sporting competitions or seasons (Formula 1). Describe whichever of those it actually is",
  Movie: "a single feature film. NOT a television series, book or game of the same name",
};

/** The short format word used inside a search query line. */
const TYPE_QUERY_WORD: Record<string, string> = {
  Game: "video game",
  "Visual Novel": "visual novel",
  Book: "novel",
  Audiobook: "audiobook podcast",
  Manga: "manga",
  Comic: "comic",
  Series: "TV series",
  Movie: "film",
};

/** What the identify pass settled on, carried into every later call. */
export interface CodexIdentity {
  title?: string;
  year?: number | string;
  season?: number | string;
  type?: string;
  creator?: string;
  why?: string;
  alternatives?: string[];
  /** Every other name this work is published, romanised or known under. */
  alsoKnownAs?: string[];
  sources?: string[];
  confidence?: string;
  notes?: string;
}

export type Facet = "cast" | "conflict" | "world" | "things" | "craft" | "lore";

export interface FacetSpec {
  /** Appended to the title to form the search query line. */
  query: string;
  /** What prose the research pass should come back with. */
  brief: string;
  /** The JSON the structuring pass emits, and the keys it fills. */
  keys: string[];
  shape: string;
  /** Extra rules for the structuring pass, on top of the shared ones. */
  structureNotes?: string;
  /**
   * What this facet means when the work is not fiction. Series covers reality
   * and competition shows and sporting seasons; Audiobook covers podcasts. The
   * fields still apply to those — they just refer to real things.
   */
  nonFiction: string;
}

/**
 * The line that keeps this a reference work rather than a props cupboard.
 *
 * Every facet gets it, because the failure it prevents is subtle. Asked for
 * "enemies, with tiers and weaknesses", a researcher goes looking for things
 * that would make good bosses instead of recording what is actually in the
 * work — and where there is no combat at all it invents antagonism that was
 * never there. The game's own vocabulary has to stay out of the research
 * entirely, or it quietly decides what gets researched.
 */
const REFERENCE_NOT_TEMPLATE = `THIS IS A REFERENCE WORK, NOT A STOCK OF READY-MADE GAME PIECES. Record what is TRUE about this work, in the work's own terms and vocabulary. Do not grade anything on a difficulty scale, do not sort anything into rarities or boss tiers, and do not describe anything as though it were about to be fought or equipped. Other parts of the app invent encounters and rewards later, and they do that better reading facts than picking from a list someone already made for them. Your job is to be accurate and thorough, not useful.`;

/**
 * Where a thing first turns up, so downstream features can be gated on how far
 * the user has actually got rather than on the entry as a whole.
 */
const INTRODUCED = `"introducedAt" is where this first appears, in the work's own units ("episode 3", "chapter 12", "act 2", "the second route"). "introducedPct" is that as a rough 0-100 percentage of the way through. Both are optional: omit them rather than guessing.`;

export const FACET_SPECS: Record<Facet, FacetSpec> = {
  cast: {
    query: "main characters full cast list who's who",
    brief: `Every named character of any importance: leads, supporting cast, mentors, rivals, recurring minor figures, memorable one-offs.
For each one write a short paragraph covering:
- who they are, what they do, and what part they play in the work
- what they LOOK like — build, hair, eyes, clothing, distinguishing features, colours. Be specific; a reader should be able to picture them.
- what they are capable of: skills, powers, training, expertise, or simply what they are good at
- how they behave and how they speak — temperament, manner, verbal tics, catchphrases
- who they are connected to, and how: family, rivals, mentors, partners, who they answer to
- any other names, titles, epithets or nicknames they go by, and which organisation they belong to
- how central they are to the work, and where in it they first appear`,
    nonFiction: `the cast is the real people: hosts, presenters, regular contestants, commentators, drivers, athletes, guests. Describe them as they actually are and actually look. Never dress a real person up as a fantasy creature.`,
    keys: ["characters"],
    shape: `{"characters": [{"name": "", "aliases": [""], "role": "protagonist | antagonist | supporting | mentor | rival | comic relief | narrator | ...", "prominence": "central | major | recurring | minor", "affiliation": "", "relationships": "how they connect to the rest of the cast", "description": "who they are and what they do", "appearance": "what they look like, concretely", "abilities": "what they are capable of", "personality": "temperament, manner, how they speak", "status": "", "introducedAt": "", "introducedPct": 0}]}`,
    structureNotes: `"prominence" is how central the character is TO THE WORK — a fact about the story, not a rating of anything. "central" is a lead, "minor" is someone who appears once or twice.\n${INTRODUCED}`,
  },
  conflict: {
    query: "central conflict antagonists rivalries what drives the story",
    brief: `What this work is ABOUT, in terms of opposition and tension. Two parts.

THE CONFLICTS: the tensions that actually drive it. Not a list of fights — the real pressures. A struggle against an empire, yes, but equally a rivalry, a deadline, a debt, an illness, a family expectation, a moral compromise, the weather, the passing of time. Name the ones a critic would name, and say what is at stake in each.

WHO AND WHAT STANDS IN OPPOSITION: the antagonists — individuals, groups, institutions, forces of nature, or the recurring creature and enemy types the work has if it has any (name the classes as the work names them). For each: who or what it is, what it wants and why, how it operates and what it is capable of, who or what it is set against, and what it looks like.

Where a work has no villain at all, that is a fact worth recording plainly — describe what actually creates its tension instead, and do not manufacture an adversary to fill the space.`,
    nonFiction: `the opposition is real and usually not personal: rival competitors, rival teams, the reigning champion, the defending title-holder, the format's own difficulty, the clock, the weather, the conditions, the rules themselves.`,
    keys: ["conflicts", "antagonists"],
    shape: `{
  "conflicts": ["4-8 lines, each naming a central tension and what is at stake in it"],
  "antagonists": [{"name": "", "aliases": [""], "nature": "person | group | institution | creature type | force | circumstance", "motivation": "what it wants and why", "methods": "how it operates and what it is capable of", "opposedTo": "who or what it stands against", "description": "who or what it is", "appearance": "what it looks like, concretely", "affiliation": "", "introducedAt": "", "introducedPct": 0}]
}`,
    structureNotes: `Do not invent an antagonist the notes do not describe. A work whose "antagonists" list is short and whose "conflicts" list is long is being recorded correctly, not badly.\n${INTRODUCED}`,
  },
  world: {
    query: "setting worldbuilding locations factions organizations glossary terminology",
    brief: `How this world works and what is in it. Five parts.

PLACES: every named location of note — cities, regions, buildings, ships, realms, venues. For each: what it is, what it looks and feels like, what larger region it sits in, and what happens there.
GROUPS: every faction, organisation, team, house, guild, corporation, network or recurring group. For each: what they are, what they want, who they answer to, who belongs to them, and their emblem, uniform or colours.
VOCABULARY: the in-universe terms — ranks, currencies, magic or tech systems, institutions, titles, laws, slang, catchphrases. For each: what it means and what kind of term it is.
HOW THE WORLD WORKS: the formal systems it runs on, described as systems — its magic or technology and what the rules and costs of using it are, its ranks or hierarchies and how someone moves through them, its economy, its law, its politics. Name them as the work names them. If the work has no such system, say so plainly rather than inventing one.
EVERYDAY LIFE: the texture of it — what ordinary people do, eat, wear, believe and worry about, and how class, work and family are arranged.`,
    nonFiction: `all of it is real. Places are the actual venues — circuits, studios, arenas, the cities it is filmed or held in. Groups are the real teams, constructors, networks, production companies or recurring line-ups. Vocabulary is the genuine jargon: DRS, the undercut, the rules of the game, scoring terms, in-show catchphrases. "How the world works" is the real format and regulations — the points system, the rules, the qualifying structure, the eligibility criteria.`,
    keys: ["locations", "factions", "terminology", "worldRules", "everydayLife"],
    shape: `{
  "locations": [{"name": "", "region": "the larger place it sits in", "description": "what it is", "atmosphere": "what it looks and feels like", "whatHappensThere": "", "introducedAt": "", "introducedPct": 0}],
  "factions": [{"name": "", "goal": "what they want", "opposes": "who they stand against", "members": ["notable members"], "symbol": "emblem, uniform or insignia", "colors": "", "description": "what they are", "introducedAt": "", "introducedPct": 0}],
  "terminology": [{"term": "", "meaning": "", "category": "rank | currency | magic or tech | institution | title | law | slang | catchphrase | other", "introducedAt": "", "introducedPct": 0}],
  "worldRules": "the formal systems the world runs on and the rules and costs that govern them; empty string if it has none",
  "everydayLife": "the texture of ordinary life in it"
}`,
    structureNotes: INTRODUCED,
  },
  things: {
    query: "notable objects artifacts equipment props what characters carry",
    brief: `The objects this work is associated with: things characters carry, wear, drive, treasure or fight over, and the ordinary props it is remembered for.
For each one write a short paragraph covering:
- plainly WHAT IT IS, in ordinary words. A sword is a sword; a cassette tape is a cassette tape; a laminated badge is a laminated badge.
- what it LOOKS like and what it is made of — shape, materials, wear, markings, colour
- what it does, or what it is for
- what it MEANS in the work: why it matters, what it represents, what turns on it
- who owns or uses it, and where it came from
Include the ordinary and the everyday, not only the legendary. A work's most memorable object is often mundane.`,
    nonFiction: `the objects are real equipment and paraphernalia: the cars, the trophy, the buzzer, the format's props, the signature gear, the kit.`,
    keys: ["items"],
    shape: `{"items": [{"name": "", "nature": "plainly what kind of object it is, in ordinary words", "material": "what it is made of", "appearance": "what it looks like, concretely", "purpose": "what it does or what it is for", "significance": "what it means in the work and why it matters", "owner": "", "origin": "", "description": "", "introducedAt": "", "introducedPct": 0}]}`,
    structureNotes: INTRODUCED,
  },
  craft: {
    query: "premise plot summary themes art style visual design soundtrack production reception",
    brief: `What this work is like as a made thing, and how it landed. Cover, in prose:
- the premise in one spoiler-free line, then a fuller summary of what actually happens
- the setting: where and when, how advanced, how it is governed, what daily life is like
- the tone and register, and who it is for — how mature, and anything a newcomer should be warned about
- its recurring themes and preoccupations
- how it is structured and paced: arcs, routes, seasons, volumes, acts, episode or chapter counts, episodic or serialised
- what sets it apart from the obvious comparisons — the thing its admirers name first
- the setpieces, beats and images it is famous for, avoiding ending spoilers
- its sound: score, composer, instrumentation, signature sounds or voices
- its VISUAL identity in detail — the medium and technique it is rendered in, its palette, how it is lit and in what weather and time of day, its line quality and how much detail it resolves, how shots are framed, the design language of its people and creatures, and its recurring motifs, emblems and architecture. An adaptation does not look like its source; describe how THIS version looks.
- how it was made: the studio, the authors, the notable production or development history, anything unusual about how it came to exist
- how it was received: acclaim or dismissal, awards, controversy, its reputation now, what it influenced
- the descriptive words that would classify it: its genres, and the subject matter, mechanics, structure, mood and audience terms that apply`,
    nonFiction: `do not force it into a story it does not have and do not invent one. The setting is the real world it takes place in — the sport, the era, the calendar, the studio — the structure is its real format (rounds, race weekends, episode formats, seasons), and the themes are what it is actually about. Say plainly that this is a non-fiction work.`,
    keys: [
      "premise", "overview", "setting", "tone", "themes", "structure", "distinctive",
      "signatureMoments", "soundAndMusic", "audience", "contentWarnings",
      "relatedWorks", "production", "reception", "artStyle", "genres", "tags",
    ],
    shape: `{
  "premise": "one spoiler-free sentence — the hook someone would be given before starting",
  "overview": "3-5 sentences on what it is and what happens in it",
  "setting": "2-3 concrete sentences on the world, era and places — geography, technology, social order",
  "tone": "one line on mood and register",
  "themes": ["6-10 recurring themes or motifs"],
  "structure": "how it is organised and paced",
  "distinctive": "what separates it from the obvious comparisons",
  "signatureMoments": ["4-8 famous setpieces, beats or images. Avoid ending spoilers"],
  "soundAndMusic": "its sonic identity",
  "audience": "who it is for and how mature it is",
  "contentWarnings": ["anything worth knowing in advance; empty if nothing notable"],
  "relatedWorks": ["sequels, prequels, adaptations and other entries in the same franchise, with format and year"],
  "production": "who made it and how; notable development or production history",
  "reception": "how it was received, its reputation, awards or controversy, what it influenced",
  "artStyle": {
    "summary": "the visual style named precisely (cel-shaded anime key-art, gritty photoreal 3D, 16-bit pixel art, ligne claire ink, watercolour…)",
    "medium": "the medium or technique it is rendered in",
    "palette": "its characteristic colours",
    "lighting": "how it is lit, and the weather and time of day it sits in",
    "linework": "line quality, rendering, texture, how much detail it resolves",
    "composition": "how shots are framed and composed",
    "characterDesign": "the design language of its people and creatures",
    "iconography": "recurring motifs, emblems, logos, insignia, costume or architecture cues"
  },
  "genres": ["3-6 genre terms, most defining first"],
  "tags": ["12-20 descriptive tags: subject matter, mechanics, structure, mood, audience"]
}`,
  },
  lore: {
    // Named narrowly so retrieval fetches pages about THIS version, and about
    // what people SAID. A bare "famous quotes" query on a seasonal title returns
    // the franchise's greatest hits and a glossary of its patch notes, which is
    // precisely the material that must not be used.
    query: "iconic quotes catchphrases memes behind the scenes trivia what fans still say",
    brief: `MEMORIES — the handful of small things that give someone who knows this work a jolt of recognition.

That word is the brief. Not "notable quotations", not "trivia": a memory is a fragment that lands because the reader was there. Somebody who was not there reads it and shrugs, and that is fine — it was never for them.

START HERE, BECAUSE EVERYTHING ELSE FOLLOWS FROM IT: you are collecting things people SAY, not things the work HAS. An utterance, not a label. Someone types it into a chat with another person who loves the same thing, unprompted, and is understood — that is the entire test, and it is the only one that matters.

=== WHAT MAKES ONE GOOD ===

These get printed alone, in italics, under the title of a library. One line, no context, nothing around it. So:

IT CARRIES A WHOLE FEELING IN A FRAGMENT. "Wait for the trade." is four words holding a complete argument: monthly issues cost too much, the story does not land in twenty-page pieces, and the person saying it has been doing this for years. Compression is the craft. A line that needs a second sentence to arrive has not arrived — and the corollary is the sharpest test in this brief: IF THE LINE NEEDS ITS \"why\" FIELD TO LAND, IT IS THE WRONG LINE. That field is a note for an archivist, never the setup for a punchline. Move the meaning into the text or drop the entry.

THE SPECIFIC DETAIL IS THE CREDENTIAL. "The scanlation group went quiet at chapter 214." The number is what makes it true. Anyone can say a series had translation trouble; only a reader says 214. One concrete thing — a number, an object, a moment, a small defeat — is what separates a line from an observation. Categories are not details: "recurring humour about the protagonist's poor sense of direction" is a category, "Zoro is lost again. He was standing right there." is a detail.

RECOGNITION IS THE PAYOFF, AND IT IS MEANT TO BE BINARY. These are passwords. Half the readers nod and the other half see nothing, and that is the design — the nod is the whole reward. A line rewritten so everyone can follow it has destroyed the thing that made it worth printing. Never explain, never gloss, never wink.

THE AFFECTION IS LOAD-BEARING. Almost all of these are complaints from people who love the thing. "Togashi is on hiatus again." is exasperated and devoted at once. Pure snark reads as contempt for something the user chose to spend a hundred hours on; pure praise reads as marketing. Rueful is the register.

IT DOES NOT ANNOUNCE ITSELF AS A JOKE. State the fact deadpan and let the recognition do the laughing. No "and we all know", no exclamation added for energy, no signalling that a joke is arriving.

IT HAS A SHAPE. Either a setup and a turn — "The character creator took ninety minutes. The helmet covers the face." — or a flat statement whose comedy is the flatness — "Bought in the sale, installed, never launched." What kills a line is trailing off: a strong open and a vague close reads worse than either half alone.

=== THE THREE KINDS ===

QUOTE — WORDS FROM INSIDE THE WORK. Said aloud, yes, but written counts just as much: text on a screen, a title card, a sign, a scrawl on a door, a line of interface, a sound effect printed on the page, a loading message. "Don't open, dead inside." is never spoken by anyone; it is painted on a door, and it is one of the most quoted things its season produced. YOU DIED. Reticulating splines. SNIKT. All quotes.
Catchphrases live here too, and they are the easiest ones to miss because they are so familiar they stop registering as lines. If a character says a thing every week, or a show opens the same way every episode, that is a quote and probably the best one available. Take Supernatural's first season: "Driver picks the music, shotgun shuts his cakehole." is right, and so is "Saving people, hunting things — the family business.", and so is "Dad's been on a hunting trip, and he hasn't been home in a few days." — the last one being the line the show opened on again and again. Do not stop at two when the third is the one people actually say.
Word for word. The exact wording is the whole value and an approximation is worthless. Marketing copy is not a quote; if it sounds like it came off a trailer, it did.
A line from the work that went on to become a meme is still a QUOTE — see the note under jokes. It is filed by where the words came from, not by how famous they got.

REFERENCE — SOMETHING YOU KNOW ABOUT THE WORK, not words from inside it. The production story, the fun fact, the thing the fandom has collectively decided is true. Written the way one fan tells another, short and flat, with no throat-clearing:
  "Gooseworx actually hates this."
  "Probably the most accurate video-game adaptation ever made."
  "Should have been in cinemas."
  "The whole thing was a sketch on an imageboard before it made grown adults cry."
Those are verdicts and trivia, not quotations, and they are the kind that gets written least often because it is the least obvious. Go looking for it deliberately: who made it and what they have said about it since, what it was nearly called, what got cut, what the fandom argues about, what it is agreed to have deserved and not got. Never a bare noun phrase, never a wiki sentence — a thing a person would say.

JOKE — WHAT THE FANDOM SAYS, PERFORMED. This is where the generated ones fail most often, and the failure is always the same: reporting the joke instead of telling it. A joke has a stance and a delivery. A fact has neither.
  NO   "Sam wears women's underwear."
  YES  "Did you know Sam Winchester wears women's underwear?"
  NO   "The subreddit is dedicated to rubber duckies."
  YES  "Killing people with rubber ducks since 2016."
Same material both times. What changes is that the second one is being SAID to someone. Shapes that work: the conspiratorial question ("Did you know…?"), the mock tagline ("… since 2016."), the resigned report of a running gag ("Zoro is lost again. He was standing right there."), the affectionate complaint ("Togashi is on hiatus again."), the flat overstatement played straight.
THE TEST: if it would sit unchanged in the Trivia section of a wiki, it is not a joke yet. Say it out loud. If nobody is speaking, rewrite it until someone is.

MEMES COUNT, AND THEY ARE THE STRONGEST VERSION OF THIS. A meme is an inside joke that spread far enough to become a format, so if a work produced one it is almost certainly the best memory that work has — go looking for it first, not last. Three things about them:

- A MEME HAS A CANONICAL WORDING. Reproduce it exactly, the way you would a quote. Paraphrase kills it: "Players press F to show respect" is not "Press F to pay respects", and only the second one is recognised by anybody.
- WHICH KIND IT IS depends on where the words came from, not on the fact that it is a meme. If the wording is from the work — a line, a screen, an interface prompt — file it as a QUOTE. If the fandom wrote it themselves, file it as a JOKE. "One does not simply walk into Mordor." is a quote that became a meme; "Togashi is on hiatus again." is a joke its readers made up. Both belong here; they just belong under different kinds.
- IF IT IS AN IMAGE, IT NEEDS WORDS TO SURVIVE. Only text is printed, so a purely visual meme cannot be used — and must not be DESCRIBED instead. "The one where he points at the screen" is a caption for a picture nobody can see, which is the label failure again in a new coat. Either the meme carries its own words, or it does not belong.

A meme that outgrew its source still counts. Plenty of people know "Press F to pay respects" without knowing which game it came from; the user who finished that game knows both, and that doubled recognition is exactly what this is for.

Most works have no meme at all, and that is unremarkable. Never manufacture one — a work without a meme has other memories.

=== WORKED EXAMPLES ===

The same material, wrong and then right:

  NO   "The Waiting Room"                                    a name for a topic
  YES  "Two hundred chapters of waiting, and he arrives in a mid-season patch."

  NO   "The 35 GB DLC"                                       a name for a complaint
  YES  "Uninstalled the texture pack. Got thirty-five gigabytes and a blurry hero."

  NO   "The series' notorious publication delays"            a summary
  YES  "Togashi is on hiatus again."

  NO   "The game's punishing difficulty is a running theme"  a category
  YES  "Git gud."

  NO   "Praise the sun! (a gesture players use to express camaraderie)"
  YES  "Praise the sun."                                     never gloss it

  NO   "An iconic death screen appears on failure"           a description of a thing
  YES  "YOU DIED"                                            the thing itself

  NO   "Fans frequently discuss this character's popularity"  not a line at all — drop it

And one that is a real quotation and still fails: a line genuinely spoken in the work that nobody has ever repeated. Accuracy is not the bar. The bar is that it LEFT the work.

=== WHERE TO FIND THEM ===

Look where people are using these lines, not where people are explaining them:

- The work's own wiki, especially a /Quotes subpage — most fan wikis keep one.
- Threads asking "favourite line", "most iconic moment", "what do you still quote".
- Comment sections and forum posts where the phrase is dropped casually with NO explanation attached. This is the strongest possible evidence: it means the phrase is common currency.
- Video titles and top comments that quote the line back.
- Memes built on it, and meme databases. A line that survives being turned into a template is a line that landed, and the template's own wording is the form to record. Check whether the phrase has a life outside the work's own community — that is the ceiling of recognition.
- Retrospectives and anniversary pieces, which tend to collect the famous beats.
- For anything live-service or serialised: the reaction threads to the specific update, where the community's own name for what happened shows up.
- Merchandise. A line printed on a shirt has already proved itself.

For REFERENCES specifically, which are the ones most often missed, look somewhere else entirely: interviews and commentary tracks, "behind the scenes" and "making of" pieces, the trivia section of a wiki or database entry, what the creator has said about it since, what was cut or nearly changed, and the arguments the fandom keeps having. That last one is where a verdict like "should have been in cinemas" comes from — a thing everybody thinks and nobody had to be told.

THE FIELD TEST: if every result you can find is an article EXPLAINING the phrase, it is trivia and not currency — leave it out. If you find it used in passing, by strangers, as though everyone already knows it, it belongs here.

DO NOT MINE THE MARKETING. Store pages, press releases, trailer voiceover, the publisher's own blurb and the "about" section produce confident, well-formed, worthless lines. Nobody quotes an announcement.

=== IT MUST BELONG TO THIS VERSION ===

The trap on everything that comes in seasons, updates, remakes and re-releases: a famous line from the wider franchise or from the base game is NOT a line from the season, update or edition being described. Asked about one season of a hero shooter, "HULK SMASH" is the wrong answer — Hulk was there before it and will be there after; it says nothing about this season and would read identically under any other. Ask instead: would someone who experienced ONLY this version recognise it, and would someone who experienced every version EXCEPT this one not? What qualifies is what this version introduced or is remembered for — the new character's line, the event's own catchphrase, the bug or the balance decision it became notorious for, the thing the community would not stop saying while it ran.

=== HOW MANY ===

Up to six, and fewer is usually right. There is no minimum.

The reason is the way these are used: the app shows exactly ONE of them at a time, chosen at random. A weak entry is not diluted by the strong ones around it — it simply gets its own turn on the page, alone, as the only thing the user sees. Six entries of which two are padding is not a better answer than two, it is a worse one, because a third of the time it prints the padding.

So: six only for something with a deep, well-documented well of quoted material. Two is a completely normal answer, and the right one for anything recent, niche, quietly regarded, or where you find yourself reaching. One is fine. None is fine. Stop as soon as the next candidate is weaker than the ones you have — that is the signal you are finished, not a problem to solve.

Never pad. Never assemble a line from facts because a slot is empty. A fabricated quote is the single worst thing this research can produce, because it will be shown to the user as a real line from something they finished.

=== FORMAT LINES ===

At most two may be about the format rather than the work. Mark those "scope": "medium"; everything else is "scope": "work". A format line is about the EXPERIENCE of consuming this kind of thing, of the specific sort this work puts people through — "The bookmark has not moved since March." "Saved before the boss. Saved after the boss. Saved between the two, just in case." "A guide is open in the other window. It has been since hour one."

Extra rules for one: no proper nouns, no title, no character — it must still read true for someone who has never touched this work. And it must be a real habit of the format, not an observation you constructed to fill the slot; if nothing about this work points at one, return none, which is much the more common case.

=== FINALLY ===

Avoid anything that only lands if you know the ending, and avoid the crude and the sexual — these get printed above a library page.`,
    nonFiction: `the lines are the real ones: the presenter's catchphrase, the format's stock phrase, the commentator's famous call, the running joke about the show that its viewers all share. Not the name of a segment, a rule or a trophy — what people actually say about it.`,
    keys: ["flavorTexts"],
    shape: `{"flavorTexts": [{"text": "the line itself, complete and quotable on its own", "kind": "quote | reference | joke", "scope": "work | medium", "attribution": "who says it, or where it appears", "why": "at most eight words of context for an archivist — NOT an explanation of the line"}]}`,
    structureNotes: `AT MOST six entries, and there is no minimum — an empty array is a valid answer and so is one entry. Record every line the notes actually support and not one more. If the notes offer two strong lines, return two: the app shows ONE of these at a time, so a padded entry does not average out, it gets its own turn on the page alone. NEVER invent one to fill a slot.
"text" must be a complete utterance — something a person says. A bare noun phrase is a glossary headword, not a line: if an entry reads like the title of a topic ("The Waiting Room", "Crimson Chronovium", "The 35 GB DLC"), either the notes contain the actual line and you should use that instead, or they do not and the entry must be dropped.
If "text" only makes sense once "why" is read, the entry is wrong. Fix it or drop it.
Reproduce a quote exactly as the notes give it — do not tidy the grammar, translate it, or trim it. Never add a gloss, a parenthetical or an explanation to a line.
"attribution" is optional and omitted when the notes do not name a speaker. "scope" is "work" unless the notes marked the line as being about the format rather than the work; a "medium" line names no title and no character, and never carries an attribution.`,
  },
};

export const FACETS = Object.keys(FACET_SPECS) as Facet[];

/** How many entries each list should carry before the research counts as thin. */
export const FACET_FLOORS: Partial<Record<string, number>> = {
  characters: 8,
  antagonists: 5,
  factions: 4,
  locations: 6,
  items: 8,
  terminology: 8,
};

/** Which facet to re-run when a given list comes back short. */
export const FACET_FOR_KEY: Record<string, Facet> = {
  characters: "cast",
  antagonists: "conflict",
  factions: "world",
  locations: "world",
  terminology: "world",
  items: "things",
};

/** Everything the later passes need to know about the work, settled up front. */
export interface ResearchContext {
  subject: CodexSubject;
  identity: CodexIdentity;
}

/**
 * The block that pins the research to ONE version of a title.
 *
 * The failure it prevents is quiet and constant: asked about a season, an
 * update or a remake, research drifts to the thing as a whole — the franchise's
 * famous lines, the base game's roster, the original film's cast — and, worse,
 * reaches forward into versions that have not happened yet from the point of
 * view of the entry. Both make the dossier wrong about the one thing the user
 * actually chose.
 */
function versionScope(subject: CodexSubject): string {
  const season = subjectSeason(subject);
  const edition = subjectEdition(subject);
  if (!season && !edition) return "";

  const lines = [
    `
SCOPE — THIS VERSION ONLY. The entry is "${subject.title}". A title is tracked one version at a time, and this dossier is about that version and no other.`,
  ];

  if (season) {
    lines.push(`- SEASON ${season}. Describe season ${season}'s own content: what it added, who arrived in it, what happened in it, what it was called. Not the show or game in general, and not what was already there before it.
- A point release inside it (${season}.5 and the like) IS part of season ${season} and belongs here.
- HARD RULE: nothing from season ${season + 1} or later. No character, event, mode, map or item that first appeared after this season ended — that is both a spoiler and, for anything live-service, simply not part of what the user is tracking. Earlier seasons are fair game as background; they have already been seen.`);
  }

  if (edition) {
    lines.push(`- THIS IS THE ${edition.toUpperCase()}. It is not the original, and the two differ in ways that matter: cast, art, content, sometimes the ending. Where they differ, describe THIS one. Where a fact belongs only to the original, leave it out or say plainly that it is inherited.`);
  }

  return lines.join("\n");
}

/**
 * The line the retrieval provider keys its search on.
 *
 * `:online` derives its query from the message, so the first thing in the
 * message should read like something a person would type into a search box —
 * not like the opening of a system prompt.
 */
export function searchQueryLine(subject: CodexSubject, identity: CodexIdentity | null, suffix: string): string {
  const season = subjectSeason(subject);
  const year = identity?.year || subjectYear(subject) || "";
  const edition = subjectEdition(subject);
  const parts = [
    identity?.title || subject.title,
    season ? `season ${season}` : "",
    edition || "",
    year ? String(year) : "",
    TYPE_QUERY_WORD[subject.mediaType] || subject.mediaType.toLowerCase(),
    suffix,
  ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * PASS 1 — which work is this, and what else is it called?
 *
 * Short on purpose: it is the only call whose search query needs to be about the
 * work's identity, and a long prompt would bury it. Its second job is finding
 * the work's other names, which is what the facet searches are keyed on — a
 * visual novel is far easier to find under its Japanese title, and a series
 * under the name its wiki uses rather than its streaming label.
 */
export function buildIdentifyPrompt(subject: CodexSubject, correction?: string): string {
  const year = subjectYear(subject);
  const season = subjectSeason(subject);
  const typeBrief = TYPE_BRIEF[subject.mediaType] || `a ${subject.mediaType}`;

  const known = [
    subject.subtitle ? `Also listed as: ${subject.subtitle}` : "",
    subject.creator ? `Creator / author / studio / director: ${subject.creator}` : "",
    subject.publisher ? `Publisher: ${subject.publisher}` : "",
    year ? `Release year: ${year}${subject.year ? "" : " (expected)"}` : "",
    subject.releaseStatus ? `Release status: ${subject.releaseStatus}` : "",
    subject.franchises?.length ? `Franchise: ${subject.franchises.join(", ")}` : "",
    subject.platforms?.length ? `Platforms: ${subject.platforms.join(", ")}` : "",
    subject.language ? `Language: ${subject.language}` : "",
    subject.description ? `Synopsis on record: ${String(subject.description).slice(0, 500)}` : "",
  ].filter(Boolean).join("\n");

  const constraints = [
    `- FORMAT: it must be ${typeBrief}.`,
    year
      ? `- YEAR: it was released in ${year}. A work of the same name from a different year is a DIFFERENT work — a remake, a reboot, a sequel or an adaptation. Do not describe the ${year < 2015 ? "newer" : "older"} one.`
      : `- YEAR: unknown. If several works share this name, say so in "notes" and pick the one that best matches the other details.`,
    subject.creator ? `- CREATOR: it is by ${subject.creator}. A same-named work by someone else is a different work.` : "",
    subject.franchises?.length ? `- FRANCHISE: it belongs to ${subject.franchises.join(", ")}.` : "",
    subject.description ? `- SYNOPSIS: it must match the synopsis on record above. If your candidate's plot or subject matter contradicts it, you have the wrong work.` : "",
    season ? `- SEASON: the entry is SEASON ${season}. Identify the title first, then confirm it has that season. Seasons are not only a television thing — a live-service game's numbered seasons count, and each is its own entry.` : "",
    subjectEdition(subject) ? `- VERSION: the entry is the ${subjectEdition(subject)}, NOT the original release. Confirm that this version exists and identify it specifically.` : "",
  ].filter(Boolean).join("\n");

  const correctionBlock = correction
    ? `\n\nYOUR PREVIOUS ANSWER WAS WRONG. ${correction}\nStart again and satisfy every constraint above.\n`
    : "";

  return `${searchQueryLine(subject, null, `${subject.creator || ""} wiki release date`)}

You are the Codex Archivist of FauxLore. Before anything is researched about this media entry, work out exactly which work it is.

ENTRY: "${subject.title}" (${subject.mediaType})
${known || "(No further details on record.)"}

Your candidate must satisfy ALL of these:
${constraints}

Popular names are reused constantly — a cartoon and its live-action remake, a game and the show adapted from it, a novel and its film. Picking the wrong one makes every later fact wrong too.${correctionBlock}

You also need every OTHER NAME this work goes by, because the research that follows will be searched under them. Look for:
- its original-language title, and the romanisation of it
- its English or localised title, if that differs
- regional or alternate release titles
- official abbreviations and the short forms fans actually use
- the name its wiki, database entry or fan community files it under
Do not limit yourself to the names given above — go and find the ones that are missing.

Return ONLY a pure JSON object, no markdown fence, no commentary:
{
  "title": "the work's own full title as published",
  "year": ${year || 0},
  "type": "film | television series | reality or competition show | documentary series | sporting competition | video game | novel | manga | comic | visual novel | audiobook | podcast",${season ? `
  "season": ${season},` : ""}
  "creator": "studio, author, director or developer",
  "alsoKnownAs": ["every other title, romanisation, abbreviation or fan name this is known by"],
  "why": "one sentence on how you know this is the right one and not a same-named work",
  "alternatives": ["same-named works you rejected, with their year and format"],
  "sources": ["up to 4 URLs you actually consulted"],
  "confidence": "high | medium | low",
  "notes": "anything ambiguous (empty string if all clear)"
}

If NOTHING matches the format and year, do not substitute the famous one: say so in "notes", set "confidence" to "low", and answer for the work that was actually asked for.`;
}

/**
 * PASS 2 — research one subject area, and write prose.
 *
 * No JSON here. Asking for a schema at the same time as the research makes the
 * model spend its attention on shape instead of substance, and a truncated JSON
 * array loses the tail of the cast. Prose can run as long as it needs to and is
 * turned into the dossier's shape afterwards, for a fraction of the cost.
 */
export function buildFacetPrompt(ctx: ResearchContext, facet: Facet, alreadyFound?: string[]): string {
  const spec = FACET_SPECS[facet];
  const { subject, identity } = ctx;
  const season = subjectSeason(subject);
  const title = identity.title || subject.title;
  const aka = (identity.alsoKnownAs || []).filter(Boolean).slice(0, 8);

  const gapBlock = alreadyFound?.length
    ? `
THIS IS A SECOND PASS. The first one came back thin. These are already on file — do NOT write them up again, find the ones that are missing:
${alreadyFound.slice(0, 60).join(", ")}
Go after the ones a first look misses: the recurring minor names, the regional and the everyday, the things listed further down the page.`
    : "";

  return `${searchQueryLine(subject, identity, spec.query)}

You are the Codex Archivist of FauxLore, researching ONE subject area of ONE work. The work has already been identified — do not question it, and do not describe a different one.

THE WORK: "${title}"${identity.year ? ` (${identity.year})` : ""}${identity.creator ? `, by ${identity.creator}` : ""} — ${TYPE_BRIEF[subject.mediaType] || `a ${subject.mediaType}`}.
${aka.length ? `ALSO KNOWN AS: ${aka.join(" · ")} — search under these too, especially the original-language title, where the detailed material usually is.` : ""}${versionScope(subject)}
${gapBlock}

WRITE UP: ${spec.brief}

${REFERENCE_NOT_TEMPLATE}

How to answer:
- Prose, not JSON, not a schema. Headings and bullets are fine. Length is not a problem — this is the one place the detail gets recorded, and everything the app later invents is built from it.
- Name things. Never write "various characters", "several locations" or "a rich world" — those are worth nothing to the reader of this dossier.
${facet === "lore"
  ? `- SELECTIVITY IS THE POINT, and this facet is the exception to how the others work. Every other part of the dossier wants the long tail; this one wants only what genuinely cleared the bar above. Two lines you are sure of beat six with four you talked yourself into.`
  : `- BREADTH IS THE POINT. The obvious headline entries are the easy part; the value is in the long tail. Aim well past a dozen entries where the work supports it, and include the minor, the regional and the everyday.`}
- Prefer widely known material. Avoid late-story twists and ending spoilers — the user may still be partway through.
${facet === "lore" ? "" : `- Write it as an encyclopedia would: what is true, in the work's own vocabulary. Not a pitch, not a stat block, not a list of things someone could use.\n`}
- If you genuinely cannot verify something, leave it out and say so at the end rather than inventing it. A short honest answer beats a padded one.
- Finish with one line: CONFIDENCE: high | medium | low, and a few words on why.

IF THIS IS NOT FICTION — a reality or competition show, a documentary, a podcast, a sporting competition — the subject area still applies, it just means real things: ${spec.nonFiction}`;
}

/**
 * PASS 3 — turn one facet's prose into the dossier's shape.
 *
 * No web search: everything it needs is in the prose above it. That means it can
 * run on the cheap model, and it gets the whole context window to spend on
 * getting the schema right rather than splitting it with retrieval.
 */
export function buildStructurePrompt(ctx: ResearchContext, facet: Facet, research: string): string {
  const spec = FACET_SPECS[facet];
  const { subject, identity } = ctx;
  const season = subjectSeason(subject);

  return `You are converting research notes into a structured record. The notes below were gathered about "${identity.title || subject.title}"${identity.year ? ` (${identity.year})` : ""}${season ? `, season ${season}` : ""}${subjectEdition(subject) ? ` (${subjectEdition(subject)})` : ""}.

=== RESEARCH NOTES ===
${research}
=== END NOTES ===

Convert those notes into JSON. Rules:
- Use ONLY what the notes contain. Do not add entries from your own knowledge, and do not correct them — if the notes are wrong, that is the researcher's problem, not yours.
- BE EXHAUSTIVE. Every named entry in the notes gets a record. Do not summarise, do not select the interesting ones, do not stop at ten. Dropping entries is the one thing that ruins this step.
- Fill every field the notes support. Leave a field out entirely when the notes do not cover it — never write "unknown", "N/A" or a guess.
- Keep the notes' own wording where it is concrete. Descriptions should be one or two tight lines.
- This is a reference record. Do not add difficulty ratings, rarities, tiers or any other grading the notes do not contain — if it is not in the notes it does not go in the record.
${spec.structureNotes ? `- ${spec.structureNotes}\n` : ""}
Return ONLY a pure JSON object, no markdown fence, no commentary, in exactly this shape:
${spec.shape}

Add one more key alongside the above: "confidence": "high | medium | low" — how much of this section the notes actually supported. Read the researcher's own confidence line if they left one.`;
}
