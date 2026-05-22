import fs from 'fs';

const GAMING_QUOTES = [
  "Look behind you, a three-headed monkey!", "You fight like a dairy farmer!", "How appropriate. You fight like a cow!", // The Secret of Monkey Island
  "Juffo-Wup fills in my omissions.", "Launch fighters!", // Star Control II
  "Did you see my flag?", "Fleas!", // Plok
  "Megalomania.", "Those who rely on the power of another...", // Live A Live
  "Resurrect the world.", "A small bird brought a message.", // Terranigma
  "Blood geysers.", "Vandalier.", // Vandal Hearts
  "Beans, beans, the musical fruit.", "Willie Trombone!", // Skullmonkeys
  "Minku!", "Lumina!", // Brave Fencer Musashi
  "Ulukai.", "Gond.", // Outcast
  "David Bowie is everywhere.", "Transfer your soul.", // Omikron: The Nomad Soul
  "Reinforcements? I am the reinforcements.", "The blood is the life.", // Vagrant Story
  "Moons give me strength!", "Vyse the Legend.", // Skies of Arcadia
  "Meccaryns.", "Kabuto smash!", // Giants: Citizen Kabuto
  "Volcano!", "Harpoon!", "Gust of Wind Dance!", // The Legend of Dragoon
  "Fatty Fargo.", "Sly Boots.", // Anachronox
  "Eriko!", "The horror park.", // Illbleed
  "Judgment Ring.", "Malice.", // Shadow Hearts
  "Show me your wares.", "For Innos!", // Gothic II
  "For the rebellion!", "Plumber.", // Freedom Fighters
  "Propaganda!", "Carlson & Peeters.", // Beyond Good & Evil
  "Mummy platforming.", "Blade of Osiris.", // Sphinx and the Cursed Mummy
  "Derrick Cole.", "First-person eating.", // Breakdown
  "The dark... are you afraid of the dark?", "Get him a surgeon.", // The Chronicles of Riddick: Escape from Butcher Bay
  "I am the milkman. My milk is delicious.", "Lungfishopolis.", // Psychonauts
  "In the name of Harman.", "Heaven Smile.", // Killer7
  "Brains!", "Maggie Monday.", // Stubbs the Zombie in Rebel Without a Pulse
  "Rau and Kuzo.", "Stealth kills.", // The Mark of Kri
  "May God have mercy on your soul.", "Reverend Ray.", // Call of Juarez
  "Kyle Hyde.", "Red Crown.", // Hotel Dusk: Room 215
  "Armlet power.", "For France!", // Jeanne d'Arc
  "Zetta slow!", "So zetta slow!", "Calling!", // The World Ends with You
  "A Thousand Years of Dreams.", "Kaim Argonar.", // Lost Odyssey
  "Faith.", "Runner vision.", // Mirror's Edge
  "Isn't that right, Zach?", "F K... in the coffee.", // Deadly Premonition
  "Monkey and Trip.", "Pigsy.", // Enslaved: Odyssey to the West
  "Time Manipulation Device.", "Barisov.", // Singularity
  "Orphans.", "A Steven Heck of a time.", // Alpha Protocol
  "Sean Devlin.", "Color returns.", // The Saboteur
  "Sissel.", "Missile!", // Ghost Trick: Phantom Detective
  "Are you sure that's enough armor?", "No, I want the best.", // El Shaddai: Ascension of the Metatron
  "Big Bo.", "Scrapheads.", // Binary Domain
  "Do you feel like a hero yet?", "White phosphorus.", // Spec Ops: The Line
  "A man who never eats pork buns is never a whole man!", "Wei Shen.", // Sleeping Dogs
  "Burst!", "Six-Armed Vajra Asura.", // Asura's Wrath
  "Nilin.", "Memory remix.", // Remember Me
  "Kutaro.", "Moon Bear King.", // Puppeteer
  "Bigby.", "Glass him.", // The Wolf Among Us
  "Emile.", "Walt.", // Valiant Hearts: The Great War
  "Awesomepocalypse.", "Overcharge.", // Sunset Overdrive
  "Coin flip.", "Simon, are you there?", // SOMA
  "Hannah.", "Eve.", // Her Story
  "Witness me!", "Chumbucket.", // Mad Max
  "Broadside combat.", // Rebel Galaxy
  "The Jailer is the key.", "A flawless parry.", // Furi
  "Fatebinder.", "Kyros.", // Tyranny
  "Time is power.", "Jack Joyce.", // Quantum Break
  "Leave. Possible.", "Sunken.", // Oxenfree
  "Not a Mimic.", "Morgan Yu.", // Prey
  "What remains.", "Gregory's bath.", // What Remains of Edith Finch
  "Groundhog day murder.", "Marquis.", // The Sexy Brutale
  "Lea!", "Hi!", // CrossCode
  "Jonathan Reid.", "This is my blood.", // Vampyr
  "Captain Robert Witterel.", "Fate of the crew.", // Return of the Obra Dinn
  "Grandpa Nonno.", "Gardening.", // Mutazione
  "Granny Hazel.", "Squisherz.", // Hypnospace Outlaw
  "There's more to explore here.", "End of the universe.", // Outer Wilds
  "Lady Love Dies.", "Blood Drop.", // Paradise Killer
  "Too fast, too soon.", "Stoat.", // Inscryption
  "The Golden Rule.", "Many shall suffer for the sins of the one.", // The Forgotten City
  "Where does this go?", "Pig plushie.", // Unpacking
  "A Colorful Tale.", "Brush wielding.", // Chicory: A Colorful Tale
  "CEO mindset.", "Flesh automaton.", // Cruelty Squad
  "Wake up, sleeper.", "Cycles.", // Citizen Sleeper
  "Remember our promise.", "LSTR.", // Signalis
  "Andreas Maler.", "Tassing.", // Pentiment
  "Marissa Marcel.", "Moviola.", // Immortality
  "Louisiana swamp.", "Million.", // Norco
  "Fox with a sword.", "Holy Cross.", "Golden Path.", // Tunic
  "Sky Armor.", "Glenn.", // Chained Echoes
  "The idol's power.", "Cloudsley.", // Case of the Golden Idol
  "Starch Kola.", "Fingerprints.", // Shadows of Doubt
  "Chai.", "Feel the beat!", // Hi-Fi Rush
  "You're on a path in the woods.", "Slay the Princess.", // Slay the Princess
  "Slow-mo stake.", "James Savage.", // El Paso, Elsewhere
  "Perspective shifts.", "Photo magic.", // Viewfinder
  "Chain hook.", "Mari.", // Sanabi
  "Peppino Spaghetti.", "It's pizza time!", // Pizza Tower
  "Aberrations.", "The Marrows.", // Dredge
  "Zale and Valere.", "Solstice Warriors.", // Sea of Stars
  "The Ballast.", "Climbing the tower.", // Jusant
  "Dead or alive, you're coming with me.", "Directive 4.", // RoboCop: Rogue City
  "The Remnant.", "Olympic Exclusion Zone.", // Pacific Drive
  "B.B. Wand.", "Disc.", // Animal Well
  "Nope!", "Mult.", "Gros Michel.", // Balatro
  "Mara Forest.", "Edward Crow.", // Crow Country
  "Yi.", "Apeman.", // Nine Sols
  "Red and Antea.", "Life to the living, death to the dead.", // Banishers: Ghosts of New Eden
  "Caz McLeary.", "The Beira D.", // Still Wakes the Deep
  "Defenestration.", "Zan.", // Tactical Breach Wizards
  "Campanella.", "Baromaze.", // UFO 50
  "Curly.", "Jimmy." // Mouthwashing
];

const flavorTextsFile = './src/lib/flavorTexts.ts';
let content = fs.readFileSync(flavorTextsFile, 'utf-8');

const match = content.match(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = (\{[\s\S]*?\});\n\nexport function/);
const objStr = match![1];
const data = eval('(' + objStr + ')');

let gameArr = data['Game'] || [];

const fileData = fs.readFileSync('./quotes3.ts', 'utf-8');
const lines = fileData.split('\n');

for (const quote of GAMING_QUOTES) {
  // Find source in the lines
  let sourceStr = "Unknown";
  for (const line of lines) {
    if (line.includes('//') && line.includes(quote)) {
      sourceStr = line.split('//')[1].trim();
      break;
    }
  }
  
  // Check if we already have this quote
  const exists = gameArr.some((entry: any) => {
    if (typeof entry === 'string') return entry === quote;
    return entry.quote === quote;
  });
  
  if (!exists) {
    gameArr.push({ quote, source: sourceStr });
  }
}

data['Game'] = gameArr;

const exportString = `export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry[]> = ${JSON.stringify(data, null, 2)};`;
content = content.replace(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = \{[\s\S]*?\};\n/, exportString + '\n');
fs.writeFileSync(flavorTextsFile, content);

console.log("Appended game quotes with sources!");
