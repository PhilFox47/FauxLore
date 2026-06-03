const target = 'https://graphql.anilist.co';
const payload = {
  query: `
    query ($search: String) {
      Page (perPage: 3) {
        media (search: $search, type: MANGA) {
          id
          title { romaji english }
          status
          chapters
          volumes
          tags { name }
        }
      }
    }
  `,
  variables: { search: "One Piece" }
};
fetch(target, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
.then(res => res.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error(err));
