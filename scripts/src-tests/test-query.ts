import fetch from 'node-fetch';

async function check() {
  const query = `
    query {
      books(limit: 1) {
        title
        description
        rating
        taggings {
          tag {
            tag
          }
        }
      }
    }
  `;
  const r = await fetch('http://localhost:3000/api/books/introspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const data = await r.json();
  console.log(JSON.stringify(data, null, 2));
}
check();
