import fs from 'fs';

const GAMING_QUOTES = [
  // Grand Theft Auto: Vice City
  { quote: "Tommy Vercetti... Remember the name!", source: "Grand Theft Auto: Vice City" },
  { quote: "Lance Vance Dance.", source: "Grand Theft Auto: Vice City" },
  { quote: "RC Helicopter mission pain.", source: "Grand Theft Auto: Vice City" },
  // Star Wars: Knights of the Old Republic
  { quote: "Meatbag.", source: "Star Wars: Knights of the Old Republic" },
  { quote: "I am Revan.", source: "Star Wars: Knights of the Old Republic" },
  { quote: "Statement: HK-47 is ready to serve.", source: "Star Wars: Knights of the Old Republic" },
  // World of Warcraft
  { quote: "LEEROY JENKINS!", source: "World of Warcraft" },
  { quote: "More dots!", source: "World of Warcraft" },
  { quote: "Lok'tar Ogar!", source: "World of Warcraft" },
  // Half-Life 2
  { quote: "The right man in the wrong place can make all the difference.", source: "Half-Life 2" },
  { quote: "Pick up that can.", source: "Half-Life 2" },
  { quote: "We don't go to Ravenholm.", source: "Half-Life 2" },
  // Metal Gear Solid 3: Snake Eater
  { quote: "What a thrill...", source: "Metal Gear Solid 3: Snake Eater" },
  { quote: "You're pretty good.", source: "Metal Gear Solid 3: Snake Eater" },
  { quote: "The feeding of the tree frog...", source: "Metal Gear Solid 3: Snake Eater" },
  // Grand Theft Auto: San Andreas
  { quote: "All you had to do was follow the damn train, CJ!", source: "Grand Theft Auto: San Andreas" },
  { quote: "Ah shit, here we go again.", source: "Grand Theft Auto: San Andreas" },
  { quote: "Hot Coffee.", source: "Grand Theft Auto: San Andreas" },
  { quote: "I'll have two number 9s...", source: "Grand Theft Auto: San Andreas" },
  // Halo 2
  { quote: "Sir, finishing this bite.", source: "Halo 2" },
  { quote: "To give the Covenant back their bomb.", source: "Halo 2" },
  { quote: "Super bouncing.", source: "Halo 2" },
  // Resident Evil 4
  { quote: "What're ya buyin?", source: "Resident Evil 4" },
  { quote: "What're ya sellin?", source: "Resident Evil 4" },
  { quote: "Leon, help!", source: "Resident Evil 4" },
  { quote: "No thanks, bro.", source: "Resident Evil 4" },
  // Shadow of the Colossus
  { quote: "Agro!", source: "Shadow of the Colossus" },
  { quote: "Holding R1 for dear life.", source: "Shadow of the Colossus" },
  { quote: "Wander's stamina.", source: "Shadow of the Colossus" },
  // God of War
  { quote: "ARES! Destroy my enemies, and my life is yours!", source: "God of War" },
  { quote: "ZEUS!", source: "God of War" },
  { quote: "Button mashing minigames.", source: "God of War" },
  // Civilization IV
  { quote: "Baba Yetu.", source: "Civilization IV" },
  { quote: "Stack of Doom.", source: "Civilization IV" },
  { quote: "Would you like to make a trade agreement with England?", source: "Civilization IV" },
  // The Elder Scrolls IV: Oblivion
  { quote: "Stop right there, criminal scum!", source: "The Elder Scrolls IV: Oblivion" },
  { quote: "By Azura, by Azura, by Azura!", source: "The Elder Scrolls IV: Oblivion" },
  { quote: "Have you heard of the high elves?", source: "The Elder Scrolls IV: Oblivion" },
  // Wii Sports
  { quote: "Matt is the final boss.", source: "Wii Sports" },
  { quote: "Nice spare.", source: "Wii Sports" },
  { quote: "Broken TV screens.", source: "Wii Sports" },
  // BioShock
  { quote: "Would you kindly?", source: "BioShock" },
  { quote: "No gods or kings. Only man.", source: "BioShock" },
  { quote: "Welcome to Rapture.", source: "BioShock" },
  { quote: "Mr. Bubbles...", source: "BioShock" },
  // Portal
  { quote: "The cake is a lie.", source: "Portal" },
  { quote: "This was a triumph.", source: "Portal" },
  { quote: "I'm making a note here: HUGE SUCCESS.", source: "Portal" },
  { quote: "Companion Cube.", source: "Portal" },
  // Team Fortress 2
  { quote: "Pootis.", source: "Team Fortress 2" },
  { quote: "Spy around here!", source: "Team Fortress 2" },
  { quote: "Professionals have standards.", source: "Team Fortress 2" },
  { quote: "Meet the Medic.", source: "Team Fortress 2" },
  // Call of Duty 4: Modern Warfare
  { quote: "Fifty thousand people used to live here. Now it's a ghost town.", source: "Call of Duty 4: Modern Warfare" },
  { quote: "Mission failed, we'll get 'em next time.", source: "Call of Duty 4: Modern Warfare" },
  { quote: "No Russian. Wait, wrong game.", source: "Call of Duty 4: Modern Warfare" },
  // Super Mario Galaxy
  { quote: "Rosalina.", source: "Super Mario Galaxy" },
  { quote: "Super Guide.", source: "Super Mario Galaxy" },
  { quote: "Motion controls go spin.", source: "Super Mario Galaxy" },
  // Mass Effect
  { quote: "I should go.", source: "Mass Effect" },
  { quote: "I'm Commander Shepard, and this is my favorite store on the Citadel.", source: "Mass Effect" },
  { quote: "Calibrations.", source: "Mass Effect" },
  // Grand Theft Auto IV
  { quote: "Hey cousin, let's go bowling!", source: "Grand Theft Auto IV" },
  { quote: "Yellow car!", source: "Grand Theft Auto IV" },
  { quote: "Niko Bellic.", source: "Grand Theft Auto IV" },
  // Fallout 3
  { quote: "Tunnel Snakes rule!", source: "Fallout 3" },
  { quote: "Democracy is non-negotiable.", source: "Fallout 3" },
  { quote: "Megaton nuke.", source: "Fallout 3" },
  // Left 4 Dead
  { quote: "PILLS HERE!", source: "Left 4 Dead" },
  { quote: "Tank!", source: "Left 4 Dead" },
  { quote: "Grabbin' peels.", source: "Left 4 Dead" },
  // Uncharted 2: Among Thieves
  { quote: "Marco Polo.", source: "Uncharted 2: Among Thieves" },
  { quote: "Train sequence.", source: "Uncharted 2: Among Thieves" },
  { quote: "Chloe Frazer.", source: "Uncharted 2: Among Thieves" },
  // Demon's Souls
  { quote: "Umbasa.", source: "Demon's Souls" },
  { quote: "So the world might be mended.", source: "Demon's Souls" },
  { quote: "Heart of gold.", source: "Demon's Souls" },
  // Mass Effect 2
  { quote: "Assuming direct control.", source: "Mass Effect 2" },
  { quote: "I am the very model of a scientist Salarian.", source: "Mass Effect 2" },
  { quote: "Suicide Mission.", source: "Mass Effect 2" },
  // Red Dead Redemption
  { quote: "My name is John Marston!", source: "Red Dead Redemption" },
  { quote: "You implore me?", source: "Red Dead Redemption" },
  { quote: "Bear attacks in Tall Trees.", source: "Red Dead Redemption" },
  // Fallout: New Vegas
  { quote: "The truth is, the game was rigged from the start.", source: "Fallout: New Vegas" },
  { quote: "Patrolling the Mojave almost makes you wish for a nuclear winter.", source: "Fallout: New Vegas" },
  { quote: "Ring-a-ding-ding!", source: "Fallout: New Vegas" }
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
console.log("Written part 2!");
