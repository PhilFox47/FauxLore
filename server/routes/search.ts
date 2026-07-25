import type { Express } from "express";
import type { ServerContext } from "../context";
import { searchGames, getGameDetails, diagnose as gslDiagnose } from "../integrations/gamestorylog";

export function registerSearchRoutes(app: Express, ctx: ServerContext) {
  const { db, getAuthUser, hltbSearch, getIgdbToken } = ctx;

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
      // We grab standard fields + involved companies (for developers/publishers) + genres
      const body = `
        search "${query}";
        fields name, summary, url, cover.image_id, first_release_date, total_rating, total_rating_count, category, involved_companies.company.name, involved_companies.developer, involved_companies.publisher, genres.name, themes.name, platforms.name, franchises.name;
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
          expectedReleaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).toISOString() : undefined,
          reviewScore: game.total_rating ? Math.round(game.total_rating / 10) / 2 : undefined,
          averagePlaytime: hltbMainExtra || hltbMain || 0,
          hltbMain,
          hltbMainExtra,
          hltbCompletionist,
          selectedHltbType: 'mainExtra' as const,
          genres: [],
          tags: [],
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

      // 2. Fetch detailed info (credits + genres + keywords) for the top 20
      const detailedResults = await Promise.all(topResults.map(async (item: any) => {
         const detailRes = await fetch(`https://api.themoviedb.org/3/${type}/${item.id}?api_key=${apiKey}&append_to_response=credits,keywords`);
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

        const genres = (detail.genres || []).map((g: any) => g.name);

        let tags: string[] = [];
        if (detail.keywords) {
           const kwList = detail.keywords.keywords || detail.keywords.results || [];
           tags = kwList.map((k: any) => k.name).filter(Boolean);
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
          reviewScore: detail.vote_average ? Math.round(detail.vote_average) / 2 : undefined, // 0-10 -> 0-5
          genres: [],
          tags: [],
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
        fields: "title, image.url, description, rating, developers.name, length_minutes, released, tags.name",
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

        return {
          id: vn.id,
          title: vn.title,
          description: vn.description,
          coverImageUrl: vn.image?.url || "",
          developer: developer,
          year: vn.released ? new Date(vn.released).getFullYear() : undefined,
          reviewScore: vn.rating ? Math.round(vn.rating / 10) / 2 : undefined, // Convert 1-100 to 0-5
          averagePlaytime: vn.length_minutes ? Math.round(vn.length_minutes / 60) : undefined,
          genres: [],
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
            detailed.push({ id: m.slug, slug: m.slug, title: m.title, url: m.url, platforms: [], genres: [], tags: [] });
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
          genres: g.genres || [],
          tags: g.tags || [],
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

            let coverImageUrl = "";
            if (volumeInfo.imageLinks) {
              coverImageUrl = volumeInfo.imageLinks.thumbnail?.replace('http:', 'https:') 
                || volumeInfo.imageLinks.smallThumbnail?.replace('http:', 'https:') 
                || "";
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
              genres: []
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
        const coverImageUrl = filename ? `https://uploads.mangadex.org/covers/${m.id}/${filename}` : "";

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
          genres: [],
          tags: attr.tags.map((t: any) => t.attributes.name.en),
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
