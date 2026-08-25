import type { Express } from "express";
import type { ServerContext } from "../context";
import { searchGames, getGameDetails, diagnose as gslDiagnose } from "../integrations/gamestorylog";
import { LOW_RES_WIDTH, bestCoverForVolume } from "../integrations/bookCovers";
import { VNDB_TITLE_FIELDS, vndbNames } from "../integrations/vndb";

/**
 * The year out of whatever VNDB answered.
 *
 * Its `released` is YYYY-MM-DD, YYYY-MM, YYYY, "TBA", "unknown" or "today".
 * Handing any of those to `new Date()` and asking for the year gives NaN for the
 * word forms, which then travels as a year.
 */
function vndbYear(released?: string): number | undefined {
  const m = /^(\d{4})/.exec((released || '').trim());
  if (!m) return undefined;
  const year = Number(m[1]);
  return Number.isFinite(year) ? year : undefined;
}

/**
 * IGDB's release date, honest about how precise it is.
 *
 * `release_dates[].category` grades it: 0 is an exact day, 1 a month, 2 a year,
 * 3-6 a quarter, 7 undecided. Only category 0 becomes a real date; anything
 * coarser keeps IGDB's own human wording ("Q4 2026") so nothing downstream can
 * mistake a placeholder for a day.
 */
const IGDB_EXACT_DAY = 0;
function igdbRelease(game: any): { expectedReleaseDate?: string; releaseDateLabel?: string } {
  const stamp = game?.first_release_date;
  if (!stamp) return {};

  // The entry whose date matches the game's headline date is the one that
  // produced it, so its category is the one that describes it.
  const dates: any[] = Array.isArray(game.release_dates) ? game.release_dates : [];
  const match = dates.find((d) => d?.date === stamp) || dates[0];
  const iso = new Date(stamp * 1000).toISOString();

  // No release_dates at all: IGDB has given us nothing to judge precision with,
  // so the timestamp is taken at face value rather than thrown away.
  if (!match || match.category === IGDB_EXACT_DAY) return { expectedReleaseDate: iso };
  return { releaseDateLabel: String(match.human || "").trim() || undefined };
}

export function registerSearchRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser, hltbSearch, getIgdbToken, activity } = ctx;

  app.get("/api/games/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      const userId = getAuthUser(req, res) as string;
      if (!userId) return;
      const userSettings: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) || {};
      const sysSettings: any = db.prepare('SELECT * FROM system_settings WHERE id = ?').get('system') || {};
      const clientId = sysSettings.igdbClientId || process.env.IGDB_CLIENT_ID;
      const clientSecret = sysSettings.igdbClientSecret || process.env.IGDB_CLIENT_SECRET;

      if (!query) {
        return res.status(400).json({ error: "Missing search query" });
      }

      const token = await getIgdbToken(clientId, clientSecret);

      // We use Apicalypse to query IGDB
      // We grab standard fields + involved companies (for developers/publishers)
      const body = `
        search "${query}";
        fields name, summary, url, cover.image_id, first_release_date, release_dates.date, release_dates.human, release_dates.category, total_rating, total_rating_count, category, involved_companies.company.name, involved_companies.developer, involved_companies.publisher, platforms.name, franchises.name;
        limit 50;
      `;

      const igdbRes = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Client-ID": clientId as string,
          "Authorization": `Bearer ${token}`
        },
        body: body
      });

      if (!igdbRes.ok) {
        throw new Error(`IGDB error: ${igdbRes.statusText}`);
      }

      let data = await igdbRes.json();

      // Sort logic: Prioritize Main Games (0), Remakes (8), Remasters (9), Standalone Expansions (4).
      // Downgrade DLCs (1), Expansions (2), Updates (14), Episodes (6), Seasons (7), Ports (11), etc.
      // Additionally, sort by total_rating_count to bring popular titles up.
      data.sort((a: any, b: any) => {
        const getPriority = (cat: number) => {
          if (cat === 0) return 1; // main
          if (cat === 8 || cat === 9) return 2; // remakes/remasters
          if (cat === 4 || cat === 10) return 3; // standalone exp / expanded
          if (cat === 11) return 4; // ports
          if (cat === 1 || cat === 2) return 5; // dlc / exp
          return 6; // patches, updates, mods, etc.
        };
        const pA = getPriority(a.category);
        const pB = getPriority(b.category);
        
        if (pA !== pB) return pA - pB;
        
        const countA = a.total_rating_count || 0;
        const countB = b.total_rating_count || 0;
        if (countA !== countB) return countB - countA;
        
        return 0; // fallback to IGDB relevance
      });

      // Limit array back to 20 after sorting
      data = data.slice(0, 20);

      const mappedResults = await Promise.all(data.map(async (game: any) => {
        let developer = "";
        let publisher = "";
        
        if (game.involved_companies) {
          const dev = game.involved_companies.find((ic: any) => ic.developer);
          const pub = game.involved_companies.find((ic: any) => ic.publisher);
          if (dev && dev.company) developer = dev.company.name;
          if (pub && pub.company) publisher = pub.company.name;
        }

        let hltbMain = 0;
        let hltbMainExtra = 0;
        let hltbCompletionist = 0;
        try {
          const hltbResults = await hltbSearch(game.name);
          if (hltbResults && hltbResults.length > 0) {
            const hltbRecord = hltbResults[0];
            hltbMain = hltbRecord.gameplayMain || 0;
            hltbMainExtra = hltbRecord.gameplayMainExtra || 0;
            hltbCompletionist = hltbRecord.gameplayCompletionist || 0;
          }
        } catch (e) {
          console.error(`HLTB error for ${game.name}:`, e);
        }

        return {
          id: game.id.toString(),
          title: game.name,
          description: game.summary,
          coverImageUrl: game.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg` : "",
          year: game.first_release_date ? new Date(game.first_release_date * 1000).getFullYear() : undefined,
          // `first_release_date` is a timestamp even when IGDB only knows the
          // quarter — "Q4 2026" arrives as the first of October. Showing that as
          // an exact date claims a precision the source never had, so the date is
          // only kept when IGDB says it is exact, and its own wording is carried
          // alongside for everything else.
          ...igdbRelease(game),
          reviewScore: game.total_rating ? Math.round(game.total_rating / 10) / 2 : undefined,
          averagePlaytime: hltbMainExtra || hltbMain || 0,
          hltbMain,
          hltbMainExtra,
          hltbCompletionist,
          selectedHltbType: 'mainExtra' as const,
          // Genres and tags are deliberately absent. Every source names them
          // differently — IGDB themes, TMDB keywords, MangaDex tags,
          // GameStoryLog's tag cloud — and importing any of them fills the
          // library with terms that are not in the taxonomy. Auto-tagging owns
          // these two fields; see server/services/autoTag.ts.
          platforms: game.platforms ? game.platforms.map((p: any) => p.name) : [],
          franchises: game.franchises ? game.franchises.map((f: any) => f.name) : [],
          developer,
          publisher,
          metadataSource: "igdb",
          metadataSourceId: game.id.toString(),
          sourceUrl: game.url || null
        };
      }));

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching IGDB:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from VGDB." });
    }
  });

  app.get("/api/hltb/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) return res.status(400).json({ error: "Missing query" });
      
      const results = await hltbSearch(query);
      if (results && results.length > 0) {
        const top = results[0];
        res.json({
          hltbMain: top.gameplayMain || 0,
          hltbMainExtra: top.gameplayMainExtra || 0,
          hltbCompletionist: top.gameplayCompletionist || 0
        });
      } else {
        res.status(404).json({ error: "No HLTB data found" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // TMDB proxy integration for Movies and Series
  app.get("/api/tmdb/search", async (req, res) => {
    try {
      const userId = getAuthUser(req, res) as string;
      if (!userId) return;
      const userSettings: any = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) || {};
      const sysSettings: any = db.prepare('SELECT * FROM system_settings WHERE id = ?').get('system') || {};
      const apiKey = sysSettings.tmdbApiKey || process.env.TMDB_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "Missing TMDB API KEY. Please configure it in Settings." });
      }

      const query = req.query.q as string;
      const type = req.query.type as string; // 'movie' or 'tv'
      if (!query || !type) return res.json([]);

      // 1. Search for the basic items
      const searchRes = await fetch(`https://api.themoviedb.org/3/search/${type}?api_key=${apiKey}&query=${encodeURIComponent(query)}&page=1`);
      if (!searchRes.ok) {
         throw new Error("Failed to search TMDB");
      }
      
      const searchData = await searchRes.json();
      const topResults = (searchData.results || []).slice(0, 20);

      // 2. Fetch detailed info (credits) for the top 20
      const detailedResults = await Promise.all(topResults.map(async (item: any) => {
         const detailRes = await fetch(`https://api.themoviedb.org/3/${type}/${item.id}?api_key=${apiKey}&append_to_response=credits`);
         if (!detailRes.ok) return null;
         return detailRes.json();
      }));

      // 3. Map into expected format
      const mappedResults = detailedResults.filter(Boolean).map((detail: any) => {
        let creator = "";
        if (type === 'movie' && detail.credits?.crew) {
           const director = detail.credits.crew.find((c: any) => c.job === 'Director');
           if (director) creator = director.name;
        } else if (type === 'tv' && detail.created_by && detail.created_by.length > 0) {
           creator = detail.created_by.map((c: any) => c.name).join(', ');
        }

        let franchises: string[] = [];
        if (detail.belongs_to_collection) {
           franchises.push(detail.belongs_to_collection.name);
        }

        const seasons = detail.seasons ? detail.seasons.map((s: any) => ({
          id: s.id.toString(),
          name: s.name,
          seasonNumber: s.season_number,
          episodeCount: s.episode_count,
          overview: s.overview,
          posterPath: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : "",
          voteAverage: s.vote_average,
          airDate: s.air_date
        })) : [];

        // TMDB dates are plain YYYY-MM-DD. Normalising to midday UTC keeps a
        // date from sliding a day backwards for anyone west of Greenwich once it
        // is parsed and re-serialised.
        const firstAired = ((type === 'movie' ? detail.release_date : detail.first_air_date) || '').trim();

        // Parse runtime
        let runtimeMinutes: number | undefined = undefined;
        if (type === 'movie' && detail.runtime) {
          runtimeMinutes = detail.runtime;
        } else if (type === 'tv') {
          if (detail.episode_run_time && detail.episode_run_time.length > 0) {
            runtimeMinutes = detail.episode_run_time[0];
          } else if (detail.last_episode_to_air && detail.last_episode_to_air.runtime) {
            runtimeMinutes = detail.last_episode_to_air.runtime;
          } else if (detail.next_episode_to_air && detail.next_episode_to_air.runtime) {
            runtimeMinutes = detail.next_episode_to_air.runtime;
          }
        }

        return {
          id: detail.id.toString(),
          title: type === 'movie' ? detail.title : detail.name,
          description: detail.overview,
          coverImageUrl: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : "",
          year: type === 'movie' ? (detail.release_date ? new Date(detail.release_date).getFullYear() : undefined) : (detail.first_air_date ? new Date(detail.first_air_date).getFullYear() : undefined),
          // The exact date, not just the year it falls in. Everything that has to
          // decide "is this out yet" needs the day.
          expectedReleaseDate: firstAired || undefined,
          nextReleaseAt: detail.next_episode_to_air?.air_date || undefined,
          nextReleaseLabel: detail.next_episode_to_air
            ? `S${detail.next_episode_to_air.season_number}E${detail.next_episode_to_air.episode_number}`
            : undefined,
          reviewScore: detail.vote_average ? Math.round(detail.vote_average) / 2 : undefined, // 0-10 -> 0-5
          // Genres and tags are deliberately absent. Every source names them
          // differently — IGDB themes, TMDB keywords, MangaDex tags,
          // GameStoryLog's tag cloud — and importing any of them fills the
          // library with terms that are not in the taxonomy. Auto-tagging owns
          // these two fields; see server/services/autoTag.ts.
          franchises: franchises,
          creator: creator,
          totalEpisodes: type === 'tv' ? detail.number_of_episodes : undefined,
          runtimeMinutes: runtimeMinutes,
          seasons: type === 'tv' ? seasons : undefined,
          metadataSource: "tmdb",
          metadataSourceId: detail.id.toString(),
          sourceUrl: `https://www.themoviedb.org/${type}/${detail.id}`
        };
      });

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching TMDB:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from TMDB." });
    }
  });

  // VNDB Kana API Integration for Visual Novels
  app.get("/api/vndb/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) return res.json([]);

      const payload = {
        filters: ["search", "=", query],
        fields: `${VNDB_TITLE_FIELDS}, image.url, description, rating, developers.name, length_minutes, released`,
        results: 20
      };

      const searchRes = await fetch('https://api.vndb.org/kana/vn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!searchRes.ok) throw new Error("Failed to search VNDB");
      
      const searchData = await searchRes.json();
      
      const mappedResults = (searchData.results || []).map((vn: any) => {
        const developer = (vn.developers && vn.developers.length > 0) ? vn.developers[0].name : "Unknown Developer";

        // VNDB keeps one title per language; the English one is the title here
        // and the original Japanese becomes the subtitle.
        const names = vndbNames(vn);

        return {
          id: vn.id,
          title: names.title,
          subtitle: names.subtitle || "",
          description: vn.description,
          coverImageUrl: vn.image?.url || "",
          developer: developer,
          // VNDB answers with YYYY-MM-DD, YYYY-MM, YYYY, "TBA", "unknown" or
          // "today". Only a full date is a date; the rest is kept as a label so
          // nothing downstream mistakes "2026" for the first of January.
          year: vndbYear(vn.released),
          expectedReleaseDate: /^\d{4}-\d{2}-\d{2}$/.test(vn.released || '') ? vn.released : undefined,
          releaseDateLabel: vn.released && !/^\d{4}-\d{2}-\d{2}$/.test(vn.released) ? vn.released : undefined,
          reviewScore: vn.rating ? Math.round(vn.rating / 10) / 2 : undefined, // Convert 1-100 to 0-5
          averagePlaytime: vn.length_minutes ? Math.round(vn.length_minutes / 60) : undefined,
          // Genres and tags are deliberately absent. Every source names them
          // differently — IGDB themes, TMDB keywords, MangaDex tags,
          // GameStoryLog's tag cloud — and importing any of them fills the
          // library with terms that are not in the taxonomy. Auto-tagging owns
          // these two fields; see server/services/autoTag.ts.
          metadataSource: "vndb",
          metadataSourceId: vn.id,
          sourceUrl: `https://vndb.org/${vn.id}`
        };
      });

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching VNDB:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from VNDB." });
    }
  });

  // GameStoryLog (western / adult visual novels — complements VNDB)
  app.get("/api/gsl/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.trim().length < 2) return res.json([]);

      // Matches against the locally cached sitemap index (no upstream call per keystroke),
      // then hydrates only the top few results with real metadata.
      const matches = await searchGames(query, 8);
      const detailed = [];
      const failures: string[] = [];
      for (const m of matches.slice(0, 5)) {
        try {
          detailed.push(await getGameDetails(m.slug));
        } catch (e: any) {
          // A guessed slug that doesn't resolve isn't a real game — drop it rather
          // than offering a bogus result. Sitemap-derived slugs are known to exist,
          // so keep those as stubs even if the page fetch hiccups.
          failures.push(String(e?.message || e));
          if (m.verified) {
            detailed.push({ id: m.slug, slug: m.slug, title: m.title, url: m.url, platforms: [] });
          }
        }
      }

      // Distinguish "no such game" from "we couldn't read the page". Returning an
      // empty list for an infrastructure failure looks identical to a genuine miss
      // and leaves the user with no idea what went wrong.
      if (detailed.length === 0 && failures.length > 0) {
        const notFound = failures.every((f) => /\(404\)/.test(f));
        if (!notFound) {
          const browserIssue = failures.some((f) =>
            /Could not find|libnss3|error while loading shared libraries|Failed to launch|browser|chrome/i.test(f),
          );
          return res.status(502).json({
            // Always include the underlying error: a paraphrase alone hides whether
            // this is a missing binary, a missing shared library, or something else.
            error: browserIssue
              ? `GameStoryLog needs a headless browser. Chromium could not start: ${failures[0]}`
              : `Could not read the GameStoryLog page: ${failures[0]}`,
          });
        }
      }

      res.json(
        detailed.map((g: any) => ({
          id: g.slug,
          title: g.title,
          description: g.description,
          coverImageUrl: g.coverImageUrl,
          creator: g.developer,
          developer: g.developer,
          // Genres and tags are deliberately absent. Every source names them
          // differently — IGDB themes, TMDB keywords, MangaDex tags,
          // GameStoryLog's tag cloud — and importing any of them fills the
          // library with terms that are not in the taxonomy. Auto-tagging owns
          // these two fields; see server/services/autoTag.ts.
          platforms: g.platforms || [],
          reviewScore: g.reviewScore,
          averagePlaytime: g.averagePlaytime,
          releaseStatus: g.status,
          // provenance so the item can be re-checked for updates later
          metadataSource: "gsl",
          metadataSourceId: g.slug,
          sourceUrl: g.url || `https://gamestorylog.com/games/${g.slug}`,
          sourceVersion: g.version,
          sourceVersions: g.versions || [],
          sourceUpdatedAt: g.updatedAt,
        })),
      );
    } catch (error: any) {
      console.error("Error searching GameStoryLog:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from GameStoryLog." });
    }
  });

  // Diagnostics: reports what the GSL integration can actually see upstream
  // (sitemap shape, slug count, and whether a game page renders server-side).
  app.get("/api/gsl/diagnose", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      res.json(await gslDiagnose((req.query.q as string) || "Being a DIK"));
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  // Google Books Integration
  app.get("/api/books/search", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const userSettings: any = db.prepare('SELECT googleBooksApiKey FROM settings WHERE userId = ?').get(userId) || {};
      const sysSettings: any = db.prepare('SELECT googleBooksApiKey FROM system_settings WHERE id = ?').get('system') || {};
      const apiKey = sysSettings.googleBooksApiKey || process.env.GOOGLE_BOOKS_API_KEY;

      const query = req.query.q as string;
      const lang = req.query.lang as string;

      if (!query) {
        return res.status(400).json({ error: "Missing search query" });
      }

      let mappedResults: any[] = [];
      let fetchSuccess = false;

      // Try Google Books First
      try {
        const pages = [0, 40, 80];
        let allItems: any[] = [];

        for (const startIndex of pages) {
          let retryCount = 0;
          let success = false;
          while (retryCount < 2 && !success) {
            try {
              let googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=40&startIndex=${startIndex}`;
              if (lang) {
                googleUrl += `&langRestrict=${lang}`;
              }
              if (apiKey) {
                googleUrl += `&key=${apiKey}`;
              }
              const res = await fetch(googleUrl, {
                headers: {
                  'User-Agent': 'FauxLoreMediaTracker/1.0'
                }
              });

              if (!res.ok) {
                if (res.status === 503) {
                  // Retry on 503
                  retryCount++;
                  await new Promise(r => setTimeout(r, 1000));
                  continue;
                }
                console.warn(`Google Books API HTTP Error: ${res.status} at index ${startIndex}`);
                break; // Stop fetching more pages on other errors
              }
              const data = await res.json();
              if (data.items) {
                allItems = allItems.concat(data.items);
              }
              success = true;
              if (!data.items || data.items.length < 40) {
                break; // No more results
              }
            } catch (err) {
              console.error(`Google Books fetch failed at index ${startIndex}:`, err);
              break; // Network or parsing error, keep what we have
            }
          }
          if (!success) {
             break; // If we failed all retries for this page, stop fetching more pages
          }
        }

        if (allItems.length > 0) {
          // Deduplicate by ID
          const uniqueItems = Array.from(new Map(allItems.map(item => [item.id, item])).values());
          
          mappedResults = uniqueItems
            .filter((item: any) => {
              const l = item.volumeInfo?.language?.toLowerCase();
              if (lang) {
                return l === lang.toLowerCase();
              }
              return l === 'en' || l === 'de'; // Only English & German by default
            })
            .sort((a: any, b: any) => {
              const titleA = (a.volumeInfo?.title || '').toLowerCase();
              const titleB = (b.volumeInfo?.title || '').toLowerCase();
              const queryLower = query.toLowerCase();
              
              const aExact = titleA === queryLower ? 1 : 0;
              const bExact = titleB === queryLower ? 1 : 0;
              if (aExact !== bExact) return bExact - aExact;
              
              const aStarts = titleA.startsWith(queryLower) ? 1 : 0;
              const bStarts = titleB.startsWith(queryLower) ? 1 : 0;
              if (aStarts !== bStarts) return bStarts - aStarts;

              const aIncludes = titleA.includes(queryLower) ? 1 : 0;
              const bIncludes = titleB.includes(queryLower) ? 1 : 0;
              if (aIncludes !== bIncludes) return bIncludes - aIncludes;

              const aRatingsCount = a.volumeInfo?.ratingsCount || 0;
              const bRatingsCount = b.volumeInfo?.ratingsCount || 0;
              return bRatingsCount - aRatingsCount;
            })
            .map((item: any) => {
              const volumeInfo = item.volumeInfo || {};
            
            let creator = "Unknown Author";
            if (volumeInfo.authors && volumeInfo.authors.length > 0) {
              creator = volumeInfo.authors.join(", ");
            }

            // Only the cleanup that cannot fail here: https, and drop the
            // page-curl decoration Google bakes into the bitmap. Picking a
            // genuinely larger cover needs a request per volume to check what
            // exists, which happens when a result is actually chosen.
            let coverImageUrl = "";
            if (volumeInfo.imageLinks) {
              const raw = volumeInfo.imageLinks.thumbnail || volumeInfo.imageLinks.smallThumbnail || "";
              coverImageUrl = raw.replace('http:', 'https:').replace(/&?edge=curl/g, '');
            }

            const year = volumeInfo.publishedDate ? parseInt(volumeInfo.publishedDate.substring(0, 4)) : undefined;

            return {
              metadataSource: "googlebooks",
              metadataSourceId: item.id,
              sourceUrl: volumeInfo.infoLink || volumeInfo.canonicalVolumeLink || `https://books.google.com/books?id=${encodeURIComponent(item.id)}`,
              id: `gb_${item.id}`,
              title: volumeInfo.title || "Unknown Title",
              subtitle: volumeInfo.subtitle || "",
              description: volumeInfo.description || "",
              publisher: volumeInfo.publisher || "",
              language: volumeInfo.language ? volumeInfo.language.toUpperCase() : "",
              maturityRating: volumeInfo.maturityRating || "",
              coverImageUrl: coverImageUrl,
              year: !isNaN(year as number) ? year : undefined,
              reviewScore: volumeInfo.averageRating ? Math.round(volumeInfo.averageRating * 2) / 2 : undefined,
              totalPages: volumeInfo.pageCount,
              creator: creator,
              // Genres and tags are deliberately absent. Every source names them
              // differently — IGDB themes, TMDB keywords, MangaDex tags,
              // GameStoryLog's tag cloud — and importing any of them fills the
              // library with terms that are not in the taxonomy. Auto-tagging owns
              // these two fields; see server/services/autoTag.ts.
            };
          });
        }
      } catch (err) {
        console.error(`Google Books search processing failed:`, err);
        // We do not throw here so we can return empty results instead of crashing
      }

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching Google Books:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from Google Books." });
    }
  });

  /**
   * The best cover art available for one Google Books volume.
   *
   * Called when a book is picked in the add/edit form, and by the bulk upgrade.
   * Every candidate is fetched and measured, so the answer says what was
   * actually found rather than what a URL promised.
   */
  app.get("/api/books/:volumeId/cover", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      const sysSettings: any = db.prepare('SELECT googleBooksApiKey FROM system_settings WHERE id = ?').get('system') || {};
      const apiKey = sysSettings.googleBooksApiKey || process.env.GOOGLE_BOOKS_API_KEY;

      const current = typeof req.query.current === 'string' ? req.query.current : undefined;
      const best = await bestCoverForVolume(req.params.volumeId, apiKey, current);
      if (!best) return res.json({ found: false });
      res.json({ found: true, ...best });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  /**
   * Re-resolves covers across the library for books added before any of this
   * existed. Only entries whose cover is actually small are touched, so running
   * it twice costs almost nothing the second time.
   */
  app.post("/api/books/covers/upgrade", async (req, res) => {
    try {
      const userId = getAuthUser(req, res);
      if (!userId) return;
      // Not AI, but a request per book against two upstreams — not something to
      // run for an account nobody is using.
      if (!activity.requireActive(userId as string, res)) return;
      const sysSettings: any = db.prepare('SELECT googleBooksApiKey FROM system_settings WHERE id = ?').get('system') || {};
      const apiKey = sysSettings.googleBooksApiKey || process.env.GOOGLE_BOOKS_API_KEY;

      const rows: any[] = db.prepare(
        `SELECT id, title, coverImageUrl, metadataSourceId
           FROM media
          WHERE userId = ?
            AND metadataSource = 'googlebooks'
            AND metadataSourceId IS NOT NULL`,
      ).all(userId);

      const update = db.prepare('UPDATE media SET coverImageUrl = ?, updatedAt = ? WHERE id = ? AND userId = ?');
      const upgraded: { id: string; title: string; width: number; source: string }[] = [];
      let skipped = 0;
      let failed = 0;

      for (const row of rows) {
        const best = await bestCoverForVolume(row.metadataSourceId, apiKey, row.coverImageUrl || undefined);
        if (!best) { failed++; continue; }
        // Replacing a URL with an equal-or-worse one is churn, not an upgrade.
        if (best.url === row.coverImageUrl || best.width < LOW_RES_WIDTH) { skipped++; continue; }
        update.run(best.url, new Date().toISOString(), row.id, userId);
        upgraded.push({ id: row.id, title: row.title, width: best.width, source: best.source });
      }

      res.json({ checked: rows.length, upgraded, skipped, failed });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  // MangaDex API proxy for Manga
  app.get("/api/manga/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Missing search query" });
      }

      const mangaDexRes = await fetch(`https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=20&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic&includes[]=cover_art&includes[]=author`);

      if (!mangaDexRes.ok) {
        throw new Error(`MangaDex error: ${mangaDexRes.statusText} (${mangaDexRes.status})`);
      }

      const data = await mangaDexRes.json();
      const mangaList = data.data || [];

      const mappedResults = await Promise.all(mangaList.map(async (m: any) => {
        const attr = m.attributes;
        const title = attr.title.en || attr.title.ja || attr.title["ja-ro"] || Object.values(attr.title)[0];
        const description = attr.description.en || Object.values(attr.description || {})[0] || "";
        
        const authorRel = m.relationships.find((r: any) => r.type === "author");
        const author = authorRel?.attributes?.name || "";

        const coverRel = m.relationships.find((r: any) => r.type === "cover_art");
        const filename = coverRel?.attributes?.fileName;
        // MangaDex's bare cover path is the original upload — a full-resolution
        // scan, frequently several megabytes. It also publishes 256px and 512px
        // renditions, which is what a cover slot in this app actually needs.
        //
        // Note for whoever touches the display side: MangaDex answers any
        // request whose Referer is neither a mangadex.org URL nor empty with a
        // "read this at MangaDex" placeholder instead of the cover. Every <img>
        // that shows cover art therefore needs referrerPolicy="no-referrer".
        const coverImageUrl = filename ? `https://uploads.mangadex.org/covers/${m.id}/${filename}.512.jpg` : "";

        let totalChapters = attr.lastChapter ? Math.floor(parseFloat(attr.lastChapter)) : undefined;
        let totalIssues = attr.lastVolume ? Math.floor(parseFloat(attr.lastVolume)) : undefined;

        // If ongoing, try a quick aggregate fetch to get current progress
        if (attr.status === 'ongoing' && !totalChapters) {
          try {
            const aggRes = await fetch(`https://api.mangadex.org/manga/${m.id}/aggregate?translatedLanguage[]=en`);
            if (aggRes.ok) {
              const aggData = await aggRes.json();
              let maxChap = 0;
              if (aggData.volumes) {
                Object.values(aggData.volumes).forEach((v: any) => {
                  Object.values(v.chapters || {}).forEach((c: any) => {
                    const num = parseFloat(c.chapter);
                    if (!isNaN(num) && num > maxChap) maxChap = num;
                  });
                });
              }
              if (maxChap > 0) totalChapters = Math.floor(maxChap);
            }
          } catch (e) {
            // Ignore error for search enrichment
          }
        }

        return {
          metadataSource: "mangadex",
          metadataSourceId: m.id,
          sourceUrl: `https://mangadex.org/title/${m.id}`,
          id: m.id,
          title,
          description: description.replace(/\[\/?\w+\]/g, ""), // Simple BBCode removal
          coverImageUrl,
          year: attr.year,
          reviewScore: undefined,
          totalChapters,
          totalIssues,
          // Genres and tags are deliberately absent. Every source names them
          // differently — IGDB themes, TMDB keywords, MangaDex tags,
          // GameStoryLog's tag cloud — and importing any of them fills the
          // library with terms that are not in the taxonomy. Auto-tagging owns
          // these two fields; see server/services/autoTag.ts.
          creator: author,
          releaseStatus: attr.status.toUpperCase(),
          isOngoing: attr.status === "ongoing"
        };
      }));

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching MangaDex:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from MangaDex." });
    }
  });

}
