async function run() {
  const ts = Date.now();
  const res = await fetch(`https://howlongtobeat.com/api/s/init?t=${ts}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://howlongtobeat.com/"
    }
  });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Body:", text);
}
run();
