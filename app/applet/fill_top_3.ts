import fs from 'fs';

const GAMING_QUOTES = [
  // Minecraft
  { quote: "Creeper? Aww man.", source: "Minecraft" },
  { quote: "Never dig straight down.", source: "Minecraft" },
  { quote: "Diamonds!", source: "Minecraft" },
  // The Elder Scrolls V: Skyrim
  { quote: "I used to be an adventurer like you, then I took an arrow in the knee.", source: "The Elder Scrolls V: Skyrim" },
  { quote: "FUS RO DAH!", source: "The Elder Scrolls V: Skyrim" },
  { quote: "Do you get to the Cloud District very often?", source: "The Elder Scrolls V: Skyrim" },
  { quote: "Hey, you. You're finally awake.", source: "The Elder Scrolls V: Skyrim" },
  // Dark Souls
  { quote: "Praise the sun!", source: "Dark Souls" },
  { quote: "Git gud.", source: "Dark Souls" },
  { quote: "Amazing chest ahead.", source: "Dark Souls" },
  { quote: "Try jumping.", source: "Dark Souls" },
  // Portal 2
  { quote: "I am a potato.", source: "Portal 2" },
  { quote: "When life gives you lemons, don't make lemonade.", source: "Portal 2" },
  { quote: "SPAAAAACE!", source: "Portal 2" },
  { quote: "The cake is still a lie.", source: "Portal 2" },
  // Batman: Arkham City
  { quote: "Protocol 10 will commence in X hours.", source: "Batman: Arkham City" },
  { quote: "It's what you taught me. Do the right thing.", source: "Batman: Arkham City" },
  { quote: "I'm Batman.", source: "Batman: Arkham City" },
  // Journey
  { quote: "Chirp.", source: "Journey" },
  { quote: "Walking in the snow.", source: "Journey" },
  { quote: "Long scarf magic.", source: "Journey" },
  // Hotline Miami
  { quote: "Do you like hurting other people?", source: "Hotline Miami" },
  { quote: "Gotta get a grip!", source: "Hotline Miami" },
  { quote: "Richard mask.", source: "Hotline Miami" },
  // Grand Theft Auto V
  { quote: "Yee-yee ass haircut.", source: "Grand Theft Auto V" },
  { quote: "Wasted.", source: "Grand Theft Auto V" },
  { quote: "Trevor Philips Industries.", source: "Grand Theft Auto V" },
  // The Last of Us
  { quote: "Endure and survive.", source: "The Last of Us" },
  { quote: "Swear to me.", source: "The Last of Us" },
  { quote: "Clickers.", source: "The Last of Us" },
  // BioShock Infinite
  { quote: "Bring us the girl, and wipe away the debt.", source: "BioShock Infinite" },
  { quote: "He doesn't row.", source: "BioShock Infinite" },
  { quote: "Booker, catch!", source: "BioShock Infinite" },
  // Bloodborne
  { quote: "A hunter is a hunter, even in a dream.", source: "Bloodborne" },
  { quote: "Fear the old blood.", source: "Bloodborne" },
  { quote: "Grant us eyes.", source: "Bloodborne" },
  // The Witcher 3: Wild Hunt
  { quote: "Wind's howling.", source: "The Witcher 3: Wild Hunt" },
  { quote: "How about a round of Gwent?", source: "The Witcher 3: Wild Hunt" },
  { quote: "Pam pa ram, pam pam pa ram.", source: "The Witcher 3: Wild Hunt" },
  // Undertale
  { quote: "You're gonna have a bad time.", source: "Undertale" },
  { quote: "Despite everything, it's still you.", source: "Undertale" },
  { quote: "It fills you with determination.", source: "Undertale" },
  // Overwatch
  { quote: "I need healing!", source: "Overwatch" },
  { quote: "Nerf this!", source: "Overwatch" },
  { quote: "Ryu ga waga teki wo kurau!", source: "Overwatch" },
  { quote: "It's high noon.", source: "Overwatch" },
  // Inside
  { quote: "The blob.", source: "Inside" },
  { quote: "Mind-control helmets.", source: "Inside" },
  { quote: "Submarine jumps.", source: "Inside" },
  // Stardew Valley
  { quote: "Abigail eats quartz.", source: "Stardew Valley" },
  { quote: "Grandpa's bed.", source: "Stardew Valley" },
  { quote: "Prismatic Shard.", source: "Stardew Valley" },
  // Doom (2016)
  { quote: "Rip and tear, until it is done.", source: "Doom" },
  { quote: "BFG 9000.", source: "Doom" },
  { quote: "Mick Gordon intensifies.", source: "Doom" },
  // The Legend of Zelda: Breath of the Wild
  { quote: "Yahaha! You found me!", source: "The Legend of Zelda: Breath of the Wild" },
  { quote: "Durian farming.", source: "The Legend of Zelda: Breath of the Wild" },
  { quote: "Mipha's Grace is ready.", source: "The Legend of Zelda: Breath of the Wild" },
  // NieR: Automata
  { quote: "This cannot continue.", source: "NieR: Automata" },
  { quote: "Become as Gods.", source: "NieR: Automata" },
  { quote: "Glory to mankind.", source: "NieR: Automata" },
  // Hollow Knight
  { quote: "Bapanada.", source: "Hollow Knight" },
  { quote: "Git gud!", source: "Hollow Knight" },
  { quote: "SHAW!", source: "Hollow Knight" },
  { quote: "No mind to think.", source: "Hollow Knight" },
  // God of War (2018)
  { quote: "Boy.", source: "God of War" },
  { quote: "Read it, boy.", source: "God of War" },
  { quote: "We must be better.", source: "God of War" },
  // Red Dead Redemption 2
  { quote: "I have a plan, Arthur!", source: "Red Dead Redemption 2" },
  { quote: "Tahiti!", source: "Red Dead Redemption 2" },
  { quote: "LENNY!", source: "Red Dead Redemption 2" },
  { quote: "Mangoes.", source: "Red Dead Redemption 2" },
  // Disco Elysium
  { quote: "Mr. Evrart is helping me find my gun.", source: "Disco Elysium" },
  { quote: "I am a feminist.", source: "Disco Elysium" },
  { quote: "Hobocop.", source: "Disco Elysium" },
  { quote: "HARDCORE TO THE MEGA!", source: "Disco Elysium" },
  // Hades
  { quote: "There is no escape.", source: "Hades" },
  { quote: "Blood and darkness!", source: "Hades" },
  { quote: "Bouldy believes in you.", source: "Hades" },
  // Elden Ring
  { quote: "Maidenless.", source: "Elden Ring" },
  { quote: "Try fingers, but hole.", source: "Elden Ring" },
  { quote: "Let me solo her.", source: "Elden Ring" },
  { quote: "Put these foolish ambitions to rest.", source: "Elden Ring" },
  // Baldur's Gate 3
  { quote: "I am a romance option.", source: "Baldur's Gate 3" },
  { quote: "Authority.", source: "Baldur's Gate 3" },
  { quote: "I can fix him.", source: "Baldur's Gate 3" },
  { quote: "Ignis!", source: "Baldur's Gate 3" },
  { quote: "Chk!", source: "Baldur's Gate 3" },
  { quote: "Astarion approves.", source: "Baldur's Gate 3" }
];

const fs_module = await import('fs');
const content = fs_module.readFileSync('./src/lib/flavorTexts.ts', 'utf8');
const match = content.match(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = (\{[\s\S]*?\});\n\nexport function/);
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

const exportString = `export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry[]> = ${JSON.stringify(obj, null, 2)};`;
const newContent = content.replace(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = \{[\s\S]*?\};\n/, exportString + '\n');
fs_module.writeFileSync('./src/lib/flavorTexts.ts', newContent);
console.log("Written part 3!");
