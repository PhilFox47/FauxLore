const db = require('better-sqlite3')('database.sqlite');
console.log(db.prepare('SELECT count(*) as c FROM global_taxonomy').get());
