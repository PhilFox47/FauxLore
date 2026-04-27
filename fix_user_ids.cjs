const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/const userId = req.query.userId \|\| 'default_user';/g, 'const userId = getAuthUser(req);');
code = code.replace(/const userId = item.userId \|\| 'default_user';/g, 'const userId = getAuthUser(req);');
code = code.replace(/const userId = log.userId \|\| 'default_user';/g, 'const userId = getAuthUser(req);');
code = code.replace(/const userId = settings.userId \|\| 'default_user';/g, 'const userId = getAuthUser(req);');
code = code.replace(/const userId = payload.userId \|\| 'default_user';/g, 'const userId = getAuthUser(req);');
code = code.replace(/const userId = artifact.userId \|\| 'default_user';/g, 'const userId = getAuthUser(req);');
code = code.replace(/const userId = req.query.userId as string \|\| 'default_user';/g, 'const userId = getAuthUser(req) as string;');

fs.writeFileSync('server.ts', code);
