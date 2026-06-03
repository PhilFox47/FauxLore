import fs from 'fs';

const GAMING_QUOTES = [
  // 51. Mad Max
  { quote: "Witness me!", source: "Mad Max" },
  { quote: "Chumbucket.", source: "Mad Max" },
  { quote: "The Magnum Opus.", source: "Mad Max" },
  // 52. Rebel Galaxy
  { quote: "Broadside combat.", source: "Rebel Galaxy" },
  { quote: "Space truckers.", source: "Rebel Galaxy" },
  { quote: "Blues-rock in the void of space.", source: "Rebel Galaxy" },
  // 53. Furi
  { quote: "The Jailer is the key.", source: "Furi" },
  { quote: "A flawless parry.", source: "Furi" },
  { quote: "Synthwave boss rush.", source: "Furi" },
  // 54. Tyranny
  { quote: "Fatebinder.", source: "Tyranny" },
  { quote: "Kyros.", source: "Tyranny" },
  { quote: "Sometimes, evil has already won.", source: "Tyranny" },
  // 55. Quantum Break
  { quote: "Time is power.", source: "Quantum Break" },
  { quote: "Jack Joyce.", source: "Quantum Break" },
  { quote: "Wait, is this a TV show or a game?", source: "Quantum Break" },
  // 56. Oxenfree
  { quote: "Leave. Possible.", source: "Oxenfree" },
  { quote: "Sunken.", source: "Oxenfree" },
  { quote: "Tuning the radio to ghost frequencies.", source: "Oxenfree" },
  // 57. Prey (2017)
  { quote: "Not a Mimic.", source: "Prey" },
  { quote: "Morgan Yu.", source: "Prey" },
  { quote: "Why is that coffee cup shaking?", source: "Prey" },
  // 58. What Remains of Edith Finch
  { quote: "What remains.", source: "What Remains of Edith Finch" },
  { quote: "Gregory's bath.", source: "What Remains of Edith Finch" },
  { quote: "The fish factory daydream.", source: "What Remains of Edith Finch" },
  // 59. The Sexy Brutale
  { quote: "Groundhog day murder.", source: "The Sexy Brutale" },
  { quote: "Marquis.", source: "The Sexy Brutale" },
  { quote: "Rewinding the clock.", source: "The Sexy Brutale" },
  // 60. CrossCode
  { quote: "Lea!", source: "CrossCode" },
  { quote: "Hi!", source: "CrossCode" },
  { quote: "The ball physics puzzles...", source: "CrossCode" },
  // 61. Vampyr
  { quote: "This is my blood.", source: "Vampyr" },
  { quote: "Jonathan Reid.", source: "Vampyr" },
  { quote: "To embrace or not to embrace.", source: "Vampyr" },
  // 62. Return of the Obra Dinn
  { quote: "Captain Robert Witterel.", source: "Return of the Obra Dinn" },
  { quote: "Fate of the crew.", source: "Return of the Obra Dinn" },
  { quote: "Crushed by a loose cannon.", source: "Return of the Obra Dinn" },
  // 63. Mutazione
  { quote: "Grandpa Nonno.", source: "Mutazione" },
  { quote: "Gardening.", source: "Mutazione" },
  { quote: "Musical gardens.", source: "Mutazione" },
  // 64. Hypnospace Outlaw
  { quote: "Squisherz.", source: "Hypnospace Outlaw" },
  { quote: "Granny Hazel.", source: "Hypnospace Outlaw" },
  { quote: "Enforcing laws on the late 90s internet.", source: "Hypnospace Outlaw" },
  // 65. Outer Wilds
  { quote: "There's more to explore here.", source: "Outer Wilds" },
  { quote: "End of the universe.", source: "Outer Wilds" },
  { quote: "22 minutes until the sun explodes.", source: "Outer Wilds" },
  // 66. Paradise Killer
  { quote: "Lady Love Dies.", source: "Paradise Killer" },
  { quote: "Blood Drop.", source: "Paradise Killer" },
  { quote: "City Pop vaporwave murder mystery.", source: "Paradise Killer" },
  // 67. Inscryption
  { quote: "Too fast, too soon.", source: "Inscryption" },
  { quote: "Stoat.", source: "Inscryption" },
  { quote: "Sacrifice your friends for power.", source: "Inscryption" },
  // 68. The Forgotten City
  { quote: "The Golden Rule.", source: "The Forgotten City" },
  { quote: "Many shall suffer for the sins of the one.", source: "The Forgotten City" },
  { quote: "Groundhog day in ancient Rome.", source: "The Forgotten City" },
  // 69. Unpacking
  { quote: "Where does this go?", source: "Unpacking" },
  { quote: "Pig plushie.", source: "Unpacking" },
  { quote: "Storytelling through objects.", source: "Unpacking" },
  // 70. Chicory: A Colorful Tale
  { quote: "A Colorful Tale.", source: "Chicory: A Colorful Tale" },
  { quote: "Brush wielding.", source: "Chicory: A Colorful Tale" },
  { quote: "Coloring outside the lines.", source: "Chicory: A Colorful Tale" },
  // 71. Cruelty Squad
  { quote: "CEO mindset.", source: "Cruelty Squad" },
  { quote: "Flesh automaton.", source: "Cruelty Squad" },
  { quote: "Investing in slurp juices.", source: "Cruelty Squad" },
  // 72. Citizen Sleeper
  { quote: "Wake up, sleeper.", source: "Citizen Sleeper" },
  { quote: "Cycles.", source: "Citizen Sleeper" },
  { quote: "Rolling dice to survive capitalism.", source: "Citizen Sleeper" },
  // 73. Signalis
  { quote: "Remember our promise.", source: "Signalis" },
  { quote: "LSTR.", source: "Signalis" },
  { quote: "Six up, six down inventory.", source: "Signalis" },
  // 74. Pentiment
  { quote: "Andreas Maler.", source: "Pentiment" },
  { quote: "Tassing.", source: "Pentiment" },
  { quote: "A medieval tapestry come to life.", source: "Pentiment" },
  // 75. Immortality
  { quote: "Marissa Marcel.", source: "Immortality" },
  { quote: "Moviola.", source: "Immortality" },
  { quote: "Hidden frames.", source: "Immortality" }
];

const fs_module = await import('fs');
const content = fs_module.readFileSync('./src/lib/flavorTexts.ts', 'utf8');
const match = content.match(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\\[\\]> = (\\{[\\s\\S]*?\\});\\n\\nexport function/);
const obj = eval('(' + match[1] + ')');

let gameArr = obj['Game'] || [];

for (const quoteObj of GAMING_QUOTES) {
  const exists = gameArr.some((entry: any) => {
    if (typeof entry === 'string') return entry === quoteObj.quote;
    return entry.quote === quoteObj.quote;
  });
  
  if (!exists) {
    gameArr.push(quoteObj);
  }
}

obj['Game'] = gameArr;

const exportString = \`export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry[]> = \${JSON.stringify(obj, null, 2)};\`;
const newContent = content.replace(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\\[\\]> = \\{[\\s\\S]*?\\};\\n/, exportString + '\\n');
fs_module.writeFileSync('./src/lib/flavorTexts.ts', newContent);
console.log("Written part 3!");
