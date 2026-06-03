import fetch from 'node-fetch';

async function test() {
  const query = `
    query searchBooks($title: String!) {
      books(where: {title: {_eq: $title}}, limit: 5) {
        id
        title
      }
    }
  `;

  console.log("Without Auth");
  let res = await fetch('https://api.hardcover.app/v1/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ __typename }' })
  });

  const data = await res.json();
  console.log(data);
}

test().catch(console.error);
