import fetch from 'node-fetch';

async function check() {
  const payload = {
    filters: ["search", "=", "Steins;Gate"],
    fields: "title, image.url, description, rating, developers.name, length_minutes, released, tags.name, tags.category",
    results: 1
  };
  
  const r = await fetch('https://api.vndb.org/kana/vn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await r.json();
  console.log(JSON.stringify(data, null, 2));
}
check();
