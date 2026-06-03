import type { Db } from "../context";

/** Background re-sync of ongoing manga metadata against MangaDex. */
export function createMediaSync(db: Db) {
  const syncOngoingMediaInBackground = async (userId: string) => {
    try {
      const now = new Date();
      // 7 days in ms
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      
      const rows: any[] = db.prepare(`SELECT * FROM media WHERE userId = ? AND mediaType = 'Manga' AND (isOngoing = 1 OR releaseStatus IN ('RELEASING', 'HIATUS', 'NOT_YET_RELEASED')) AND originalMediaId IS NOT NULL`).all(userId);
      
      for (const row of rows) {
        let shouldSync = false;
        if (!row.lastSyncAt) {
          shouldSync = true;
        } else {
          const lastSync = new Date(row.lastSyncAt).getTime();
          if (now.getTime() - lastSync > SEVEN_DAYS) {
            shouldSync = true;
          }
        }
        
        if (shouldSync) {
          const mediaId = row.originalMediaId;
          if (mediaId && mediaId.length > 0) {
            try {
              // Fetch MangaDex
              const mangaDexRes = await fetch(`https://api.mangadex.org/manga/${mediaId}`);

              if (mangaDexRes.ok) {
                const data = await mangaDexRes.json();
                if (data.data?.attributes) {
                  const attr = data.data.attributes;
                  let currentChapters = attr.lastChapter ? Math.floor(parseFloat(attr.lastChapter)) : row.totalChapters;
                  let currentVolumes = attr.lastVolume ? Math.floor(parseFloat(attr.lastVolume)) : row.totalIssues;

                  // If ongoing and lastChapter is null, try to fetch aggregate to find the latest chapter
                  if (attr.status === 'ongoing' || !attr.lastChapter) {
                    try {
                      const aggRes = await fetch(`https://api.mangadex.org/manga/${mediaId}/aggregate?translatedLanguage[]=en`);
                      if (aggRes.ok) {
                        const aggData = await aggRes.json();
                        let maxChapter = 0;
                        if (aggData.volumes) {
                          Object.values(aggData.volumes).forEach((vol: any) => {
                            if (vol.chapters) {
                              Object.values(vol.chapters).forEach((chap: any) => {
                                const c = parseFloat(chap.chapter);
                                if (!isNaN(c) && c > maxChapter) {
                                  maxChapter = c;
                                }
                              });
                            }
                          });
                        }
                        if (maxChapter > 0) {
                          currentChapters = Math.floor(maxChapter);
                        }
                      }
                    } catch (aggErr) {
                      console.error("Failed to fetch MangaDex aggregate", aggErr);
                    }
                  }

                  db.prepare(`UPDATE media SET totalChapters = ?, totalIssues = ?, releaseStatus = ?, isOngoing = ?, lastSyncAt = ? WHERE id = ?`)
                    .run(
                      currentChapters, 
                      currentVolumes, 
                      attr.status.toUpperCase(), 
                      (attr.status === "ongoing") ? 1 : 0, 
                      now.toISOString(), 
                      row.id
                    );
                }
              }
            } catch (fetchErr) {
              console.error(`Failed to sync MangaDex media ${mediaId}`, fetchErr);
            }
          }
        }
      }
    } catch (e) {
      console.error("Background sync failed", e);
    }
  };
  return syncOngoingMediaInBackground;
}
