import fetch from 'node-fetch';

async function introspect() {
  const query = `
    query IntrospectionQuery {
      __schema {
        queryType {
          fields {
            name
            args {
              name
              type {
                name
                kind
                ofType {
                  name
                  kind
                }
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch('https://api.hardcover.app/v1/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });

  const data = await res.json();
  const fields = (data as any).data.__schema.queryType.fields;
  
  // Find fields related to books or search
  const bookQueries = fields.filter((f: any) => f.name.toLowerCase().includes('book') || f.name.toLowerCase().includes('search'));
  console.log(JSON.stringify(bookQueries, null, 2));
}

introspect().catch(console.error);
