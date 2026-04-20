import fetch from 'node-fetch';
fetch('https://api.hardcover.app/v1/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'query { __schema { queryType { fields { name } } } }' })
}).then(r => r.json()).then(console.log).catch(console.error);
