async function scrapeHltb() {
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36";
  const mainPageRes = await fetch("https://howlongtobeat.com/", {
    headers: { "User-Agent": userAgent, "Referer": "https://howlongtobeat.com/" }
  });
  const mainHtml = await mainPageRes.text();
  const scriptRegex = /_next\/static\/chunks\/[^"]+\.js/g;
  const scripts = mainHtml.match(scriptRegex) || [];
  
  console.log(`Found ${scripts.length} chunks`);
  
  let endpoint = null;
  // look at all scripts
  for (const script of scripts) {
    const scriptSrc = `https://howlongtobeat.com/${script}`;
    const scriptRes = await fetch(scriptSrc, { headers: { "User-Agent": userAgent } });
    if (scriptRes.ok) {
      const scriptText = await scriptRes.text();
      const match = scriptText.match(/fetch\s*\(\s*["']\/api\/([a-zA-Z0-9_/]+)[^"']*["']/i);
      if (match && match[1]) {
        let basePath = match[1];
        if (basePath.includes('/')) basePath = basePath.split('/')[0];
        endpoint = `/api/${basePath}`;
        console.log(`Found endpoint: ${endpoint} in ${script}`);
      }
    }
  }

  if (endpoint) {
    const initUrl = `https://howlongtobeat.com${endpoint}/init?t=${Date.now()}`;
    console.log(`Fetching init token from ${initUrl}`);
    const initRes = await fetch(initUrl, { headers: { "User-Agent": userAgent, "Referer": "https://howlongtobeat.com/" } });
    console.log("Status:", initRes.status);
    const initText = await initRes.text();
    console.log("Body:", initText);
  } else {
    console.log("Endpoint not found.");
  }
}
scrapeHltb();
