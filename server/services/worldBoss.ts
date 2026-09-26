import { v4 as uuidv4 } from "uuid";
import type { Db } from "../context";
import { getAiConfig, nanoGenerateText, parseJsonLoose } from "../lib/ai";
import { AUTHENTICITY, LEVEL_DESCRIPTIONS, SHARPNESS, enemyTier } from "../lib/artDirection";
import { codexPromptBlock, type CodexService } from "./codex";

export interface GeneratedEnemy {
  name: string;
  title: string;
  description: string;
  imagePrompt: string;
}

/** Weekly/encore World Boss spawner with level/difficulty scaling and AI-written enemies. */
export function createWorldBossService(
  { db, generateBossImageBackground, codex }: {
    db: Db;
    generateBossImageBackground: (userId: string, bossId: string) => Promise<void>;
    codex: CodexService;
  },
) {
  /**
   * Writes one enemy for an encounter.
   *
   * The app fixes only what it must — which media, which level, how much progress
   * beats it. Everything else is the AI's: it reads the media's Codex, picks or
   * invents an opponent that belongs in that world, gives it an epithet, writes
   * its flavour text and art-directs its portrait in one pass. No assembling of
   * name fragments, no second lookup at image time.
   */
  /**
   * Everything this media has already sent at the player.
   *
   * Without it the forge answers the same question from the same Codex every
   * week, so it keeps reaching for the same obvious antagonist — the one the
   * Codex lists first. Naming the past enemies is what turns a fresh roll into
   * a deliberately different one, and it also covers rerolls: the enemy being
   * replaced is already on this list, so a reroll cannot hand back what it just
   * discarded.
   */
  function previousEnemies(userId: string, mediaId: string): { name: string; title: string | null; level: number; status: string }[] {
    try {
      return db
        .prepare(
          `SELECT name, title, level, status FROM world_bosses
            WHERE userId = ? AND mediaId = ?
            ORDER BY createdAt DESC
            LIMIT 15`,
        )
        .all(userId, mediaId) as any[];
    } catch {
      return [];
    }
  }

  async function generateEnemy(userId: string, mediaItem: any, level: number): Promise<GeneratedEnemy | null> {
    const aiConfig = getAiConfig(db, userId);
    if (!aiConfig) return null;

    const codexRow = await codex.tryEnsureCodex(userId, {
      mediaId: mediaItem.id,
      title: mediaItem.title,
      mediaType: mediaItem.mediaType,
    });
    const codexBlock = codexPromptBlock(codexRow);
    const tier = enemyTier(level);

    const past = previousEnemies(userId, mediaItem.id);
    const historyBlock = past.length
      ? `ALREADY FOUGHT — every opponent this work has already sent, newest first:
${past.map((p) => `- ${p.name}${p.title ? ` (${p.title})` : ""} — Level ${p.level}, ${p.status.toLowerCase()}`).join("\n")}

DO NOT REPEAT ANY OF THEM. Not the same character under a different epithet, not the same creature type, not the same faction leader. Reach further into the work: a different character, a different faction, a different kind of threat, a different part of the story. If the obvious pick is on that list, it is no longer the obvious pick.
If this work genuinely has nothing left that fits Level ${level}, you may revisit one — but only as a distinctly different manifestation of it, and say plainly in the flavour text how it has changed since.`
      : "";

    const prompt = `You are the Enemy Forge of FauxLore. Your job is to conjure ONE opponent out of a piece of media the player is currently working through, and to make it feel like it genuinely stepped out of that world.

THE SOURCE: "${mediaItem.title}" (${mediaItem.mediaType})

${codexBlock || `(No Codex is on record for this title — rely on your own knowledge of it, and stay faithful to what you actually know.)`}

${historyBlock}

THE ENCOUNTER (fixed by the game — honour it exactly):
- Difficulty: Level ${level} of 5 — ${LEVEL_DESCRIPTIONS[level] || LEVEL_DESCRIPTIONS[3]}
- Visually it must read as ${tier.word}: ${tier.look}.

HOW TO WRITE IT:
1. Choose the opponent yourself, and judge its stature yourself. The Codex is a reference on the work, not a graded roster — nothing in it has been rated, and nothing in it is reserved for any level. Read it and decide who or what makes a Level ${level} encounter THIS week, given what has already been sent. A Level 1 should be something the fandom would laugh at: a shopkeeper, a bureaucrat, a piece of scenery. A Level 5 should be the kind of thing the whole work builds towards. The same character can be either, depending on which part of them you reach for — an early skirmish and a final confrontation are not the same fight.${past.length ? " Check your choice against the ALREADY FOUGHT list before you commit to it." : ""}
2. If nothing in the work fits that level, invent one — but build it out of this work's own material: its factions, its terminology, its creatures, its aesthetics. Never a generic fantasy monster.
3. Give it an RPG epithet that suits the tier ("King of the Koopas", "Intern of the Seventh Circle"). Keep the name the entity's real name where one exists.
4. Record what it is, factually — no flourish, no voice, no atmosphere. A writer takes this brief and turns it into flavour text afterwards, and they can only work with what you give them, so be concrete: how it actually fights or thwarts the player, what it looks like, how it carries itself and how it would speak. Say what is true about it; do not perform it.
5. Art-direct its portrait yourself as a single ready-to-use text-to-image prompt.

THE IMAGE PROMPT MUST:
- Be 2-4 natural sentences that stand entirely on their own, written for the "Z-Image-Turbo" diffusion model (it follows natural language and renders any art style, including real text and logos).
- Render the subject in the ACTUAL art style, medium and palette of "${mediaItem.title}"${codexRow?.data?.artStyle?.summary ? ` — the Codex records it as: ${codexRow.data.artStyle.summary}` : ""}. Name that style explicitly and reference the franchise to anchor the look. Never default to generic 2D cartoon or flat vector art unless the source really is that.
- ${AUTHENTICITY(mediaItem.title)}
- Show ONE subject only, against ${tier.scene}. Never a crowd or a collage.
- Capture a MOMENT, not a pose. This one should be ${tier.action}. Pick the specific action that suits THIS enemy — what it would actually be doing — rather than the first one on that list, and describe the follow-through: what is moving, what is being flung or trailing behind it, where its weight is.
- Frame it with ${tier.camera}. Vary the framing to suit the enemy: full body, three-quarter, or a tight close-up on the part of it that matters.
- Never a neutral figure standing straight and facing the lens. No mugshots, no character-select line-ups, no arms hanging at its sides, no posing for a photograph — it should not be aware of the camera at all.
- Describe its anatomy, armour, weapons, materials, aura and expression, all pitched at Level ${level}.
- ${SHARPNESS}
- Contain no watermarks, no signatures, no lettering and no duplicate characters.

Return ONLY a pure JSON object, no markdown fence, no commentary:
{
  "name": "the entity's name, no epithet",
  "title": "a working RPG epithet, without the name",
  "brief": "1-2 plain sentences on what it is and why it belongs at this level",
  "howItFights": "concretely, how it fights or thwarts the player",
  "look": "what it looks like and how it carries itself",
  "manner": "its temperament and how it would speak",
  "imagePrompt": "the complete image prompt"
}`;

    const clean = (v: any) => String(v || "").replace(/\*\*/g, "").replace(/^["']|["']$/g, "").trim();

    try {
      // STAGE 1 — analytical. Which opponent, at what level, looking like what.
      // No web search: the Codex already did the research. This is the pass that
      // must not invent, so it runs on the analytical model.
      const raw = await nanoGenerateText(aiConfig, prompt, { temperature: 1.0, tier: "analytical", scope: "boss" });
      if (!raw) throw new Error("The model returned an empty enemy.");
      const spec = parseJsonLoose<any>(raw);

      const name = clean(spec.name);
      if (!name) throw new Error("The enemy has no name.");

      // STAGE 2 — creative. The player only ever reads this sentence, and the
      // model that is good at picking a faithful opponent is not the one that is
      // good at giving it a voice.
      const written = await writeEnemyFlavour(aiConfig, mediaItem, level, tier, spec, codexRow);

      return {
        name,
        // The brief's epithet is a working title; the writer's is the one that
        // has to land. Fall back if the second pass failed.
        title: clean(written?.title) || clean(spec.title),
        description: clean(written?.description) || clean(spec.brief),
        imagePrompt: String(spec.imagePrompt || "").trim(),
      };
    } catch (e) {
      console.error("Enemy generation failed", e);
      return null;
    }
  }

  /**
   * Turns an enemy brief into the line the player actually reads.
   *
   * Deliberately given no Codex and no bestiary — only the brief. It cannot
   * research, so it cannot contradict the research; its whole job is voice.
   */
  async function writeEnemyFlavour(
    aiConfig: NonNullable<ReturnType<typeof getAiConfig>>,
    mediaItem: any,
    level: number,
    tier: { word: string },
    spec: any,
    codexRow: any,
  ): Promise<{ title: string; description: string } | null> {
    const d = codexRow?.data;
    const voice = [
      d?.tone ? `Tone of the source: ${d.tone}` : "",
      d?.premise ? `What the work is: ${d.premise}` : "",
    ].filter(Boolean).join("\n");

    const prompt = `You are the Enemy Forge of FauxLore, writing the card for one opponent. Another archivist has already researched it and handed you this brief. Your only job is to make it read well.

THE SOURCE: "${mediaItem.title}" (${mediaItem.mediaType})
${voice}

THE BRIEF — every fact below is settled. Do not add to it, do not contradict it, do not invent abilities, allies or history it does not mention:
- Name: ${spec.name}
- Working epithet: ${spec.title || "(none suggested)"}
- What it is: ${spec.brief || ""}
- How it fights: ${spec.howItFights || ""}
- How it looks: ${spec.look || ""}
- Its manner: ${spec.manner || ""}
- Encounter level: ${level} of 5 — it should read as ${tier.word}.

WRITE:
1. Its epithet: a short RPG title without the name ("King of the Koopas", "Intern of the Seventh Circle"). Improve on the working one if you can; keep it if it is already right.
2. 1-3 sentences of flavour text, in the voice and tone of the source work. Say what it is and how it stands in the player's way. Let its personality show — wit at low levels, dread at high ones. Write it as the world would describe it, not as a stat block.

Do not restate the brief as a list. Do not open with the name and a colon. No markdown, no quotation marks around the whole thing.

Return ONLY a pure JSON object, no markdown fence, no commentary:
{ "title": "the epithet, without the name", "description": "1-3 sentences" }`;

    try {
      const raw = await nanoGenerateText(aiConfig, prompt, { temperature: 1.05, tier: "creative", scope: "boss" });
      if (!raw) return null;
      return parseJsonLoose<any>(raw);
    } catch (e) {
      // A flat enemy is better than no enemy: the caller falls back to the brief.
      console.error("Enemy flavour pass failed; falling back to the brief", e);
      return null;
    }
  }

  async function spawnWorldBoss(userId: string, throwOnEmpty = false, targetMediaType?: string) {
    try {
      // Eligible media: non-movies that are 'Active', plus Movies that are 'Active' OR
      // 'Planning' (movies usually jump straight from Planning to Watched). Excludes media
      // with enemies disabled and media that already has an active enemy.
      const typeFilter = (targetMediaType && targetMediaType !== 'All' && targetMediaType !== 'All Media Types') ? targetMediaType : null;
      const queryExt = typeFilter ? " AND mediaType = ?" : "";
      // Time Travel implies noEnemies without the user having to tick both: a
      // chronology is worked through in long passes, and a weekly enemy on one
      // of forty parallel entries is noise rather than a target.
      const eligibleWhere = `userId = ? AND (noEnemies = 0 OR noEnemies IS NULL) AND (timeTravel = 0 OR timeTravel IS NULL) AND ((mediaType != 'Movie' AND status = 'Active') OR (mediaType = 'Movie' AND status IN ('Active', 'Planning')))`;

      const anyParams: any[] = typeFilter ? [userId, typeFilter] : [userId];
      const anyEligible = db.prepare(`SELECT id FROM media WHERE ${eligibleWhere}${queryExt}`).all(...anyParams) as any[];
      if (anyEligible.length === 0) {
        if (throwOnEmpty) {
          if (typeFilter) throw new Error(`No eligible ${typeFilter} found (excluding disabled enemies).`);
          throw new Error("No eligible media found (excluding disabled enemies). Start consuming a Media Item to spawn an enemy!");
        }
        return;
      }

      const spawnParams: any[] = typeFilter ? [userId, userId, typeFilter] : [userId, userId];
      const candidates = db.prepare(`SELECT id, title, mediaType, isHighPriority FROM media WHERE ${eligibleWhere} AND id NOT IN (SELECT mediaId FROM world_bosses WHERE userId = ? AND status = 'Active')${queryExt}`).all(...spawnParams) as any[];
      if (candidates.length === 0) {
        if (throwOnEmpty) throw new Error("All your eligible media already have enemies. Defeat or survive them before requesting an Encore!");
        return;
      }

      // --- Even type roll, then rotate ---
      // The media TYPE is chosen first and every type has the same chance, so a large
      // library never crowds out a small one. Only types with at least one eligible
      // entry can be drawn, since byType is built from the candidates themselves.
      //
      // Types that already have a live enemy are then set aside, so a second enemy
      // lands on a different type. Once every eligible type is represented, the
      // exclusion is dropped and types may repeat.
      const byType: Record<string, any[]> = {};
      for (const c of candidates) {
        (byType[c.mediaType] = byType[c.mediaType] || []).push(c);
      }
      const allTypes = Object.keys(byType);

      const activeTypes = new Set(
        (db
          .prepare(
            `SELECT DISTINCT m.mediaType AS t FROM world_bosses b
               JOIN media m ON m.id = b.mediaId
              WHERE b.userId = ? AND b.status = 'Active'`,
          )
          .all(userId) as any[]).map((r) => r.t),
      );

      const unrepresented = allTypes.filter((t) => !activeTypes.has(t));
      // An explicit type request (Encore on a specific type) always wins.
      const typePool = typeFilter ? allTypes : (unrepresented.length > 0 ? unrepresented : allTypes);

      const chosenType = typePool[Math.floor(Math.random() * typePool.length)];


      const settings: any = db.prepare('SELECT enemyDifficulty, mediaDifficulty FROM settings WHERE userId = ?').get(userId);
      const enemyDifficulty = settings?.enemyDifficulty ?? 1.0;
      let mDiff = 1.0;
      if (settings?.mediaDifficulty) {
        try {
          const parsed = JSON.parse(settings.mediaDifficulty);
          if (parsed[chosenType] !== undefined) {
             mDiff = parsed[chosenType];
          }
        } catch(e) {}
      }

      const difficulty = enemyDifficulty * mDiff;

      // --- Level determination ---
      // Difficulty ramps with how many enemies are already live, rather than with the
      // weekday: the auto-spawn lands on an empty board and should be survivable on a
      // busy week, while asking for more is opting in to harder ones.
      //
      //   no enemies yet -> always level 3 (the Monday spawn)
      //   one enemy live  -> the first Encore: level 4 (75%) or level 5 (25%)
      //   beyond that     -> any level, subject to the caps below
      //
      // Levels 4 and 5 are mutually exclusive and capped: at most two level 4s, at
      // most one level 5, and neither may join the other. Movies ignore all of this
      // and are always level 2, since a movie boss is beaten by watching it once.
      const activeLevels = (db
        .prepare("SELECT level, COUNT(*) as c FROM world_bosses WHERE userId = ? AND status = 'Active' GROUP BY level")
        .all(userId) as any[]);
      const countAt: Record<number, number> = {};
      activeLevels.forEach((row) => { countAt[row.level] = row.c; });
      const activeCount = activeLevels.reduce((sum, row) => sum + row.c, 0);

      const allows = (lv: number) => {
        if (lv === 5) return (countAt[5] || 0) < 1 && (countAt[4] || 0) === 0;
        if (lv === 4) return (countAt[4] || 0) < 2 && (countAt[5] || 0) === 0;
        return true; // 1-3 are uncapped
      };

      let level: number;
      if (chosenType === 'Movie') {
        level = 2;
      } else if (activeCount === 0) {
        level = 3;
      } else if (activeCount === 1) {
        // First Encore: usually a level 4, occasionally a level 5, which keeps the
        // top tier rare. Preference order is filtered by what the caps allow.
        const wanted = Math.random() < 0.25 ? [5, 4] : [4, 5];
        level = wanted.find(allows) ?? 3;
      } else {
        const open = [1, 2, 3, 4, 5].filter(allows);
        level = open[Math.floor(Math.random() * open.length)];
      }

      // Finally the specific entry, now that type and level are settled. Entries within
      // the type are equally likely, except high-priority ones which get doubled odds.
      const entryPool: any[] = [];
      for (const m of byType[chosenType]) {
        entryPool.push(m);
        if (m.isHighPriority) entryPool.push(m);
      }
      const mediaItem = entryPool[Math.floor(Math.random() * entryPool.length)];

      const getBaseTarget = (type: string, lv: number) => {
        const levels = {
          'Game': [2, 5, 10, 20, 40],
          'Visual Novel': [2, 5, 10, 20, 40],
          // Progress for an audiobook boss is credited in logged hours, like
          // Game/VN. Without an entry here it fell through to the Master Pages
          // fallback below — a 180-"Units" target filled at 0.33 per 20 minutes.
          'Audiobook': [2, 5, 10, 20, 40],
          'Book': [40, 100, 200, 400, 800],
          'Manga': [6, 12, 20, 34, 60],
          'Series': [2, 6, 12, 24, 40],
          'Comic': [4, 8, 14, 24, 30],
          'Movie': [1, 1, 1, 1, 1]
        }[type] || [90, 180, 360, 720, 1440]; // Fallback to old Master Pages scale

        return levels[lv - 1];
      };

      const getUnit = (type: string) => ({
        'Game': 'Hours',
        'Visual Novel': 'Hours',
        'Audiobook': 'Hours',
        'Book': 'Pages',
        'Manga': 'Chapters',
        'Series': 'Episodes',
        'Comic': 'Issues',
        'Movie': 'Movies'
      }[type] || 'Units');

      const baseTarget = getBaseTarget(mediaItem.mediaType, level);
      // A movie boss is beaten simply by watching the movie once, regardless of difficulty.
      const target = mediaItem.mediaType === 'Movie' ? 1 : Math.max(0.1, baseTarget * difficulty);
      const unit = getUnit(mediaItem.mediaType);

      const enemy = await generateEnemy(userId, mediaItem, level);
      const fallbackNames = ["Void Stalker", "Doom Herald", "Chaos Reaver", "Eternal Echo"];
      const bossName = enemy?.name || fallbackNames[Math.floor(Math.random() * fallbackNames.length)];

      let nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
      nextMonday.setHours(5, 0, 0, 0);

      const bossId = uuidv4();
      db.prepare(`
        INSERT INTO world_bosses (id, userId, mediaId, name, title, description, imagePrompt, level, targetProgress, currentProgress, expiresAt, createdAt, updatedAt, unit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(bossId, userId, mediaItem.id, bossName, enemy?.title || null, enemy?.description || null, enemy?.imagePrompt || null, level, target, 0, nextMonday.toISOString(), new Date().toISOString(), new Date().toISOString(), unit);

      // Auto-generate the portrait in the background, from the prompt the AI just wrote.
      generateBossImageBackground(userId, bossId);
    } catch (e) {
        console.error("Boss spawn failed", e);
        if (throwOnEmpty) throw e;
    }
  }

  return { spawnWorldBoss, generateEnemy };
}
