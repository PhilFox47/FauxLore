import fs from "fs";

const GAMING_QUOTES = [
  "Juffo-Wup fills in my omissions.", "Launch fighters!", // Star Control II
  "Did you see my flag?", "Fleas!", // Plok
  "Megalomania.", "Those who rely on the power of another...", // Live A Live
  "Resurrect the world.", "A small bird brought a message.", // Terranigma
  "Blood geysers.", "Vandalier.", // Vandal Hearts
  "Beans, beans, the musical fruit.", "Willie Trombone!", // Skullmonkeys
  "Minku!", "Lumina!", // Brave Fencer Musashi
  "Ulukai.", "Gond.", // Outcast
  "David Bowie is everywhere.", "Transfer your soul.", // Omikron The Nomad Soul
  "Reinforcements? I am the reinforcements.", "The blood is the life.", // Vagrant Story
  "Moons give me strength!", "Vyse the Legend.", // Skies of Arcadia
  "Meccaryns.", "Kabuto smash!", // Giants Citizen Kabuto
  "Volcano!", "Harpoon!", "Gust of Wind Dance!", // The Legend of Dragoon
  "Fatty Fargo.", "Sly Boots.", // Anachronox
  "Eriko!", "The horror park.", // Illbleed
  "Judgment Ring.", "Malice.", // Shadow Hearts
  "Show me your wares.", "For Innos!", // Gothic II
  "For the rebellion!", "Plumber.", // Freedom Fighters
  "Propaganda!", "Carlson & Peeters.", // Beyond Good & Evil
  "Mummy platforming.", "Blade of Osiris.", // Sphinx and the Cursed Mummy
  "Derrick Cole.", "First-person eating.", // Breakdown
  "The dark... are you afraid of the dark?", "Get him a surgeon.", // Riddick
  "I am the milkman. My milk is delicious.", "Lungfishopolis.", // Psychonauts
  "In the name of Harman.", "Heaven Smile.", // Killer7
  "Brains!", "Maggie Monday.", // Stubbs the Zombie
  "Rau and Kuzo.", "Stealth kills.", // Mark of Kri
  "May God have mercy on your soul.", "Reverend Ray.", // Call of Juarez
  "Kyle Hyde.", "Red Crown.", // Hotel Dusk
  "Armlet power.", "For France!", // Jeanne d'Arc
  "Zetta slow!", "So zetta slow!", "Calling!", // TWEWY
  "A Thousand Years of Dreams.", "Kaim Argonar.", // Lost Odyssey
  "Faith.", "Runner vision.", // Mirror's Edge
  "Isn't that right, Zach?", "F K... in the coffee.", // Deadly Premonition
  "Monkey and Trip.", "Pigsy.", // Enslaved
  "Time Manipulation Device.", "Barisov.", // Singularity
  "Orphans.", "A Steven Heck of a time.", // Alpha Protocol
  "Sean Devlin.", "Color returns.", // The Saboteur
  "Sissel.", "Missile!", // Ghost Trick
  "Are you sure that's enough armor?", "No, I want the best.", // El Shaddai
  "Big Bo.", "Scrapheads.", // Binary Domain
  "Do you feel like a hero yet?", "White phosphorus.", // Spec Ops The Line
  "A man who never eats pork buns is never a whole man!", "Wei Shen.", // Sleeping Dogs
  "Burst!", "Six-Armed Vajra Asura.", // Asura's Wrath
  "Nilin.", "Memory remix.", // Remember Me
  "Kutaro.", "Moon Bear King.", // Puppeteer
  "Bigby.", "Glass him.", // The Wolf Among Us
  "Emile.", "Walt.", // Valiant Hearts
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
  "What remains.", "Gregory's bath.", // Edith Finch
  "Groundhog day murder.", "Marquis.", // Sexy Brutale
  "Lea!", "Hi!", // CrossCode
  "Jonathan Reid.", "This is my blood.", // Vampyr
  "Captain Robert Witterel.", "Fate of the crew.", // Obra Dinn
  "Grandpa Nonno.", "Gardening.", // Mutazione
  "Granny Hazel.", "Squisherz.", // Hypnospace Outlaw
  "There's more to explore here.", "End of the universe.", // Outer Wilds
  "Lady Love Dies.", "Blood Drop.", // Paradise Killer
  "Too fast, too soon.", "Stoat.", // Inscryption
  "The Golden Rule.", "Many shall suffer for the sins of the one.", // Forgotten City
  "Where does this go?", "Pig plushie.", // Unpacking
  "A Colorful Tale.", "Brush wielding.", // Chicory
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
  "Slow-mo stake.", "James Savage.", // El Paso Elsewhere
  "Perspective shifts.", "Photo magic.", // Viewfinder
  "Chain hook.", "Mari.", // Sanabi
  "Peppino Spaghetti.", "It's pizza time!", // Pizza Tower
  "Aberrations.", "The Marrows.", // Dredge
  "Zale and Valere.", "Solstice Warriors.", // Sea of Stars
  "The Ballast.", "Climbing the tower.", // Jusant
  "Dead or alive, you're coming with me.", "Directive 4.", // RoboCop
  "The Remnant.", "Olympic Exclusion Zone.", // Pacific Drive
  "B.B. Wand.", "Disc.", // Animal Well
  "Nope!", "Mult.", "Gros Michel.", // Balatro
  "Mara Forest.", "Edward Crow.", // Crow Country
  "Yi.", "Apeman.", // Nine Sols
  "Red and Antea.", "Life to the living, death to the dead.", // Banishers
  "Caz McLeary.", "The Beira D.", // Still Wakes the Deep
  "Defenestration.", "Zan.", // Tactical Breach Wizards
  "Campanella.", "Baromaze.", // UFO 50
  "Curly.", "Jimmy." // Mouthwashing
];

const fileContent = fs.readFileSync("./src/lib/flavorTexts.ts", "utf-8");
const jsonStr = fileContent.match(/export const MEDIA_FLAVOR_TEXTS: Record<string, string\[\]> = (\{[\s\S]*?\});/);
const parsed = JSON.parse(jsonStr[1]);

const existingGames = parsed.Game || [];
const combined = [...existingGames, ...GAMING_QUOTES];
parsed.Game = Array.from(new Set(combined));

const exportString = `export const MEDIA_FLAVOR_TEXTS: Record<string, string[]> = ${JSON.stringify(parsed, null, 2)};\n` +
`\nexport function getRandomFlavorText(type: string): string {\n  if (!type || !MEDIA_FLAVOR_TEXTS[type] || MEDIA_FLAVOR_TEXTS[type].length === 0) {\n    return 'A classic masterpiece.';\n  }\n  const texts = MEDIA_FLAVOR_TEXTS[type];\n  return texts[Math.floor(Math.random() * texts.length)];\n}\n`;

fs.writeFileSync("./src/lib/flavorTexts.ts", exportString);
console.log("Appended game quotes!");
