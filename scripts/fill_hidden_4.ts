import fs from 'fs';

const GAMING_QUOTES = [
  // 76. Norco
  { quote: "Louisiana swamp.", source: "Norco" },
  { quote: "Million.", source: "Norco" },
  { quote: "Southern Gothic point-and-click.", source: "Norco" },
  // 77. Tunic
  { quote: "Fox with a sword.", source: "Tunic" },
  { quote: "Holy Cross.", source: "Tunic" },
  { quote: "Golden Path.", source: "Tunic" },
  // 78. Chained Echoes
  { quote: "Sky Armor.", source: "Chained Echoes" },
  { quote: "Glenn.", source: "Chained Echoes" },
  { quote: "Overdrive meter.", source: "Chained Echoes" },
  // 79. Case of the Golden Idol
  { quote: "The idol's power.", source: "Case of the Golden Idol" },
  { quote: "Cloudsley.", source: "Case of the Golden Idol" },
  { quote: "Filling in the blanks of a murder.", source: "Case of the Golden Idol" },
  // 80. Shadows of Doubt
  { quote: "Starch Kola.", source: "Shadows of Doubt" },
  { quote: "Fingerprints.", source: "Shadows of Doubt" },
  { quote: "Procedural detective work.", source: "Shadows of Doubt" },
  // 81. Hi-Fi Rush
  { quote: "Chai.", source: "Hi-Fi Rush" },
  { quote: "Feel the beat!", source: "Hi-Fi Rush" },
  { quote: "808 the cat.", source: "Hi-Fi Rush" },
  // 82. Slay the Princess
  { quote: "You're on a path in the woods.", source: "Slay the Princess" },
  { quote: "Slay the Princess.", source: "Slay the Princess" },
  { quote: "The Voice of the Hero.", source: "Slay the Princess" },
  // 83. El Paso, Elsewhere
  { quote: "Slow-mo stake.", source: "El Paso, Elsewhere" },
  { quote: "James Savage.", source: "El Paso, Elsewhere" },
  { quote: "Max Payne meets vampires.", source: "El Paso, Elsewhere" },
  // 84. Viewfinder
  { quote: "Perspective shifts.", source: "Viewfinder" },
  { quote: "Photo magic.", source: "Viewfinder" },
  { quote: "Stepping into a polaroid.", source: "Viewfinder" },
  // 85. Sanabi
  { quote: "Chain hook.", source: "Sanabi" },
  { quote: "Mari.", source: "Sanabi" },
  { quote: "Cyberpunk grapple-hook action.", source: "Sanabi" },
  // 86. Pizza Tower
  { quote: "It's pizza time!", source: "Pizza Tower" },
  { quote: "Peppino Spaghetti.", source: "Pizza Tower" },
  { quote: "The anxiety of P-Ranks.", source: "Pizza Tower" },
  // 87. Dredge
  { quote: "Aberrations.", source: "Dredge" },
  { quote: "The Marrows.", source: "Dredge" },
  { quote: "Lovecraftian fishing sim.", source: "Dredge" },
  // 88. Sea of Stars
  { quote: "Zale and Valere.", source: "Sea of Stars" },
  { quote: "Solstice Warriors.", source: "Sea of Stars" },
  { quote: "Garl the warrior cook.", source: "Sea of Stars" },
  // 89. Jusant
  { quote: "The Ballast.", source: "Jusant" },
  { quote: "Climbing the tower.", source: "Jusant" },
  { quote: "Managing stamina on a vertical wall.", source: "Jusant" },
  // 90. RoboCop: Rogue City
  { quote: "Dead or alive, you're coming with me.", source: "RoboCop: Rogue City" },
  { quote: "Directive 4.", source: "RoboCop: Rogue City" },
  { quote: "I'd buy that for a dollar!", source: "RoboCop: Rogue City" },
  // 91. Pacific Drive
  { quote: "The Remnant.", source: "Pacific Drive" },
  { quote: "Olympic Exclusion Zone.", source: "Pacific Drive" },
  { quote: "Kicking your car to fix it.", source: "Pacific Drive" },
  // 92. Animal Well
  { quote: "B.B. Wand.", source: "Animal Well" },
  { quote: "Disc.", source: "Animal Well" },
  { quote: "The rabbits are watching.", source: "Animal Well" },
  // 93. Balatro
  { quote: "Nope!", source: "Balatro" },
  { quote: "Mult.", source: "Balatro" },
  { quote: "Gros Michel.", source: "Balatro" },
  { quote: "The addiction of multiplying scores.", source: "Balatro" },
  // 94. Crow Country
  { quote: "Mara Forest.", source: "Crow Country" },
  { quote: "Edward Crow.", source: "Crow Country" },
  { quote: "PS1 survival horror nostalgia.", source: "Crow Country" },
  // 95. Nine Sols
  { quote: "Yi.", source: "Nine Sols" },
  { quote: "Apeman.", source: "Nine Sols" },
  { quote: "Taopunk Sekiro.", source: "Nine Sols" },
  // 96. Banishers: Ghosts of New Eden
  { quote: "Red and Antea.", source: "Banishers: Ghosts of New Eden" },
  { quote: "Life to the living, death to the dead.", source: "Banishers: Ghosts of New Eden" },
  { quote: "Haunting choices.", source: "Banishers: Ghosts of New Eden" },
  // 97. Still Wakes the Deep
  { quote: "Caz McLeary.", source: "Still Wakes the Deep" },
  { quote: "The Beira D.", source: "Still Wakes the Deep" },
  { quote: "Scottish oil rig terror.", source: "Still Wakes the Deep" },
  // 98. Tactical Breach Wizards
  { quote: "Defenestration.", source: "Tactical Breach Wizards" },
  { quote: "Zan.", source: "Tactical Breach Wizards" },
  { quote: "Pushing enemies out of windows.", source: "Tactical Breach Wizards" },
  // 99. UFO 50
  { quote: "Campanella.", source: "UFO 50" },
  { quote: "Baromaze.", source: "UFO 50" },
  { quote: "50 games in 1 collection.", source: "UFO 50" },
  // 100. Mouthwashing
  { quote: "Curly.", source: "Mouthwashing" },
  { quote: "Jimmy.", source: "Mouthwashing" },
  { quote: "Space freighter psychological horror.", source: "Mouthwashing" }
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
console.log("Written part 4!");
