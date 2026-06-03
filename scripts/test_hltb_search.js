async function searchHltb() {
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36";
  
  // 1. Get auth token
  let token = "", hpKey = "", hpVal = "";
  const initRes = await fetch("https://howlongtobeat.com/api/find/init?t=" + Date.now(), { 
    headers: { "User-Agent": userAgent, "Referer": "https://howlongtobeat.com/" } 
  });
  const data = await initRes.json();
  token = data.token;
  hpKey = data.hpKey;
  hpVal = data.hpVal;

  console.log("Token:", token.substring(0, 10));
  
  // 2. Perform search
  const url = `https://howlongtobeat.com/api/find`;
  const payload = {
    searchType: "games",
    searchTerms: ["elden", "ring"],
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
  payload[hpKey] = hpVal; // append dynamic key to payload

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

  console.log("Status:", response.status);
  const text = await response.text();
  console.log("Body:", text.substring(0, 300));
}
searchHltb();
