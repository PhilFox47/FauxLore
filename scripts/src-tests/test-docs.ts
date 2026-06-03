import fetch from 'node-fetch';

async function run() {
  const r = await fetch('https://docs.hardcover.app/api/getting-started/');
  const text = await r.text();
  console.log(text.substring(0, 1000));
}
run();
