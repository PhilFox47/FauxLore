import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config();

let igdbToken: { access_token: string, expires_at: number } | null = null;
async function getIgdbToken() {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error("IGDB_CLIENT_ID or IGDB_CLIENT_SECRET environment variable is missing.");
  }

  if (igdbToken && Date.now() < igdbToken.expires_at) {
    return igdbToken.access_token;
  }

  const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, {
    method: 'POST'
  });

  if (!res.ok) {
    throw new Error("Failed to authenticate with Twitch for IGDB: " + res.statusText);
  }

  const data = await res.json();
  igdbToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in * 1000) - 60000 // 1 minute buffer
  };

  return igdbToken.access_token;
}

async function startServer() {
  const app = express();
  // AI Studio requires port 3000, but using process.env.PORT allows you to easily proxy or run locally on other ports!
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Middleware to parse JSON bodies
  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // IGDB Video Game Database Integration
  app.get("/api/games/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      const clientId = process.env.IGDB_CLIENT_ID;

      if (!query) {
        return res.status(400).json({ error: "Missing search query" });
      }

      const token = await getIgdbToken();

      // We use Apicalypse to query IGDB
      // We grab standard fields + involved companies (for developers/publishers) + genres
      const body = `
        search "${query}";
        fields name, summary, cover.image_id, first_release_date, total_rating, involved_companies.company.name, involved_companies.developer, involved_companies.publisher, genres.name, themes.name;
        limit 5;
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

      const data = await igdbRes.json();

      const mappedResults = data.map((game: any) => {
        let developer = "";
        let publisher = "";
        
        if (game.involved_companies) {
          const dev = game.involved_companies.find((ic: any) => ic.developer);
          const pub = game.involved_companies.find((ic: any) => ic.publisher);
          if (dev && dev.company) developer = dev.company.name;
          if (pub && pub.company) publisher = pub.company.name;
        }

        return {
          id: game.id.toString(),
          title: game.name,
          description: game.summary,
          coverImageUrl: game.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg` : "",
          year: game.first_release_date ? new Date(game.first_release_date * 1000).getFullYear() : undefined,
          reviewScore: game.total_rating ? Math.round(game.total_rating / 10) / 2 : undefined,
          averagePlaytime: 0, // IGDB does not have a native "time_to_beat" in the v4 games endpoint without an external source
          genres: game.genres ? game.genres.map((g: any) => g.name) : [],
          tags: game.themes ? game.themes.map((t: any) => t.name) : [],
          developer,
          publisher
        };
      });

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching IGDB:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from VGDB." });
    }
  });

  // TMDB proxy integration for Movies and Series
  app.get("/api/tmdb/search", async (req, res) => {
    try {
      const apiKey = process.env.TMDB_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Missing TMDB_API_KEY environment variable. Please configure it in AI Studio settings." });
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
      const topResults = (searchData.results || []).slice(0, 5);

      // 2. Fetch detailed info (credits + genres) for the top 5
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

        const genres = (detail.genres || []).map((g: any) => g.name);

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
          genres: genres,
          creator: creator,
          totalEpisodes: type === 'tv' ? detail.number_of_episodes : undefined,
          runtimeMinutes: runtimeMinutes,
          seasons: type === 'tv' ? seasons : undefined
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
        results: 5
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
        
        let genres: string[] = [];
        if (vn.tags) {
           genres = vn.tags.slice(0, 5).map((t: any) => t.name).filter(Boolean);
        }

        return {
          id: vn.id,
          title: vn.title,
          description: vn.description,
          coverImageUrl: vn.image?.url || "",
          developer: developer,
          year: vn.released ? new Date(vn.released).getFullYear() : undefined,
          reviewScore: vn.rating ? Math.round(vn.rating / 10) / 2 : undefined, // Convert 1-100 to 0-5
          averagePlaytime: vn.length_minutes ? Math.round(vn.length_minutes / 60) : undefined,
          genres: genres
        };
      });

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching VNDB:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from VNDB." });
    }
  });

  // Hardcover API endpoints...
  app.post("/api/books/introspect", async (req, res) => {
    try {
      const apiKey = process.env.HARDCOVER_API_KEY;
      if (!apiKey) return res.status(500).json({error: "No key"});
      
      const query = req.body.query || `
        query {
          __type(name: "books") {
            fields {
              name
              type { name kind ofType { name kind } }
            }
          }
        }
      `;
      const hcRes = await fetch("https://api.hardcover.app/v1/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`
        },
        body: JSON.stringify({ query })
      });
      const data = await hcRes.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({error: e.message});
    }
  });

  // Hardcover.app Integration (Books)
  app.get("/api/books/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      const apiKey = process.env.HARDCOVER_API_KEY;

      if (!query) {
        return res.status(400).json({ error: "Missing search query" });
      }
      if (!apiKey) {
        return res.status(500).json({ error: "HARDCOVER_API_KEY environment variable is missing." });
      }

      // Hardcover's Hasura instance blocks _ilike due to performance queries.
      // We perform an exact match query on the title or slug instead.
      const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      
      const graphqlQuery = `
        query searchBooks($title: String!, $slug: String!) {
          books(where: {_or: [{title: {_eq: $title}}, {slug: {_eq: $slug}}]}, order_by: {users_count: desc}, limit: 5) {
            id
            title
            release_year
            pages
            rating
            description
            cached_tags
            image {
              url
            }
            contributions {
              author {
                name
              }
            }
            taggings {
              tag {
                tag
              }
            }
          }
        }
      `;

      const hcRes = await fetch("https://api.hardcover.app/v1/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          query: graphqlQuery,
          variables: { title: query, slug: slug }
        })
      });

      const data = await hcRes.json();

      if (!hcRes.ok) {
        throw new Error(data.error || data.message || `Hardcover API HTTP Error: ${hcRes.status}`);
      }

      if (data.errors) {
        throw new Error(data.errors[0].message || "GraphQL Error from Hardcover API");
      }
      
      if (data.error) {
        throw new Error(data.error);
      }

      const books = data.data?.books || [];
      const mappedResults = books.map((book: any) => {
        let creator = "";
        if (book.contributions && book.contributions.length > 0) {
          // Generally the first contribution is the primary author
          creator = book.contributions[0].author?.name || "";
        }

        let genres: string[] = [];
        if (book.cached_tags && book.cached_tags.Genre) {
           genres = book.cached_tags.Genre.map((g: any) => g.tag).filter(Boolean);
        } else if (book.taggings && book.taggings.length > 0) {
           genres = book.taggings.map((t: any) => t.tag?.tag).filter(Boolean);
        }

        return {
          id: book.id?.toString(),
          title: book.title,
          description: book.description,
          coverImageUrl: book.image?.url || "",
          year: book.release_year,
          reviewScore: book.rating ? Math.round(book.rating * 2) / 2 : undefined,
          totalPages: book.pages,
          creator: creator,
          genres: genres
        };
      });

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching Hardcover:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from Hardcover." });
    }
  });

  // Anilist API proxy for Manga
  app.get("/api/anilist/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Missing search query" });
      }

      const graphqlQuery = `
        query ($search: String) {
          Page (perPage: 5) {
            media (search: $search, type: MANGA) {
              id
              title {
                romaji
                english
              }
              description(asHtml: false)
              coverImage {
                extraLarge
              }
              startDate {
                year
              }
              averageScore
              chapters
              genres
              staff {
                edges {
                  role
                  node {
                    name {
                      full
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const aniRes = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          query: graphqlQuery,
          variables: { search: query }
        })
      });

      if (!aniRes.ok) {
        throw new Error(`Anilist error: ${aniRes.statusText}`);
      }

      const data = await aniRes.json();
      if (data.errors) {
        throw new Error(data.errors[0].message || "GraphQL Error from Anilist API");
      }

      const media = data.data?.Page?.media || [];

      const mappedResults = media.map((m: any) => {
        // Find the creator, typically "Story & Art" or "Story"
        let creator = "";
        if (m.staff?.edges) {
          const mainStaff = m.staff.edges.find((e: any) => 
            e.role?.toLowerCase().includes("story") || 
            e.role?.toLowerCase().includes("art")
          );
          if (mainStaff && mainStaff.node?.name?.full) {
            creator = mainStaff.node.name.full;
          }
        }

        return {
          id: m.id.toString(),
          title: m.title.english || m.title.romaji,
          description: m.description,
          coverImageUrl: m.coverImage?.extraLarge || "",
          year: m.startDate?.year,
          // Anilist score is out of 100
          reviewScore: m.averageScore ? Math.round(m.averageScore / 10) / 2 : undefined,
          totalChapters: m.chapters,
          genres: m.genres || [],
          creator: creator
        };
      });

      res.json(mappedResults);
    } catch (error: any) {
      console.error("Error searching Anilist:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata from Anilist." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
