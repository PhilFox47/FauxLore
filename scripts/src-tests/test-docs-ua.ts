import fetch from 'node-fetch';

async function fetchDocs() {
  const r = await fetch('https://docs.hardcover.app/api/getting-started/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    }
  });
  console.log(r.status);
  const text = await r.text();
  console.log(text.substring(0, 1500));
}
fetchDocs();
