import fetch from 'node-fetch';

async function check() {
  const r = await fetch('http://localhost:3000/api/books/introspect');
  const text = await r.text();
  console.log("Response:", text);
}
check();
