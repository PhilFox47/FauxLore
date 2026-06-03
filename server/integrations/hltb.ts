// HowLongToBeat search scraper. Extracted verbatim from the original server.ts.

async function hltbSearch(query: string) {
  try {
    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36";
    
    // 1. Fetch main page to find the script containing the dynamic endpoint
    const mainPageRes = await fetch("https://howlongtobeat.com/", {
      headers: { "User-Agent": userAgent, "Referer": "https://howlongtobeat.com/" }
    });
    if (!mainPageRes.ok) throw new Error("Could not fetch HLTB main page");
    const mainHtml = await mainPageRes.text();
    
    const scriptRegex = /_next\/static\/chunks\/[^"]+\.js/g;
    const scripts: string[] = mainHtml.match(scriptRegex) || [];
    
    let endpointBasePath = null;
    
    // Prioritize _app scripts but scan all if needed
    const prioritizedScripts = scripts.filter(s => s.includes('_app'));
    const otherScripts = scripts.filter(s => !s.includes('_app'));
    const allScripts = [...prioritizedScripts, ...otherScripts].slice(0, 15);
    
    for (const script of allScripts) {
      const scriptSrc = `https://howlongtobeat.com/${script}`;
      try {
        const scriptRes = await fetch(scriptSrc, { headers: { "User-Agent": userAgent } });
        if (scriptRes.ok) {
          const scriptText = await scriptRes.text();
          // Look for fetch call with POST to find base endpoint (e.g. /api/search or /api/find)
          const match = scriptText.match(/fetch\s*\(\s*["']\/api\/([a-zA-Z0-9_/]+)[^"']*["']\s*,\s*\{[^}]*method:\s*["']POST["'][^}]*\}/i);
          if (match && match[1]) {
            let basePath = match[1];
            if (basePath.includes('/')) basePath = basePath.split('/')[0];
            endpointBasePath = `/api/${basePath}`;
            break;
          }
        }
      } catch (err) {
        // ignore individual script fetch errors
      }
    }
    
    // Fallback if not found inside scripts
    if (!endpointBasePath) {
      endpointBasePath = "/api/find"; // current as of mid-test
    }
    
    // 2. Fetch the auth token using the /init endpoint
    const initUrl = `https://howlongtobeat.com${endpointBasePath}/init?t=${Date.now()}`;
    const initRes = await fetch(initUrl, { 
      headers: { "User-Agent": userAgent, "Referer": "https://howlongtobeat.com/" } 
    });
    
    if (!initRes.ok) throw new Error(`Failed to fetch init token, status: ${initRes.status}`);
    const initData = await initRes.json();
    
    const token = initData.token;
    let hpKey = "";
    let hpVal = "";
    
    // Extract dynamic payload keys just like python scraper
    for (const key of Object.keys(initData)) {
      if (key.toLowerCase().includes("key")) hpKey = initData[key];
      else if (key.toLowerCase().includes("val")) hpVal = initData[key];
    }
    
    if (!token || !hpKey || !hpVal) {
      throw new Error("Missing auth params from init payload");
    }
    
    // 3. Perform the actual search request
    const url = `https://howlongtobeat.com${endpointBasePath}`;
    const payload: any = {
      searchType: "games",
      searchTerms: query.split(" "),
      searchPage: 1,
      size: 20,
      searchOptions: {
        games: {
          userId: 0,
          platform: "",
          sortCategory: "popular",
          rangeCategory: "main",
          rangeTime: { min: 0, max: 0 },
          gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
          rangeYear: { max: "", min: "" },
          modifier: ""
        },
        users: { sortCategory: "postcount" },
        lists: { sortCategory: "follows" },
        filter: "",
        sort: 0,
        randomizer: 0
      },
      useCache: true
    };
    
    // Inject the dynamic key-value
    payload[hpKey] = hpVal;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": userAgent,
        "Referer": "https://howlongtobeat.com/",
        "Origin": "https://howlongtobeat.com",
        "x-auth-token": token,
        "x-hp-key": hpKey,
        "x-hp-val": hpVal
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`HLTB API status error: ${response.status} at ${url}`);
      return [];
    }

    const json = await response.json();
    if (!json || !json.data) return [];

    return json.data.map((item: any) => ({
      gameplayMain: Math.round(item.comp_main / 3600),
      gameplayMainExtra: Math.round(item.comp_plus / 3600),
      gameplayCompletionist: Math.round(item.comp_100 / 3600),
      gameName: item.game_name,
      gameId: item.game_id
    }));
  } catch (err) {
    console.error("HLTB search failed:", err);
    return [];
  }
}

export { hltbSearch };
