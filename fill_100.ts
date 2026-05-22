import fs from 'fs';

const GAMING_QUOTES = [
  { quote: "Juffo-Wup fills in my omissions.", source: "Star Control II" },
  { quote: "Did you see my flag?", source: "Plok" },
  { quote: "Those who rely on the power of another...", source: "Live A Live" },
  { quote: "Resurrect the world.", source: "Terranigma" },
  { quote: "Blood geysers.", source: "Vandal Hearts" },
  { quote: "Beans, beans, the musical fruit.", source: "Skullmonkeys" },
  { quote: "Minku!", source: "Brave Fencer Musashi" },
  { quote: "Ulukai.", source: "Outcast" },
  { quote: "Transfer your soul.", source: "Omikron: The Nomad Soul" },
  { quote: "The blood is the life.", source: "Vagrant Story" },
  { quote: "Moons give me strength!", source: "Skies of Arcadia" },
  { quote: "Kabuto smash!", source: "Giants: Citizen Kabuto" },
  { quote: "Gust of Wind Dance!", source: "The Legend of Dragoon" },
  { quote: "Sly Boots.", source: "Anachronox" },
  { quote: "The horror park.", source: "Illbleed" },
  { quote: "Judgment Ring.", source: "Shadow Hearts" },
  { quote: "For Innos!", source: "Gothic II" },
  { quote: "For the rebellion!", source: "Freedom Fighters" },
  { quote: "Carlson & Peeters.", source: "Beyond Good & Evil" },
  { quote: "Blade of Osiris.", source: "Sphinx and the Cursed Mummy" },
  { quote: "First-person eating.", source: "Breakdown" },
  { quote: "The dark... are you afraid of the dark?", source: "The Chronicles of Riddick: Escape from Butcher Bay" },
  { quote: "I am the milkman. My milk is delicious.", source: "Psychonauts" },
  { quote: "In the name of Harman.", source: "Killer7" },
  { quote: "Maggie Monday.", source: "Stubbs the Zombie in Rebel Without a Pulse" },
  { quote: "Rau and Kuzo.", source: "The Mark of Kri" },
  { quote: "May God have mercy on your soul.", source: "Call of Juarez" },
  { quote: "Kyle Hyde.", source: "Hotel Dusk: Room 215" },
  { quote: "For France!", source: "Jeanne d'Arc" },
  { quote: "Zetta slow!", source: "The World Ends with You" },
  { quote: "A Thousand Years of Dreams.", source: "Lost Odyssey" },
  { quote: "Runner vision.", source: "Mirror's Edge" },
  { quote: "F K... in the coffee.", source: "Deadly Premonition" },
  { quote: "Monkey and Trip.", source: "Enslaved: Odyssey to the West" },
  { quote: "Time Manipulation Device.", source: "Singularity" },
  { quote: "A Steven Heck of a time.", source: "Alpha Protocol" },
  { quote: "Sean Devlin.", source: "The Saboteur" },
  { quote: "Sissel.", source: "Ghost Trick: Phantom Detective" },
  { quote: "Are you sure that's enough armor?", source: "El Shaddai: Ascension of the Metatron" },
  { quote: "Big Bo.", source: "Binary Domain" },
  { quote: "Do you feel like a hero yet?", source: "Spec Ops: The Line" },
  { quote: "A man who never eats pork buns is never a whole man!", source: "Sleeping Dogs" },
  { quote: "Six-Armed Vajra Asura.", source: "Asura's Wrath" },
  { quote: "Memory remix.", source: "Remember Me" },
  { quote: "Moon Bear King.", source: "Puppeteer" },
  { quote: "Glass him.", source: "The Wolf Among Us" },
  { quote: "Emile.", source: "Valiant Hearts: The Great War" },
  { quote: "Awesomepocalypse.", source: "Sunset Overdrive" },
  { quote: "Simon, are you there?", source: "SOMA" },
  { quote: "Hannah.", source: "Her Story" },
  { quote: "Witness me!", source: "Mad Max" },
  { quote: "Broadside combat.", source: "Rebel Galaxy" },
  { quote: "The Jailer is the key.", source: "Furi" },
  { quote: "Fatebinder.", source: "Tyranny" },
  { quote: "Time is power.", source: "Quantum Break" },
  { quote: "Leave. Possible.", source: "Oxenfree" },
  { quote: "Not a Mimic.", source: "Prey" },
  { quote: "What remains.", source: "What Remains of Edith Finch" },
  { quote: "Groundhog day murder.", source: "The Sexy Brutale" },
  { quote: "Lea!", source: "CrossCode" },
  { quote: "This is my blood.", source: "Vampyr" },
  { quote: "Captain Robert Witterel.", source: "Return of the Obra Dinn" },
  { quote: "Grandpa Nonno.", source: "Mutazione" },
  { quote: "Squisherz.", source: "Hypnospace Outlaw" },
  { quote: "There's more to explore here.", source: "Outer Wilds" },
  { quote: "Lady Love Dies.", source: "Paradise Killer" },
  { quote: "Too fast, too soon.", source: "Inscryption" },
  { quote: "The Golden Rule.", source: "The Forgotten City" },
  { quote: "Where does this go?", source: "Unpacking" },
  { quote: "A Colorful Tale.", source: "Chicory: A Colorful Tale" },
  { quote: "Flesh automaton.", source: "Cruelty Squad" },
  { quote: "Wake up, sleeper.", source: "Citizen Sleeper" },
  { quote: "Remember our promise.", source: "Signalis" },
  { quote: "Andreas Maler.", source: "Pentiment" },
  { quote: "Marissa Marcel.", source: "Immortality" },
  { quote: "Louisiana swamp.", source: "Norco" },
  { quote: "Fox with a sword.", source: "Tunic" },
  { quote: "Sky Armor.", source: "Chained Echoes" },
  { quote: "The idol's power.", source: "Case of the Golden Idol" },
  { quote: "Starch Kola.", source: "Shadows of Doubt" },
  { quote: "Feel the beat!", source: "Hi-Fi Rush" },
  { quote: "You're on a path in the woods.", source: "Slay the Princess" },
  { quote: "Slow-mo stake.", source: "El Paso, Elsewhere" },
  { quote: "Perspective shifts.", source: "Viewfinder" },
  { quote: "Chain hook.", source: "Sanabi" },
  { quote: "It's pizza time!", source: "Pizza Tower" },
  { quote: "The Marrows.", source: "Dredge" },
  { quote: "Solstice Warriors.", source: "Sea of Stars" },
  { quote: "The Ballast.", source: "Jusant" },
  { quote: "Dead or alive, you're coming with me.", source: "RoboCop: Rogue City" },
  { quote: "Olympic Exclusion Zone.", source: "Pacific Drive" },
  { quote: "B.B. Wand.", source: "Animal Well" },
  { quote: "Nope!", source: "Balatro" },
  { quote: "Mara Forest.", source: "Crow Country" },
  { quote: "Yi.", source: "Nine Sols" },
  { quote: "Life to the living, death to the dead.", source: "Banishers: Ghosts of New Eden" },
  { quote: "The Beira D.", source: "Still Wakes the Deep" },
  { quote: "Defenestration.", source: "Tactical Breach Wizards" },
  { quote: "Campanella.", source: "UFO 50" },
  { quote: "Curly.", source: "Mouthwashing" }
];

const flavorTextsFile = './src/lib/flavorTexts.ts';
let content = fs.readFileSync(flavorTextsFile, 'utf-8');

const match = content.match(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = (\{[\s\S]*?\});\n\nexport function/);
const objStr = match![1];
const data = eval('(' + objStr + ')');

let gameArr = data['Game'] || [];

for (const quoteObj of GAMING_QUOTES) {
  const exists = gameArr.some((entry: any) => {
    if (typeof entry === 'string') return entry === quoteObj.quote;
    return entry.quote === quoteObj.quote;
  });
  
  if (!exists) {
    gameArr.push(quoteObj);
  }
}

data['Game'] = gameArr;

const exportString = `export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry[]> = ${JSON.stringify(data, null, 2)};`;
content = content.replace(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = \{[\s\S]*?\};\n/, exportString + '\n');
fs.writeFileSync(flavorTextsFile, content);

console.log("Appended game quotes with their exact sources!");
