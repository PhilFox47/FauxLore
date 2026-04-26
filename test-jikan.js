fetch('https://api.jikan.moe/v4/manga?q=One%20piece&limit=1')
.then(res => res.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error(err));
