/**
 * How the Codex is researched: ONE call, with deep retrieval, for every title.
 *
 * It was fifteen. An identify call, then per subject area a research call and a
 * separate structuring call, a pass that decided which of those searches could
 * be skipped, and a gap-fill round afterwards. The reasoning behind the split
 * was sound on paper — `:online` is retrieval rather than an agent, so the
 * provider searches once on the message and injects the results before the model
 * writes a word, and one search keyed on a long prompt serves no question well.
 * Six tight queries beat one vague one.
 *
 * What that reasoning missed is that DEEP retrieval is not one search. It runs
 * its own iterative queries, which is precisely the thing the six separate calls
 * were being spent to imitate — and it does it inside a single request, so there
 * is one thing that can fail instead of fifteen. Measured on a game released the
 * same morning, one deep pass returned thirty-six sources across the publisher,
 * two wikis, a completion guide, review aggregators and Reddit, and filled every
 * section, for $0.076. The fifteen-call version cost $0.0716 and routinely
 * arrived with whole sections missing.
 *
 * So the prompt below is the whole procedure. It does not have to be a good
 * search query in the old sense, because deep retrieval writes its own; it has
 * to be a complete brief. Nothing in it is compressed to fit — input is about 5%
 * of what a dossier costs, and the one trial that did compress it got back
 * exactly the weak, explained-instead-of-performed memories the long brief had
 * been rewritten four times to prevent.
 *
 * `FACET_SPECS` survives the collapse. It is no longer a list of calls; it is
 * the sectioned brief and the shape, and `buildDossierPrompt` assembles both
 * from it so there is still one place to edit a section.
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

/**
 * What "visual identity" means for this kind of work.
 *
 * The vocabulary of art style is overwhelmingly drawn from illustration —
 * linework, palette, character design — and asked in those terms a researcher
 * quietly reframes everything as if it were animated. A live-action drama gets
 * described as though somebody inked it, a photoreal game as though it were a
 * cartoon, and a novel gets an invented art style because the question assumed
 * one existed. The app covers everything from prestige television to pixel-art
 * roguelikes to audiobooks, so the question has to change shape per medium.
 */
const VISUAL_IDENTITY_BY_TYPE: Record<string, string> = {
  Movie: `This may be live action, animated, or a mix — establish which FIRST, and describe what it actually is. For live action that means cinematography rather than drawing: the lens language and depth of field, whether it was shot on film or digital and how it is graded, its aspect ratio, how it is lit and with what quality of light, the camera's behaviour (locked off, handheld, crane, long take), the production design, costume and make-up, the practical-versus-digital balance of its effects, and its grain and texture. For animation, describe the animation technique itself.`,
  Series: `This may be live action, animated, documentary or a studio-format show — establish which FIRST. Live action means cinematography, not drawing: lens language, film or digital and how it is graded, aspect ratio, lighting quality, camera behaviour, production design, costume and make-up, and how it uses effects. A studio or panel show has a real visual identity too — its set, its lighting rig, its title sequence, its graphics package. Describe whichever this actually is.`,
  Game: `Establish the rendering approach FIRST: photoreal 3D, stylised or toon-shaded 3D, hand-painted 3D, 2D sprite or pixel art, hand-drawn animation, isometric, first-person, or something else. Then describe it in the terms that approach actually uses — for 3D that means material and surfacing treatment, poly and detail density, lighting model, post-processing signature (bloom, chromatic aberration, grain, colour grade), and camera perspective; for pixel art it means resolution, palette limits and animation cadence. Name the engine look if it has a recognisable one.`,
  "Visual Novel": `Establish FIRST whether the art is anime-style illustration, painted, photographic, 3D-rendered or photo-composite, since western and Japanese titles differ sharply here. Then cover the character-sprite style and how expressions are handled, the background treatment (painted, photographic, filtered photography, 3D render), the CG illustration style at set-piece moments, and the interface and text-box design, which is a real part of how these look.`,
  Manga: `Ink and page craft: line weight and confidence, screentone versus hatching versus digital shading, how black is used, panel shapes and page rhythm, how motion and impact are drawn, and the character design language — proportions, eyes, hair, faces. Note whether it is published in black and white and how any colour pages differ.`,
  Comic: `Ink and colour craft: line weight and finish, whether it is inked or painted or digitally rendered, the colouring approach (flats, rendered, watercolour, limited palette, halftone), lettering and sound-effect design, panel and page layout, and the character design language. Note the era's printing look if that is part of its identity.`,
  Book: `A novel has no rendered form of its own, so do NOT invent an art style for it. Describe instead the visual register it is ASSOCIATED with, which is a real and useful thing: the tradition its covers belong to and how they have been designed across editions, any interior illustration or map work and by whom, how it is depicted when it is depicted — adaptations, official art, the way its readers picture it — and where its world sits on the scale from grounded and realistic to heightened and fantastical, with the period, materials and textures that world implies. If it genuinely has no established visual identity at all, say so plainly rather than manufacturing one.`,
  Audiobook: `An audiobook or podcast has no visual form. Do not invent one. Describe its cover and packaging design if it has a distinctive one, and otherwise the visual register its subject matter implies — the period, the materials, the textures, how grounded or heightened its world is — and say plainly that this is an association rather than a rendered style. For a non-fiction show, that may be nothing more than its own branding, which is an honest answer.`,
};

/**
 * Where a work of this type is written about when it is NOT famous.
 *
 * This is the half of the library the research is worst at. Any model already
 * knows Star Wars, so retrieval barely matters there; for a small western AVN or
 * a self-published webcomic it is the only thing that matters, and a general
 * search returns nothing because the general web has nothing. Naming the places
 * that DO cover it is the difference between a usable dossier and a shrug — and
 * a thin Codex hurts more than a thin famous one, because every later feature
 * has no prior knowledge to fall back on.
 */
const NICHE_SOURCES: Record<string, string> = {
  "Visual Novel": "for a small or independent title: the developer's own devlog, Patreon or Discord announcements, its itch.io page, its VNDB entry, F95zone and Lemmasoft threads, and long-running community wikis. Fan wikis for these are often one or two dedicated editors and are still the best record that exists",
  Game: "for an indie or early-access title: the Steam page and its update history, the developer's devlog and Discord, itch.io, and subreddit or forum threads written by people actually playing it",
  Book: "for a self-published or small-press book: Goodreads reviews and lists, the author's own site and newsletter, Royal Road or Wattpad if it started serialised, and dedicated reader forums",
  Manga: "for something unlicensed or niche: MangaDex and MangaUpdates entries, scanlation group pages and their release notes, Baka-Updates, and the series' own fan wiki",
  Comic: "for a webcomic or small-press book: the comic's own archive and about page, the artist's social posts, Comic Vine, and the reader community around it",
  Audiobook: "for an independent podcast or small audiobook: the show's own site and episode notes, its subreddit, podcast directories with real descriptions, and the narrator's or author's own pages",
  Series: "for a small or regional show: its broadcaster's page, fan wikis however small, episode-by-episode discussion threads, and reviews from writers who actually watched it",
  Movie: "for an independent or foreign film: festival listings and programme notes, Letterboxd reviews, the distributor's page, and the director's own interviews",
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
  /**
   * How much material exists about this work, as judged during identification.
   *
   * Sets the research budget. A famous work is described accurately from what
   * any model already knows, so volume there is mostly padding that costs money;
   * an obscure one is not described at all unless it is dug out, and every later
   * feature depends entirely on what this dossier managed to record.
   */
  coverage?: "abundant" | "moderate" | "thin";
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
  /** What this section of the dossier should come back with. */
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
const INTRODUCED = `"introducedAt" is where this first appears, in the work's own units ("episode 3", "chapter 12", "act 2", "mission 14", "the second route"). "introducedPct" is that as a rough 0-100 percentage of the way through.

FILL THESE IN WHENEVER THE WORK IS DIVIDED INTO PARTS. Measured across real dossiers they were present on barely a quarter of entries, and they are the only thing that lets this application avoid spoiling something the user has not reached yet — without them every feature has to assume the reader has finished. For anything episodic or chaptered this is a plain fact on any wiki: the episode a character debuts in, the chapter an object turns up in, the act a place is first seen. Look it up rather than leaving it blank, and derive the percentage from it — episode 3 of 10 is 30.

The instruction to omit rather than guess still stands and still outranks this: a work with no divisions has nothing to record, and an invented episode number is worse than an empty field. But "I did not look" is not the same as "there is nothing to find".`;

export const FACET_SPECS: Record<Facet, FacetSpec> = {
  cast: {
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
    brief: `The objects this work is associated with: things characters carry, wear, drive, treasure or fight over, and the ordinary props it is remembered for.

THIS IS THE SECTION THAT COMES BACK EMPTIEST, AND IT IS ALMOST NEVER BECAUSE THE WORK HAS NO OBJECTS. Grand Theft Auto V returned two. A season of Supernatural returned three, from a show whose fans can name the car, the amulet, the Colt, the demon knife, the journal and the fake FBI badges. The mistake is looking only for treasures and legendary artefacts. Almost every work is full of objects; they are simply ordinary.

So go looking deliberately, and in this order:
- WHAT THE MAIN CHARACTERS CARRY OR WEAR EVERY DAY. A weapon, a coat, a phone, a badge, a ring, a pair of glasses, a hat. If a character is drawn or filmed with a thing on them, that thing is an entry.
- WHAT THEY TRAVEL IN. Cars, ships, horses, bikes, a specific named vehicle. These are among the most recognisable objects any work has and they are missed constantly.
- WHAT THE PLOT TURNS ON. The letter, the tape, the key, the photograph, the contract, the body, the thing everyone is looking for.
- WHAT THE WORK SELLS OR IS PICTURED WITH. Whatever is on the cover, the poster, the merchandise, the icon. If it is on a T-shirt, it is an object worth recording.
- THE FORMAT'S OWN FURNITURE. For a game: the currency, the healing item, the collectible, the signature weapon class, the vehicle you get first. For a show: the recurring set dressing, the props in the credits, the thing the presenters always use. For a book: what is described more than once.

A work with genuinely no notable objects exists but is rare. If this list is coming out under about half a dozen entries for anything with a wiki, the search was for the wrong kind of thing — go back and look for the ordinary ones.
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
    brief: `What this work is like as a made thing, and how it landed. Cover, in prose:
- the premise in one spoiler-free line, then a fuller summary of what actually happens
- the setting: where and when, how advanced, how it is governed, what daily life is like
- the tone and register, and who it is for — how mature, and anything a newcomer should be warned about
- its recurring themes and preoccupations
- how it is structured and paced: arcs, routes, seasons, volumes, acts, episode or chapter counts, episodic or serialised
- what sets it apart from the obvious comparisons — the thing its admirers name first
- the setpieces, beats and images it is famous for, avoiding ending spoilers
- its sound: score, composer, instrumentation, signature sounds or voices
- its VISUAL identity, in more detail than anything else here. This section is not description for its own sake: the app generates artwork that has to pass as belonging to this work, and this is the only thing it has to go on. Cover the medium and technique it is rendered in, its palette, how it is lit and in what weather and time of day, its line quality and how much detail it resolves, how shots are framed, the design language of its people and creatures, and its recurring motifs, emblems and architecture. An adaptation does not look like its source; describe how THIS version looks.
  Then three things specifically for an artist working from your notes.
  First, SAY WHAT FORM IT TAKES in plain words — live action, 2D animation, 3D render, illustration, pixel art, photography, a mix of these, or none at all. Everything else depends on getting that right, and the commonest failure in this section is describing a live-action or photoreal work in the language of drawing.
  Second, the SHORT NAMED PHRASES someone would use to brief this look — the technique, the era, the school, the house style, the comparable work anyone in the field would recognise. Draw them from the vocabulary the form actually uses: "anamorphic 35mm, teal-and-orange grade, handheld" for live action, "photoreal PBR, volumetric fog, heavy chromatic aberration" for a 3D game, "cel-shaded anime key art" or "ligne claire" for drawn work, "16-bit sprite work, 32-colour palette" for pixel art. Concrete craft terms, not moods: "atmospheric" briefs nothing, "high-contrast chiaroscuro with crushed blacks" briefs a picture.
  Third, what this work is most often MISTAKEN for or pictured wrongly as — the wrong default someone unfamiliar would reach for. For a great many works that is generic flat cartoon vector art; for a stylised game it is often photorealism; for a period drama it is often a clean modern digital look it does not have.
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
    "iconography": "recurring motifs, emblems, logos, insignia, costume or architecture cues",
    "form": "live action | 2D animation | 3D render | illustration | pixel art | photography | mixed | none",
    "styleKeywords": ["4-8 short named craft phrases that brief this exact look, in the vocabulary this form uses"],
    "notLike": "the wrong look someone unfamiliar would default to, named plainly"
  },
  "genres": ["3-6 genre terms, most defining first"],
  "tags": ["12-20 descriptive tags: subject matter, mechanics, structure, mood, audience"]
}`,
  },
  lore: {
    brief: `MEMORIES — the handful of small things that give someone who knows this work a jolt of recognition.

That word is the brief. Not "notable quotations", not "trivia": a memory is a fragment that lands because the reader was there. Somebody who was not there reads it and shrugs, and that is fine — it was never for them.

YOUR JOB HERE IS TO FIND THE MATERIAL, NOT TO POLISH IT. Gather what is actually there and write it down plainly; a later pass does the selecting and the phrasing. What that pass cannot do is invent what you failed to find, so err toward recording more.

THE ONE RULE THAT DECIDES MOST OF THIS: A "quote" IS WORDS FROM INSIDE THE WORK. Dialogue, text on screen, a sign, an interface string — something a person encounters while playing, watching or reading it. Nothing said ABOUT the work is a quote, however well phrased and whoever said it. A developer in an interview, a director at a showcase, a line from the store page, a press release, a review: none of those are quotes, because none of them are in the thing. Filing them as quotes is the commonest way this section goes wrong, and it produces a dossier that reads like a press kit for a work nobody has actually experienced.

Collect three things:

WORDS FROM INSIDE THE WORK, reproduced EXACTLY. Spoken lines, yes, but written counts just as much: text on a screen, a title card, a sign, a scrawl on a door, an interface string, a sound effect printed on the page. "Don't open, dead inside." is never spoken by anyone; it is painted on a door, and it is one of the most quoted things its season produced. Catchphrases belong here and are the easiest to miss, because familiarity stops them registering as lines — if a character says a thing every week, or a show opens the same way every episode, write it down. Exact wording is everything; an approximation is worthless. Note who says it and where.

THINGS PEOPLE KNOW ABOUT IT. The production story, the fun fact, the verdict its audience has settled on: what was cut or nearly changed, what it is agreed to have deserved and not got, the argument its fans keep having, the thing everyone who played it found out afterwards.

WRITE THESE IN THE AUDIENCE'S WORDS, NOT THE CREATOR'S. A fact the creator has confirmed is fair material, but the memory is the fact as fans repeat it, not a sentence lifted from the interview where it was said. "Gooseworx actually hates this." is the form — six words, a fandom's shorthand for a thing its creator said. Quoting the creator at length instead is the failure this is warning about: nobody repeats a director's sentence about their own work, and a dossier full of them is a press kit.

WHAT THE FANDOM SAYS. The running gag, the affectionate complaint, the meme, the thing everyone who finished it brings up. Record the actual phrasing where there is one — a meme has a canonical wording and paraphrase destroys it. Where there is no fixed phrasing, describe the joke plainly and let the next pass write it.

MEMES ARE THE STRONGEST SIGNAL. A meme is an inside joke that spread far enough to become a format, so if this work produced one it is almost certainly its best memory. Go looking first, not last. Record its exact wording, and say whether the words came from the work or from the fandom — that decides how it is filed later.

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

DO NOT MINE THE MARKETING OR THE PRESS TOUR. Store pages, press releases, trailer voiceover, the publisher's blurb, the "about" section, announcement posts, developer interviews, showcase soundbites and pre-release coverage all produce confident, well-formed, worthless lines. They are the easiest text on the internet to find about any work, which is exactly why they keep turning up here and exactly why they are worth nothing. Nobody quotes an announcement. Nobody has ever repeated a director's sentence about their own game to another fan.

The test is simple and it is the same one as everywhere else here: would somebody who loves this work say this to somebody else who loves it? "Rise as Rook, Dragon Age's newest hero" is copy written to sell a game to a stranger. "It's the most deliberately crafted companion experience we've ever done" is a creative director doing his job at a trade show. Neither is a memory, and neither belongs in this list at all.

AT MOST ONE memory in the whole set may come from outside the work — a production fact, a fandom verdict, a piece of trivia. Everything else must be words from inside it or words its audience says. If you find yourself with two or more entries sourced to interviews, articles or marketing, you have researched the coverage instead of the work: go back to the wiki, the quotes page, and the threads where people are using the lines rather than explaining them.

=== IT MUST BELONG TO THIS VERSION ===

The trap on everything that comes in seasons, updates, remakes and re-releases: a famous line from the wider franchise or from the base game is NOT a line from the season, update or edition being described. Asked about one season of a hero shooter, "HULK SMASH" is the wrong answer — Hulk was there before it and will be there after; it says nothing about this season and would read identically under any other. Ask instead: would someone who experienced ONLY this version recognise it, and would someone who experienced every version EXCEPT this one not? What qualifies is what this version introduced or is remembered for — the new character's line, the event's own catchphrase, the bug or the balance decision it became notorious for, the thing the community would not stop saying while it ran.

=== FORMAT LINES ===

At most two may be about the format rather than the work. Mark those "scope": "medium"; everything else is "scope": "work". A format line is about the EXPERIENCE of consuming this kind of thing, of the specific sort this work puts people through — "The bookmark has not moved since March." "Saved before the boss. Saved after the boss. Saved between the two, just in case." "A guide is open in the other window. It has been since hour one."

Extra rules for one: no proper nouns, no title, no character — it must still read true for someone who has never touched this work. And it must be a real habit of the format, not an observation you constructed to fill the slot; if nothing about this work points at one, return none, which is much the more common case.

Report honestly on how much you actually found. A work with two real lines and nothing else is a normal result and saying so is more useful than padding. Never invent a quotation: it will be shown to the user as a real line from something they finished.

BUT ZERO IS ALMOST NEVER THE HONEST ANSWER FOR SOMETHING WITH AN AUDIENCE. A flagship television series came back from this section with nothing at all, and Grand Theft Auto V — among the most quoted games ever made — came back with two. That is not a work without memories, that is a search that went to the encyclopedia instead of to the people. Anything with a fandom has a catchphrase, a running joke, a line on a T-shirt or a moment everybody brings up. Before concluding there is nothing, go and look at: the work's own wiki quotes page, the subreddit's most-upvoted threads, "best moments" and "most iconic" video titles and their top comments, and the meme databases. Empty is the right answer for something genuinely obscure with no community at all — and almost nothing else.

Avoid anything that only lands if you know the ending, and avoid the crude and the sexual — these get printed above a library page.`,
    nonFiction: `the lines are the real ones: the presenter's catchphrase, the format's stock phrase, the commentator's famous call, the running joke about the show that its viewers all share. Not the name of a segment, a rule or a trophy — what people actually say about it.`,
    keys: ["flavorTexts"],
    shape: `{"flavorTexts": [{"text": "the line itself, complete and quotable on its own", "kind": "quote | reference | joke", "scope": "work | medium", "attribution": "who says it, or where it appears", "why": "at most eight words of context for an archivist — NOT an explanation of the line"}]}`,
    structureNotes: `=== WHAT MAKES ONE GOOD ===

These get printed alone, in italics, under the title of a library. One line, no context, nothing around it. So:

IT CARRIES A WHOLE FEELING IN A FRAGMENT. "Wait for the trade." is four words holding a complete argument: monthly issues cost too much, the story does not land in twenty-page pieces, and the person saying it has been doing this for years. Compression is the craft. A line that needs a second sentence to arrive has not arrived — and the corollary is the sharpest test in this brief: IF THE LINE NEEDS ITS \\"why\\" FIELD TO LAND, IT IS THE WRONG LINE. That field is a note for an archivist, never the setup for a punchline. Move the meaning into the text or drop the entry.

THE SPECIFIC DETAIL IS THE CREDENTIAL. "The scanlation group went quiet at chapter 214." The number is what makes it true. Anyone can say a series had translation trouble; only a reader says 214. One concrete thing — a number, an object, a moment, a small defeat — is what separates a line from an observation. Categories are not details: "recurring humour about the protagonist's poor sense of direction" is a category, "Zoro is lost again. He was standing right there." is a detail.

RECOGNITION IS THE PAYOFF, AND IT IS MEANT TO BE BINARY. These are passwords. Half the readers nod and the other half see nothing, and that is the design — the nod is the whole reward. A line rewritten so everyone can follow it has destroyed the thing that made it worth printing. Never explain, never gloss, never wink.

THE AFFECTION IS LOAD-BEARING. Almost all of these are complaints from people who love the thing. "Togashi is on hiatus again." is exasperated and devoted at once. Pure snark reads as contempt for something the user chose to spend a hundred hours on; pure praise reads as marketing. Rueful is the register.

IT DOES NOT ANNOUNCE ITSELF AS A JOKE. State the fact deadpan and let the recognition do the laughing. No "and we all know", no exclamation added for energy, no signalling that a joke is arriving.

IT HAS A SHAPE. Either a setup and a turn — "The character creator took ninety minutes. The helmet covers the face." — or a flat statement whose comedy is the flatness — "Bought in the sale, installed, never launched." What kills a line is trailing off: a strong open and a vague close reads worse than either half alone.

=== WORKED EXAMPLES ===

THESE ARE ILLUSTRATIONS OF FORM, NOT MATERIAL. Never reproduce one in an answer. They are about other works entirely, and one of them ("The character creator took ninety minutes…") has already been copied verbatim into a real dossier for a game it had nothing to do with. If a line you are about to write appears below, it is the wrong line.

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

=== HOW MANY ===

Between three and nine. Three is the target to aim for, not a quota to fill by any means — see the paragraph after next about what happens when you cannot reach it honestly.

The reason for the ceiling is the way these are used: the app shows exactly ONE of them at a time, chosen at random. A weak entry is not diluted by the strong ones around it — it simply gets its own turn on the page, alone, as the only thing the user sees. Nine entries of which four are padding is not a better answer than three, it is a worse one, because nearly half the time it prints the padding.

So: nine only for something with a deep, well-documented well of quoted material — the kind of work whose fandom has been producing this stuff for years. Three to five is a completely normal result for most things. Stop as soon as the next candidate is weaker than the ones you have — that is the signal you are finished, not a problem to solve.

TREAT FEWER THAN THREE AS A REASON TO LOOK AGAIN BEFORE YOU STOP, NOT AS A FINISHED ANSWER. Almost anything with a real audience has produced at least a catchphrase, a running joke or a piece of trivia somewhere — go back to the sources in "WHERE TO RESEARCH" above, particularly the audience half, before concluding there is nothing. If you still cannot find three after genuinely trying, hand back what you found. A second, automatic pass exists afterward specifically to look harder at whatever came back short — that is what it is for, and it is a far better use of another search than manufacturing the rest by hand.

NEVER PAD TO REACH THE FLOOR. Never assemble a line from facts because a slot is empty. A fabricated quote is the single worst thing this research can produce, because it will be shown to the user as a real line from something they finished — a short honest answer of one or two lines, or none at all, is always the right choice over an invented third one. The floor is a bar for how hard to look, never a bar for what to write down.

ONE EXCEPTION TO THE USUAL RULE, and only for this section: you MAY rephrase. The notes are raw material, and an inside joke recorded as a flat fact has to be written out as somebody saying it before it is worth printing — "Sam wears women's underwear." becomes "Did you know Sam Winchester wears women's underwear?". That is writing, not inventing. What you must NOT do is add a memory the notes do not support, or alter the wording of anything the notes give as a direct quotation: a quote and a meme both have exact wording and it is reproduced character for character, never tidied, translated or trimmed.

"text" must be a complete utterance — something a person says. A bare noun phrase is a glossary headword, not a line: if an entry reads like the title of a topic ("The Waiting Room", "Crimson Chronovium", "The 35 GB DLC"), either the notes contain the actual line and you should use that instead, or they do not and the entry must be dropped.
If "text" only makes sense once "why" is read, the entry is wrong. Fix it or drop it.
"kind" is decided by where the words came from: from inside the work is "quote", something known about the work is "reference", something the fandom says is "joke". A meme follows the same rule — "One does not simply walk into Mordor." is a quote that became a meme, "Togashi is on hiatus again." is a joke its readers wrote.
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

/**
 * How much to write, set by how much there is to write about.
 *
 * This used to be one line — "BREADTH IS THE POINT, aim well past a dozen
 * entries" — sent to every facet of every work. On something with a large wiki
 * that produces pages of material the model could have written from memory, and
 * research output is the largest single cost in the whole pipeline. On something
 * obscure the same instruction produces padding, because the long tail it is
 * reaching for does not exist and inventing it is the failure mode that matters
 * most: for a work nobody knows, the dossier is the ONLY thing later features
 * have to go on, so a confident fabrication propagates unchallenged.
 *
 * So the budget follows the coverage the identify pass reported. Spend little on
 * what is already common knowledge, spend everything on what is not.
 */
function depthRule(coverage?: string): string {
  if (coverage === "abundant") {
    return `- THIS WORK IS WELL DOCUMENTED, WHICH MEANS THIS DOSSIER SHOULD BE LONG. A work with years of coverage and a deep wiki has a long tail worth having, and getting it is the whole job: name every character with a name, every place that appears more than once, every faction, every piece of vocabulary, every object the work is remembered for. Twenty entries are better than eight when twenty of them are real. Nothing is gained by stopping early on a work that has more to give.`;
  }
  if (coverage === "thin") {
    return `- THIS WORK IS BARELY DOCUMENTED, and that makes this pass the whole ballgame. Nothing downstream knows anything about it beyond what you write here, so record everything you can actually verify, including the small and the incidental, and prefer a specific detail from one dedicated source over a general statement you could have made about any work in the genre. Where the record simply stops, say so plainly and stop with it — a short sourced answer is exactly right for the SPECIFICS, and a fabricated one is worse here than anywhere else in this dossier because there is nothing else to catch it.

BUT THIN COVERAGE IS NOT PERMISSION FOR AN EMPTY DOSSIER. Whatever the record says, this work still has a form: a medium, a format, a shape, a look, an audience. Describe all of that with confidence — it is not a claim about facts nobody has published, it is a description of the thing in front of you. The sections that must never come back empty for a work that visibly exists are the premise, the overview, the tone, the audience, the structure and the visual identity. What may legitimately be short is the cast list, the places, the objects and the memories, because those are the parts that need somebody to have written them down.`;
  }
  return `- BREADTH IS THE POINT. The obvious headline entries are the easy part; the value is in the long tail. Aim well past a dozen entries where the work supports it, and include the minor, the regional and the everyday.`;
}

/**
 * What to do when the entry names an index rather than a work.
 *
 * A reading order, a continuity guide, an omnibus, a box set, a chapter of a
 * guide: the user is tracking the STORIES, and the container is only how they
 * found them. Asked to research "Assemble — Pre-Modern Marvel Continuity Guide,
 * Chapter 1", the research correctly established that continuityguide.net is a
 * website with an unnamed author and a friendly opening line, and produced a
 * dossier whose cast was "The Guide's Author" and whose central tension was
 * whether to read chronologically. Every word of it was true and none of it was
 * about comics.
 *
 * Deliberately not keyed on a keyword match in the title. The tell is a
 * contradiction the model is far better placed to notice than a regex: the entry
 * is filed as a Comic and the thing being described is a web page. So the rule
 * is stated as a principle and anchored with the case that produced it.
 */
function containerScope(subject: CodexSubject): string {
  const type = TYPE_QUERY_WORD[subject.mediaType] || subject.mediaType.toLowerCase();
  return `

=== IF THIS ENTRY NAMES A COLLECTION, A READING ORDER OR A GUIDE ===

Somebody tracks what they READ, WATCH or PLAY. They never track the document that indexes it. So if the title, subtitle or franchise names a reading guide, a reading order, a continuity guide, an omnibus, a box set, a "complete collection", an anthology, a numbered chapter of a guide, or any other container — THE SUBJECT OF THIS DOSSIER IS WHAT IS INSIDE IT, not the container.

"Assemble — Pre-Modern Marvel Continuity Guide, Chapter 1" is not a website. It is Marvel's comics from 1961 to 1968: the Fantastic Four, Spider-Man, the Hulk, Thor, Iron Man, the X-Men and the Avengers as they first appeared; Doctor Doom, Magneto and Loki; the Baxter Building and the Negative Zone; "It's clobberin' time" and "with great power there must also come great responsibility". A dossier describing that guide's author, its opening sentence and its advice on where to start has documented the index and skipped the library.

So: work out what the container actually covers — which run, which years, which arc, which volumes — and describe THAT. Its characters, its conflicts, its places, its objects, its memories. Put the container and the range it covers in "identifiedAs.notes" so the scope is on record, and set "identifiedAs.title" to the material rather than to the guide.

THE MEDIA TYPE SETTLES IT. This entry is filed as ${type}. If your research concludes the subject is a website, a wiki, a blog post, a reading order or a guide rather than ${type}, you have followed the index instead of the content — go back and describe the ${type} it points at. A short dossier about a guide is a failure even when every sentence in it is accurate.`;
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
  /**
   * The subtitle and franchise carry the disambiguation, and used to be dropped.
   *
   * An entry titled "Assemble" is unsearchable on its own; the same entry's
   * subtitle said "Pre-Modern Marvel Continuity Guide - Chapter 1" and its
   * franchise said "Marvel", and neither reached the query or the prompt. The
   * research went looking for a 1961 comic called Assemble with nothing else to
   * go on, which is exactly as hard as it sounds.
   *
   * Skipped when the subtitle merely repeats the season or edition the title
   * already names, so a "Show - Season 2" entry does not say season twice.
   */
  const subtitle = String(subject.subtitle || "").trim();
  const extra = subtitle && !season && !edition ? subtitle : "";
  const franchise = (subject.franchises || []).filter(Boolean)[0] || "";

  const parts = [
    identity?.title || subject.title,
    extra,
    franchise && !new RegExp(franchise, "i").test(`${subject.title} ${extra}`) ? franchise : "",
    season ? `season ${season}` : "",
    edition || "",
    year ? String(year) : "",
    TYPE_QUERY_WORD[subject.mediaType] || subject.mediaType.toLowerCase(),
    suffix,
  ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * The dossier's JSON shape, assembled from the facets' own fragments.
 *
 * Each facet declares the object it fills; stitching them rather than writing a
 * second copy keeps one source of truth, so a field added to `FACET_SPECS` turns
 * up here without anyone remembering to add it twice.
 */
function combinedShape(): string {
  const inner = FACETS.map((f) => {
    const s = FACET_SPECS[f].shape.trim();
    const body = s.replace(/^\{/, "").replace(/\}$/, "").trim().replace(/,$/, "");
    // Facets declare their fragment at their own indentation — some on one line,
    // some already nested several levels deep. Strip the common indent and add
    // one level back, so relative nesting survives and the assembled template
    // reads as the single object it is asking for.
    const lines = body.split("\n");
    const base = Math.min(...lines.slice(1).filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length), 99);
    return lines
      .map((line, i) => (i === 0 ? `  ${line.trim()}` : `  ${line.slice(Number.isFinite(base) ? base : 0)}`))
      .join("\n");
  });
  return `{\n  "identifiedAs": {"title": "", "year": 0, "creator": "who made it — studio, developer, author, publisher", "alsoKnownAs": [""], "coverage": "abundant | moderate | thin", "confidence": "high | medium | low"},\n  "sources": ["the FULL URLs of the pages you actually drew on, starting with https:// — a title or a description is not a source"],\n  "sectionConfidence": {${FACETS.map((f) => `"${f}": "high | medium | low"`).join(", ")}},\n\n${inner.join(",\n\n")}\n}`;
}

/**
 * THE DOSSIER PASS — one deep search, one document, one call.
 *
 * This replaced a pipeline of fifteen: identify, then six facets each researched
 * and then separately structured, then gap-fills. Every one of those was an
 * independent chance to fail, and they did — a dossier arriving with three
 * sections simply absent was the normal outcome, not the exceptional one.
 *
 * The objection to collapsing them was that one call means one search query, and
 * that "who is in the cast" and "what do people still quote" are not the same
 * search. Measured, that turned out to be wrong: deep retrieval runs its own
 * iterative queries, and a single pass on a game released that morning came back
 * with thirty-six sources spanning the publisher, Famitsu, two wikis, a
 * completion guide, review aggregators and Reddit — and every section populated,
 * against a six-pass run on the same title that lost three of them entirely.
 *
 * What the measurement did show is where a single pass is weaker: the long
 * enumerable lists. It found three of the twelve named locations that work's
 * wiki documents. That is what the top-up pass afterwards is for, and it is
 * driven by which lists actually came in under their floor rather than by a
 * fixed list of subject areas.
 *
 * NOTHING IS COMPRESSED TO FIT. Every facet's full brief goes in verbatim.
 * Input is about 5% of what a dossier costs, so there is nothing to win by
 * trimming, and one thing to lose: an early trial of this prompt shortened the
 * memories brief and got back exactly the weak, explained-instead-of-performed
 * lines that brief had been rewritten four times to prevent.
 */
export function buildDossierPrompt(
  subject: CodexSubject,
  identity?: CodexIdentity | null,
  /**
   * What a previous pass already found, when this run is an expansion.
   *
   * Names only, never the whole dossier. A stored dossier is thirty kilobytes
   * and pasting it back would double the prompt for no gain — what the model
   * needs is not the old answer but the list of things it must not spend this
   * pass rediscovering.
   */
  alreadyKnown?: string | null,
): string {
  const title = identity?.title || subject.title;
  const year = identity?.year || subjectYear(subject);
  const aka = (identity?.alsoKnownAs || []).filter(Boolean).slice(0, 8);
  const visualNote = VISUAL_IDENTITY_BY_TYPE[subject.mediaType]
    ? `\n\nHOW TO ANSWER THE VISUAL SECTION FOR THIS MEDIUM: ${VISUAL_IDENTITY_BY_TYPE[subject.mediaType]}`
    : "";

  // The section briefs, in the order the shape lists them, each under a heading
  // the model can navigate by. `lore` keeps its structuring notes because for
  // that one section the writing rules ARE the brief — the difference between a
  // memory and a fact about the work lives entirely in them.
  const sections = FACETS.map((f) => {
    const spec = FACET_SPECS[f];
    const extra = f === "lore" ? `\n\n${spec.structureNotes}` : "";
    return `━━━ ${f.toUpperCase()} ━━━

${spec.brief}${f === "craft" ? visualNote : ""}${extra}

IF THIS IS NOT FICTION — a reality or competition show, a documentary, a podcast, a sporting competition — this section still applies, it just means real things: ${spec.nonFiction}`;
  }).join("\n\n");

  return `${searchQueryLine(subject, identity || null, "wiki characters plot setting factions lore art style reception reddit discussion fan reaction quotes memes")}

You are the Codex Archivist of FauxLore. Research ONE work thoroughly and return ONE complete reference dossier on it.

THE WORK: "${title}"${year ? ` (${year})` : ""}${identity?.creator ? `, by ${identity.creator}` : ""} — ${TYPE_BRIEF[subject.mediaType] || `a ${subject.mediaType}`}.${
    aka.length ? `\nALSO KNOWN AS: ${aka.join(" · ")} — search under these too, especially the original-language title, where the detailed material usually is.` : ""
  }${subject.subtitle ? `\nSUBTITLE ON THE ENTRY: ${subject.subtitle}` : ""}${
    (subject.franchises || []).filter(Boolean).length
      ? `\nFRANCHISE: ${(subject.franchises || []).filter(Boolean).slice(0, 4).join(", ")}`
      : ""
  }${subject.creator && !identity?.creator ? `\nCREDITED TO: ${subject.creator}` : ""}${
    subject.description ? `\nTHE ENTRY SAYS: ${String(subject.description).slice(0, 400)}` : ""
  }${versionScope(subject)}${containerScope(subject)}

THIS WORK HAS BEEN RELEASED. That is a guarantee, not an assumption: the application refuses to compile a Codex for anything unreleased, precisely so this brief can tell you so. It is out, people have seen it, and it has been written about somewhere.

So do not hedge about whether it exists. Do not write "announced", "upcoming", "reportedly", "per the entry text" or "not documented in the available record" as a way of holding a released work at arm's length. If it came out this week the coverage is thin but the AUDIENCE is at its loudest — release-week threads, first-reaction posts and early discussion are the richest they will ever be, and that is exactly where the memories are. Recent is a reason to look harder at the community, not a reason to be tentative.

The only honest hedge left is about a specific fact you could not find. That is what an empty field is for.

Everything this application later generates about this work — artwork, enemies, items, tags, recommendations — is written from this document and from nothing else. Nobody will check it afterwards.
${alreadyKnown ? `
=== THIS IS AN EXPANSION. A DOSSIER ALREADY EXISTS. ===

Everything listed below has already been researched and recorded. YOUR JOB IS TO FIND WHAT IS MISSING FROM IT — not to write it again, and not to improve the wording of what is there.

${alreadyKnown}

HOW TO SPEND THIS PASS:
- Go after the entries NOT in that list. The minor characters, the places named once, the vocabulary further down the wiki page, the objects nobody thinks to write down. That long tail is precisely what a first pass skims and what this pass exists for.
- Returning an entry that is already listed wastes the slot. If you are unsure whether something is the same as an existing entry under a different name, include it and say so in its description — a duplicate is merged, a miss is lost.
- Prose sections (the premise, the overview, the art style and so on) are ALREADY WRITTEN and will be kept. Return them only if you have something genuinely new to add; otherwise return them as empty strings and spend the effort on the lists.
- Memories are the exception worth trying again on even if some exist: they are the hardest section and the most often thin. New ones are merged in alongside.

The result is merged with what is already there, so nothing you leave out is lost.
` : ""}

=== THE RULE THAT OUTRANKS EVERY OTHER ONE ===

NEVER INVENT. You will hit areas where the information does not exist, and that is a normal result, not a failure: return an empty list or an empty string and move on. Do not fill a gap with what works of this kind usually contain, do not carry facts across from the same creator's other work or from a similarly named one, and do not promote a rumour, a leak or a fan theory to a fact.

An empty field is a correct answer. An invented one is the worst possible outcome, because it becomes permanent and everything downstream treats it as true.

Prefer what is documented — the official source, the creator's own statements, interviews, the wiki, contemporaneous coverage — over what is merely plausible. Where sources genuinely conflict, say so in the field rather than silently picking one. When the general web is thin, go where the work's actual audience is: ${NICHE_SOURCES[subject.mediaType] || "the communities, forums and wikis its own audience keeps"}.

${REFERENCE_NOT_TEMPLATE}

=== WHERE TO RESEARCH ===

TWO KINDS OF SOURCE, AND YOU NEED BOTH.

THE RECORD, for what the work contains: its own wiki, Wikipedia, a fan wiki's character and location pages, a completion guide, a database entry, contemporaneous coverage. This is where the cast, the places, the vocabulary and the objects come from.

THE AUDIENCE, for what the work is known BY: the subreddit and its most-upvoted threads, forum and Discourse posts, the comments under "best moments" videos, meme pages, the wiki's own quotes subpage, review threads on release day. This is where the memories come from and it is the half that keeps getting skipped.

RUN A SEPARATE, LITERAL SEARCH FOR THIS HALF. Do not rely on a general query about the work to happen to surface a forum thread — it usually will not, because a wiki page and a press article both rank ahead of a Reddit thread for almost any ordinary phrasing. Search, in so many words, for "[the work's name] reddit", "[the work's name] reaction" and "r/[a guessed subreddit name] [the work's name]". If the first of those returns nothing, try the others before concluding the audience left no record — a launch-day thread from hours ago is exactly the kind of page a general query is likeliest to miss and a literal one is likeliest to find.

IF EVERY SOURCE YOU END UP WITH IS THE PUBLISHER'S OWN SITE, A PRESS RELEASE OR LAUNCH COVERAGE, YOU HAVE RESEARCHED THE ANNOUNCEMENT AND NOT THE WORK. That is a failed search, not a thin subject. A season of television that has actually aired has people arguing about it within hours — go and read them. A dossier sourced entirely to aboutamazon.co.uk and a press kit will describe what a show intends to be and nothing about what it turned out to be, and it will have no memories in it at all, because nobody quotes a press release.

There is no "it is too new" exception. Nothing unreleased reaches this brief, so a press-only result always means the search stopped early — for a work that came out days ago the announcement is the EASIEST thing to find and the least worth having.

=== HOW MUCH TO WRITE ===

${depthRule(identity?.coverage)}
- Name things. Never write "various characters", "several locations" or "a rich world" — those are worth nothing to the reader of this dossier.
- A FIELD YOU CANNOT FILL IS LEFT AS AN EMPTY STRING. Do not write "Unknown", "N/A", "Not specified in the sources", "None — …" or any other way of saying you found nothing. Everything here is read by programs that render these values into other prompts, so a faction whose emblem is the words "Not specified in the sources" becomes an instruction to draw that phrase. An empty field already means exactly what you are trying to say.
- BUT EMPTY IS ONLY FOR THINGS THAT ARE NOT TRUE OF THIS WORK. It is not a way of saying you did not look, and it is not for things that follow plainly from what the work IS. A motoring show has presenters, cars, a studio, locations and a camera crew whether or not anybody has reviewed this particular season. A visual novel has a script, sprites and routes. A season of television has episodes. Describe the FORMAT confidently — that is not invention, it is the thing itself — and reserve the empty field for the specifics that genuinely have no answer yet: which episodes, which guests, which numbers.
- THE DIFFERENCE IS SPECIFICITY, NOT CONFIDENCE. "The presenters drive three modified hatchbacks across Namibia in episode 4" is a claim needing a source. "It is a live-action motoring series built around presenters, cars and location filming" is a description of the format, is certainly true, and leaving it out helps nobody.
- LENGTH IS NOT A PROBLEM. There is no budget to come in under and nothing to be gained by being brief. A long dossier on a work that supports one is the best possible outcome; the only thing worth trimming is repetition.
- THE LENGTH COMES FROM MORE ENTRIES, NOT MORE WORDS PER ENTRY. That distinction is the whole rule. Every real character, place, faction, term and object that exists is worth adding, however minor — but three sentences restating what one sentence already said are worth nothing, and an entry you are not sure exists is worse than nothing, because it becomes permanent and everything downstream treats it as true.
- So: as many entries as the work genuinely has, each described concretely and without padding. Stop when you run out of real material, not when the list looks long enough.
- Go after what a first look misses: the recurring minor names, the regional and the everyday, the entries further down the page. That long tail is the part a shallow pass always loses, and the part later features most need.
- Prefer widely known material, and avoid late-story twists and ending spoilers — the user may still be partway through.

=== THE VISUAL SECTION IS NEVER LEFT EMPTY ===

Unless this work has no visual form at all — a novel, an audiobook, a podcast, where "form" is honestly "none" — the "artStyle" object MUST be filled, and completely. It is the only thing the application has when it generates artwork: an empty "artStyle" does not mean "we do not know", it means every image made for this entry is drawn from nothing.

And it is answerable from the format alone. A live-action motoring series is shot on location with long lenses and drone work, in daylight and in a studio, with cars as the subject; that is true before a single review is written. Fill "form", "medium", "palette", "lighting", "composition", "styleKeywords" and "notLike" from what the work IS, and reserve any hedging for details that genuinely vary.

=== THE SECTIONS ===

${sections}

=== OUTPUT ===

Return ONLY a single JSON object matching this shape exactly — no markdown fence, no commentary before or after, no reasoning left in the reply:

${combinedShape()}

${INTRODUCED}

"coverage" is how much material actually exists about this work, AND IT DECIDES HOW MUCH THIS DOSSIER IS ASKED FOR, so judge it on what you actually found rather than on how obscure the title felt before you looked. "abundant" is the normal answer for anything with a dedicated wiki, a Wikipedia article of any length, reviews in the trade press, or an active community — that includes every mainstream film, game and television series. "moderate" is for something documented but lightly. Reserve "thin" for what it is really for: a small independent release, something very recent, a work with no wiki and almost nothing written about it. A flagship television series rated "thin" tells the rest of this brief to stop early, and the result is a short dossier about a work there was plenty to say about. "confidence" and each "sectionConfidence" entry rate how well-sourced that part genuinely is — be pessimistic, since a wrong "high" corrupts the record and a wrong "low" costs nothing.`;
}
