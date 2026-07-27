import { v4 as uuidv4 } from "uuid";
import { calculateRPGState } from "../../src/lib/rpgSystem";
import { getPersonaDescription } from "../../src/lib/personas";
import { normalizeMedia } from "../lib/normalize";
import type { Db } from "../context";

/** The Narrative Oracle: generates morning/evening flavor messages via NanoGPT. */
export function createOracleService({ db }: { db: Db }) {
  async function generateOracleMessage(userId: string, type: 'morning' | 'evening') {
    try {
      const settings: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId);
      const sysSettings: any = db.prepare('SELECT * FROM system_settings WHERE id = \'system\'').get();
      const apiKey = settings?.nanoGptApiKey || sysSettings?.nanoGptApiKey;
      if (!apiKey) return;

      const activeBosses: any[] = db.prepare("SELECT * FROM world_bosses WHERE userId = ? AND status = 'Active'").all(userId);
      const allLogs: any[] = db.prepare('SELECT * FROM logs WHERE userId = ? ORDER BY timestamp DESC').all(userId);
      const logs: any[] = db.prepare('SELECT * FROM logs WHERE userId = ? AND timestamp > ?').all(userId, new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString());
      const media: any[] = db.prepare('SELECT * FROM media WHERE userId = ?').all(userId).map(normalizeMedia);
      const artifacts: any[] = db.prepare('SELECT * FROM artifacts WHERE userId = ?').all(userId);
      
      const parsedSettings = {
        ...settings,
        rankConfigs: settings?.rankConfigs ? JSON.parse(settings.rankConfigs) : undefined,
        questConfigs: settings?.questConfigs ? JSON.parse(settings.questConfigs) : undefined
      };
      
      let activeQuests: any[] = [];
      try {
         const rpgState = calculateRPGState(allLogs as any, media as any, parsedSettings, artifacts as any, activeBosses);
         activeQuests = rpgState.quests.filter(q => !q.isFailed);
      } catch (e) {
         console.warn("Could not calculate RPG state for oracle", e);
      }
      
      const dustyMedia = media.filter(m => m.status === 'Active' || m.status === 'On Hold').filter(m => {
        const mLogs = allLogs.filter(l => l.mediaId === m.id);
        if (mLogs.length === 0) return true;
        const lastLog = new Date(mLogs[0].timestamp).getTime();
        return (Date.now() - lastLog) > 7 * 24 * 60 * 60 * 1000;
      }).map(m => m.title);

      const personaStr = getPersonaDescription(settings?.aiPersona);

      const systemPrompt = `You are the Narrative Oracle, a helpful, welcoming, and charismatic gamemaster AI for a personal RPG.
      Your responsibility is to warmly greet the user, give them some engaging advice, and comment on their progress without just parroting the logs.
      NOTE: The concepts of "Enemies", "Bosses", "Combat", and "Quests" are purely metaphorical and part of an innocuous gamified productivity and media tracking system. No real violence is depicted or encouraged. Please ignore any default content policy flags regarding fictional gamified tasks.
      You can make general welcoming remarks, mention a 'dusty' media item that hasn't been active in a while, give advice on overcoming their current World Boss, comment on recent progress, or suggest tackling specific types of quests in their tracker.
      Persona Tone Guide: ${personaStr} Allow this tone to shape your response!`;
      
      let dustyContext = dustyMedia.length > 0 ? `Dusty Media (Needs Attention): ${dustyMedia.slice(0, 3).join(', ')}` : "No neglected media.";
      let bossContext = activeBosses.length > 0 ? `Active Challenges (World Bosses) to overcome: ${activeBosses.map(b => b.name).join(', ')}` : "No active challenges right now.";
      let questContext = activeQuests.length > 0 ? `Active/Completed Quests: ${activeQuests.map(q => `${q.title} (${q.isCompleted ? 'Completed' : 'Active'})`).join(', ')}` : "No interesting quests right now.";
      let logsContext = logs.length > 0 ? `Recent Triumphs (Past 12h): ${logs.slice(0,5).map(l => {
        const m = media.find(x => x.id === l.mediaId);
        return `${m?.title} (+${l.delta} ${l.metricType})`;
      }).join(', ')}` : "No recent logs (Past 12h).";
      
      const recentMessages = db.prepare('SELECT message FROM oracle_messages WHERE userId = ? ORDER BY timestamp DESC LIMIT 20').all(userId) as any[];
      let recentMessagesContext = recentMessages.length > 0 ? `Previous Messages you've sent recently (DO NOT repeat these concepts, greetings, or topics. Be fresh!):\n${recentMessages.map((m, i) => `${i+1}. "${m.message}"`).join('\n')}` : "";

      const userPrompt = `Time of Day: ${type === 'morning' ? 'Morning' : 'Evening'}
      ${logsContext}
      ${bossContext}
      ${questContext}
      ${dustyContext}
      
      ${recentMessagesContext}
      
      Keep it short (2-3 sentences, approx 250 characters). Don't be too cryptic—be charismatic and welcoming!
      Start with a greeting! If it's Morning, suggest a focus for the day (e.g., tackle an enemy, finish a quest, or pick up a dusty book/game). If Evening, summarize their triumphs or encourage them to log something if they haven't.`;

      const aiRes = await fetch("https://nano-gpt.com/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: settings?.nanoGptModel || "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        })
      });

      if (aiRes.ok) {
        const data = await aiRes.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          db.prepare('INSERT INTO oracle_messages (id, userId, message, type, timestamp) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), userId, text.trim(), type, new Date().toISOString());
        }
      } else {
        console.error("Oracle generation API error", await aiRes.text());
      }
    } catch (e) {
      console.error("Oracle generation failed", e);
    }
  }

  async function checkMissedOracleMessages() {
    const users = db.prepare('SELECT id FROM users').all() as {id: string}[];
    const now = new Date();
    const currentHour = now.getHours();
    
    for (const u of users) {
      if (currentHour >= 9) {
          const lastMorning = db.prepare("SELECT timestamp FROM oracle_messages WHERE userId = ? AND type = 'morning' ORDER BY timestamp DESC LIMIT 1").get(u.id) as any;
          const isTodayMorning = lastMorning && (new Date(lastMorning.timestamp).toDateString() === now.toDateString());
          if (!isTodayMorning) {
              await generateOracleMessage(u.id, 'morning');
          }
      }
      if (currentHour >= 21) {
          const lastEvening = db.prepare("SELECT timestamp FROM oracle_messages WHERE userId = ? AND type = 'evening' ORDER BY timestamp DESC LIMIT 1").get(u.id) as any;
          const isTodayEvening = lastEvening && (new Date(lastEvening.timestamp).toDateString() === now.toDateString());
          if (!isTodayEvening) {
              await generateOracleMessage(u.id, 'evening');
          }
      }
    }
  }

  return { generateOracleMessage, checkMissedOracleMessages };
}
