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
    query: "memorable quotes new voice lines what fans kept saying community reaction running jokes",
    brief: `The handful of lines this work is actually KNOWN BY.

START HERE, BECAUSE EVERYTHING ELSE FOLLOWS FROM IT: you are collecting things people SAY, not things the work HAS. An utterance, not a label. A person types it into a chat with another person who loves the same thing, unprompted, and is understood — that is the entire test, and it is the only one that matters.

The failure this instruction exists to prevent looks like research and is worthless:

  WRONG   "Crimson Chronovium"   — the name of a material
  WRONG   "The 50th Hero"        — the name of a milestone
  WRONG   "The Waiting Room"     — the name of a meme
  WRONG   "The 35 GB DLC"        — the name of a complaint

Those are glossary headwords. Nobody says them. Each is a topic someone might discuss, dressed up as a quotation. Now the same material done right — the joke IN the line, not underneath it:

  RIGHT   "Two hundred chapters of waiting and he arrives in a mid-season patch."
  RIGHT   "Uninstalled the texture pack. Got thirty-five gigabytes and a blurry Hulk."

THE DISQUALIFIER: if the line needs its "why" field to land, it is the wrong line. The "why" is a note for an archivist, not the setup for the punchline. Move the meaning into the text or drop the entry.

Three kinds count, and a good answer mixes them:

QUOTES — words actually spoken or written in the work, that people repeat. Word for word: the exact wording is the whole value of a quote and an approximation is worthless. Marketing copy is not a quote. A logline is not a quote. If it sounds like it came off a trailer, it did, and it does not belong here.

REFERENCES — words the audience has READ WITH THEIR OWN EYES so often that they work as quotation even though no character says them. Text on a screen, a sound written on a page, a stock caption, an interface string: YOU DIED. MEANWHILE… To Be Continued →. SNIKT. It is still a piece of TEXT the audience has seen. The name of a mechanic, an item, an event or a patch is NOT a reference, however specific it is.

INSIDE JOKES — what the fandom says about it rather than what the work says: the running gag, the affectionate complaint, the thing everyone who finished it brings up. Written out as they would actually say it, in one complete sentence.

HOW THEY SHOULD READ, all three kinds. A quote is reproduced exactly and needs no help. Everything you write yourself — every reference gloss, every inside joke — is dry, specific and complete. ONE concrete detail: a number, an object, a moment, a small defeat. Never a summary, never a topic, never a category. Twelve words is a good length and twenty is too many. Rueful rather than funny; a line that is trying to be a joke usually is not one.

THE BAR IS REPEATABILITY, NOT NOTABILITY. Not the most significant thing about it — the thing that gets said. "This season added the fiftieth hero" is a fact. "The fiftieth hero is a dinosaur and he is perfect" is a line. Only one of them belongs here.

IT MUST BELONG TO THIS VERSION. This is the trap on everything that comes in seasons, updates, remakes and re-releases, and it is worth being blunt about: a famous line from the wider franchise or from the base game is NOT a line from the season, update or edition being described. Asked about one season of a hero shooter, "HULK SMASH" is the wrong answer — Hulk was there before it and will be there after; it says nothing about this season and would read identically under any other. Ask instead: would someone who experienced ONLY this version recognise it, and would someone who experienced every version EXCEPT this one not? What qualifies is what this version introduced or is remembered for — the new character's line, the event's own catchphrase, the bug or the balance decision this update became notorious for, the thing the community would not stop saying while it ran.

BETWEEN THREE AND SIX. Not more. A work with two genuinely quotable lines gets two; a beloved one with a deep well of them still gets six, the six best. Nothing is gained by padding this out, and a padded list is worse than a short one because the weak entries are the ones the user will see.

AT MOST TWO OF THOSE MAY BE ABOUT THE FORMAT RATHER THAN THE WORK. Mark those "scope": "medium"; everything else is "scope": "work". A format line is about the EXPERIENCE of consuming this kind of thing, of the specific sort this work puts people through — "The bookmark has not moved since March." "Saved before the boss. Saved after the boss. Saved between the two, just in case." "The scanlation group went quiet at chapter 214." "A guide is open in the other window. It has been since hour one."

Those are the extra rules for one: no proper nouns, no title, no character — it must still read true for someone who has never touched this work. And it must be a real habit of the format, not an observation you constructed to fill the slot; if nothing about this work points at one, return none, which is much the more common case.

RETURNING NOTHING IS A CORRECT ANSWER. A quiet novel, a small game, a season too recent to have entered anyone's vocabulary — plenty of things have no lines of their own, and an empty answer costs nothing. Four honest entries beat six with two labels in them. A fabricated quote is the single worst thing this research can produce, because it will be shown to the user as a real line from something they finished.

Avoid anything that only lands if you know the ending, and avoid the crude and the sexual — these get printed above a library page.`,
    nonFiction: `the lines are the real ones: the presenter's catchphrase, the format's stock phrase, the commentator's famous call, the running joke about the show that its viewers all share. Not the name of a segment, a rule or a trophy — what people actually say about it.`,
    keys: ["flavorTexts"],
    shape: `{"flavorTexts": [{"text": "the line itself, complete and quotable on its own", "kind": "quote | reference | joke", "scope": "work | medium", "attribution": "who says it, or where it appears", "why": "at most eight words of context for an archivist — NOT an explanation of the line"}]}`,
    structureNotes: `Between three and six entries, or an empty array. NEVER invent one to reach three.
"text" must be a complete utterance — something a person says. A bare noun phrase is a glossary headword, not a line: if an entry reads like the title of a topic ("The Waiting Room", "Crimson Chronovium", "The 35 GB DLC"), either the notes contain the actual line and you should use that instead, or they do not and the entry must be dropped.
If "text" only makes sense once "why" is read, the entry is wrong. Fix it or drop it.
Reproduce a quote exactly as the notes give it — do not tidy the grammar, translate it, or trim it.
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
- BREADTH IS THE POINT. The obvious headline entries are the easy part; the value is in the long tail. Aim well past a dozen entries where the work supports it, and include the minor, the regional and the everyday.
- Prefer widely known material. Avoid late-story twists and ending spoilers — the user may still be partway through.
- Write it as an encyclopedia would: what is true, in the work's own vocabulary. Not a pitch, not a stat block, not a list of things someone could use.
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
