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

    const prompt = `You are the Enemy Forge of FauxLore. Your job is to conjure ONE opponent out of a piece of media the player is currently working through, and to make it feel like it genuinely stepped out of that world.

THE SOURCE: "${mediaItem.title}" (${mediaItem.mediaType})

${codexBlock || `(No Codex is on record for this title — rely on your own knowledge of it, and stay faithful to what you actually know.)`}

THE ENCOUNTER (fixed by the game — honour it exactly):
- Difficulty: Level ${level} of 5 — ${LEVEL_DESCRIPTIONS[level] || LEVEL_DESCRIPTIONS[3]}
- Visually it must read as ${tier.word}: ${tier.look}.

HOW TO WRITE IT:
1. Choose the opponent yourself. Ideally it is a real character, creature, faction member or force from this work — the Codex above lists candidates — picked so its stature matches Level ${level}. A Level 1 should be something the fandom would laugh at; a Level 5 should be the kind of thing the whole work builds towards.
2. If nothing in the work fits that level, invent one — but build it out of this work's own material: its factions, its terminology, its creatures, its aesthetics. Never a generic fantasy monster.
3. Give it an RPG epithet that suits the tier ("King of the Koopas", "Intern of the Seventh Circle"). Keep the name the entity's real name where one exists.
4. Write 1-3 sentences of flavour text: what it is, how it fights or thwarts the player, in the voice and tone of the source work. Be specific and let its personality show. Wit is welcome at low levels; dread at high ones.
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
  "title": "its RPG epithet, without the name",
  "description": "1-3 sentences of flavour text",
  "imagePrompt": "the complete image prompt"
}`;

    try {
      // No web search here: the Codex already did the research, so this call is
      // pure creative writing and runs on the cheaper, faster model.
      const raw = await nanoGenerateText(aiConfig, prompt, { temperature: 1.0 });
      if (!raw) throw new Error("The model returned an empty enemy.");
      const parsed = parseJsonLoose<any>(raw);

      const clean = (v: any) => String(v || "").replace(/\*\*/g, "").replace(/^["']|["']$/g, "").trim();
      const name = clean(parsed.name);
      if (!name) throw new Error("The enemy has no name.");

      return {
        name,
        title: clean(parsed.title),
        description: clean(parsed.description),
        imagePrompt: String(parsed.imagePrompt || "").trim(),
      };
    } catch (e) {
      console.error("Enemy generation failed", e);
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
      const eligibleWhere = `userId = ? AND (noEnemies = 0 OR noEnemies IS NULL) AND ((mediaType != 'Movie' AND status = 'Active') OR (mediaType = 'Movie' AND status IN ('Active', 'Planning')))`;

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
