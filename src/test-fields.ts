import fetch from 'node-fetch';

async function check() {
  const r = await fetch('http://localhost:3000/api/books/introspect', {
    method: 'GET'
  });
  const data = await r.json();
  const fields = data.data?.__type?.fields || [];
  console.log(JSON.stringify(fields, null, 2));
}
check();
