import fetch from 'node-fetch';

async function check() {
  const query = `
    query {
      books(where: {id: {_eq: 2459845}}, limit: 1) {
        id
        title
        users_count
        taggings {
          tag {
            tag
          }
        }
        cached_tags
      }
    }
  `;
  const r = await fetch('http://localhost:3000/api/books/introspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const data = await r.json();
  console.log(JSON.stringify((data as any).data.books, null, 2));
}
check();
