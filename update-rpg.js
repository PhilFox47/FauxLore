import fs from 'fs';
const path = 'src/lib/rpgSystem.ts';
let code = fs.readFileSync(path, 'utf8');
code = code.replace(/getQTarget\(([^,]+),\s*([^,]+),\s*([^,]+),\s*settings\)/g, "getQTarget($1, $2, $3, settings, typeof rng !== 'undefined' ? rng : undefined)");
code = code.replace(/export function getQTarget\([^)]+\) {/g, "export function getQTarget(title: string, timeframe: 'monthly' | 'weekly', def: number, settings: any, rng?: () => number) {");
fs.writeFileSync(path, code);
