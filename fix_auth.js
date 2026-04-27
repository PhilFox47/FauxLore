const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

code = code.replace(/const actingUserId = getAuthUser\(req\);/g, "const actingUserId = getAuthUser(req, res);\n      if (!actingUserId) return;");
code = code.replace(/const actingUserId = getAuthUser\(req\) as string;/g, "const actingUserId = getAuthUser(req, res) as string;\n      if (!actingUserId) return;");

code = code.replace(/const userId = getAuthUser\(req\);/g, "const userId = getAuthUser(req, res);\n      if (!userId) return;");
code = code.replace(/const userId = getAuthUser\(req\) as string;/g, "const userId = getAuthUser(req, res) as string;\n      if (!userId) return;");

fs.writeFileSync('server.ts', code);
