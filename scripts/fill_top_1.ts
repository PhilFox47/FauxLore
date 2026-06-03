import fs from 'fs';

const GAMING_QUOTES = [
  // Tetris
  { quote: "BOOM! Tetris for Jonas.", source: "Tetris" },
  { quote: "Line piece!", source: "Tetris" },
  { quote: "The ultimate packing simulator.", source: "Tetris" },
  // Super Mario Bros.
  { quote: "Our princess is in another castle!", source: "Super Mario Bros." },
  { quote: "1-UP!", source: "Super Mario Bros." },
  { quote: "Jumping on turtles since 1985.", source: "Super Mario Bros." },
  // The Legend of Zelda
  { quote: "It's dangerous to go alone! Take this.", source: "The Legend of Zelda" },
  { quote: "Dodongo dislikes smoke.", source: "The Legend of Zelda" },
  { quote: "Bombing every suspicious wall.", source: "The Legend of Zelda" },
  // Super Mario Bros. 3
  { quote: "Warp whistle secret.", source: "Super Mario Bros. 3" },
  { quote: "Tanooki suit.", source: "Super Mario Bros. 3" },
  { quote: "The sun is trying to kill me!", source: "Super Mario Bros. 3" },
  // SimCity
  { quote: "Reticulating splines.", source: "SimCity" },
  { quote: "Monster attacked the city!", source: "SimCity" },
  { quote: "You can't cut back on funding! You will regret this!", source: "SimCity" },
  // Super Mario World
  { quote: "Yoshi sacrifice jump.", source: "Super Mario World" },
  { quote: "Tubular is pain.", source: "Super Mario World" },
  { quote: "Cape feather spinning into oblivion.", source: "Super Mario World" },
  // The Secret of Monkey Island
  { quote: "Look behind you, a three-headed monkey!", source: "The Secret of Monkey Island" },
  { quote: "You fight like a dairy farmer!", source: "The Secret of Monkey Island" },
  { quote: "How appropriate. You fight like a cow!", source: "The Secret of Monkey Island" },
  // Street Fighter II
  { quote: "Shoryuken!", source: "Street Fighter II" },
  { quote: "Hadouken!", source: "Street Fighter II" },
  { quote: "Guile's theme goes with everything.", source: "Street Fighter II" },
  // Sonic the Hedgehog
  { quote: "Gotta go fast!", source: "Sonic the Hedgehog" },
  { quote: "Blast processing.", source: "Sonic the Hedgehog" },
  { quote: "Drowning music anxiety.", source: "Sonic the Hedgehog" },
  // The Legend of Zelda: A Link to the Past
  { quote: "Welcome to the Dark World.", source: "The Legend of Zelda: A Link to the Past" },
  { quote: "Master Sword GET!", source: "The Legend of Zelda: A Link to the Past" },
  { quote: "Pink hair Link.", source: "The Legend of Zelda: A Link to the Past" },
  // Sid Meier's Civilization
  { quote: "Our words are backed with NUCLEAR WEAPONS!", source: "Civilization" },
  { quote: "Gandhi has declared war!", source: "Civilization" },
  { quote: "Just one more turn...", source: "Civilization" },
  // Mortal Kombat
  { quote: "Get over here!", source: "Mortal Kombat" },
  { quote: "Fatality.", source: "Mortal Kombat" },
  { quote: "Toasty!", source: "Mortal Kombat" },
  // Doom
  { quote: "IDDQD", source: "Doom" },
  { quote: "IDKFA", source: "Doom" },
  { quote: "Can it run Doom?", source: "Doom" },
  // Myst
  { quote: "Bring me the blue pages...", source: "Myst" },
  { quote: "Bring me the red pages...", source: "Myst" },
  { quote: "I have no idea what I'm doing, but it looks pretty.", source: "Myst" },
  // Super Metroid
  { quote: "Save the animals?", source: "Super Metroid" },
  { quote: "The baby...", source: "Super Metroid" },
  { quote: "Wall jumping for hours.", source: "Super Metroid" },
  // Donkey Kong Country
  { quote: "Banana slamma!", source: "Donkey Kong Country" },
  { quote: "Minecart madness.", source: "Donkey Kong Country" },
  { quote: "Aquatic Ambience.", source: "Donkey Kong Country" },
  // Chrono Trigger
  { quote: "But you're still hungry.", source: "Chrono Trigger" },
  { quote: "The black wind howls...", source: "Chrono Trigger" },
  { quote: "You defied fate, but you can't defy me.", source: "Chrono Trigger" },
  // Pokémon Red/Blue
  { quote: "Smell ya later!", source: "Pokémon" },
  { quote: "MissingNo.", source: "Pokémon" },
  { quote: "It's super effective!", source: "Pokémon" },
  // Super Mario 64
  { quote: "So long, gay Bowser!", source: "Super Mario 64" },
  { quote: "BLJ up the stairs.", source: "Super Mario 64" },
  { quote: "Dropping the penguin off the cliff.", source: "Super Mario 64" },
  // Resident Evil
  { quote: "Jill sandwich.", source: "Resident Evil" },
  { quote: "Itchy, tasty.", source: "Resident Evil" },
  { quote: "Master of unlocking.", source: "Resident Evil" },
  // Tomb Raider
  { quote: "Locking the butler in the freezer.", source: "Tomb Raider" },
  { quote: "Swan dive!", source: "Tomb Raider" },
  { quote: "Triangle boobs.", source: "Tomb Raider" },
  // Diablo
  { quote: "Stay a while and listen.", source: "Diablo" },
  { quote: "Fresh meat!", source: "Diablo" },
  { quote: "Click click click click.", source: "Diablo" },
  // Final Fantasy VII
  { quote: "Aerith...", source: "Final Fantasy VII" },
  { quote: "Omnislash!", source: "Final Fantasy VII" },
  { quote: "This guy are sick.", source: "Final Fantasy VII" },
  { quote: "Let's mosey.", source: "Final Fantasy VII" },
  // StarFox 64
  { quote: "Do a barrel roll!", source: "StarFox 64" },
  { quote: "Can't let you do that, Star Fox!", source: "StarFox 64" },
  { quote: "Slippy, get back here!", source: "StarFox 64" },
  // Castlevania: Symphony of the Night
  { quote: "What is a man? A miserable little pile of secrets!", source: "Castlevania: Symphony of the Night" },
  { quote: "Die monster!", source: "Castlevania: Symphony of the Night" },
  { quote: "Backdashing through the castle.", source: "Castlevania: Symphony of the Night" },
  // GoldenEye 007
  { quote: "No Oddjob allowed.", source: "GoldenEye 007" },
  { quote: "Slappers only!", source: "GoldenEye 007" },
  { quote: "Paintball mode.", source: "GoldenEye 007" },
  // Fallout
  { quote: "War. War never changes.", source: "Fallout" },
  { quote: "Vault 13.", source: "Fallout" },
  { quote: "Water chip.", source: "Fallout" },
  // The Legend of Zelda: Ocarina of Time
  { quote: "Hey! Listen!", source: "The Legend of Zelda: Ocarina of Time" },
  { quote: "Water Temple PTSD.", source: "The Legend of Zelda: Ocarina of Time" },
  { quote: "Hover boots.", source: "The Legend of Zelda: Ocarina of Time" },
  // Half-Life
  { quote: "They're waiting for you, Gordon. In the test chamber.", source: "Half-Life" },
  { quote: "Wake up, Mr. Freeman.", source: "Half-Life" },
  { quote: "Scientist screams.", source: "Half-Life" },
  // Metal Gear Solid
  { quote: "SNAKE? SNAAAAKE!", source: "Metal Gear Solid" },
  { quote: "A Hind D?", source: "Metal Gear Solid" },
  { quote: "You like Castlevania, don't you?", source: "Metal Gear Solid" },
  { quote: "Psycho Mantis...?", source: "Metal Gear Solid" },
  // StarCraft
  { quote: "You must construct additional pylons.", source: "StarCraft" },
  { quote: "Nuclear launch detected.", source: "StarCraft" },
  { quote: "Zerg rush!", source: "StarCraft" },
  // Baldur's Gate
  { quote: "Go for the eyes, Boo!", source: "Baldur's Gate" },
  { quote: "You must gather your party before venturing forth.", source: "Baldur's Gate" },
  { quote: "I will be the last... and you will go first.", source: "Baldur's Gate" },
  // Grim Fandango
  { quote: "My scythe... I like to keep it where my heart used to be.", source: "Grim Fandango" },
  { quote: "Run you pigeons, it's Robert Frost!", source: "Grim Fandango" },
  { quote: "Manny Calavera.", source: "Grim Fandango" },
  // System Shock 2
  { quote: "L-l-look at you, hacker.", source: "System Shock 2" },
  { quote: "Glory to the mass.", source: "System Shock 2" },
  { quote: "SHODAN.", source: "System Shock 2" },
  // Silent Hill
  { quote: "The fear of blood tends to create fear for the flesh.", source: "Silent Hill" },
  { quote: "Radio static gets louder.", source: "Silent Hill" },
  { quote: "Have you seen a little girl? Short, black hair...", source: "Silent Hill" },
  // Super Smash Bros.
  { quote: "FALCON PUNCH!", source: "Super Smash Bros." },
  { quote: "WOMBO COMBO!", source: "Super Smash Bros." },
  { quote: "That ain't Falco.", source: "Super Smash Bros." },
  // Counter-Strike
  { quote: "Rush B", source: "Counter-Strike" },
  { quote: "Bomb has been planted.", source: "Counter-Strike" },
  { quote: "Fire in the hole!", source: "Counter-Strike" },
  // Deus Ex
  { quote: "What a shame.", source: "Deus Ex" },
  { quote: "I never asked for this.", source: "Deus Ex" },
  { quote: "My vision is augmented.", source: "Deus Ex" },
  // The Sims
  { quote: "Removing the pool ladder.", source: "The Sims" },
  { quote: "Rosebud.", source: "The Sims" },
  { quote: "Sul sul!", source: "The Sims" },
  // Diablo II
  { quote: "Not even death can save you from me.", source: "Diablo II" },
  { quote: "Moo moo, moo moo moo.", source: "Diablo II" },
  { quote: "Stone of Jordan.", source: "Diablo II" },
  // Halo: Combat Evolved
  { quote: "I need a weapon.", source: "Halo: Combat Evolved" },
  { quote: "Wort wort wort.", source: "Halo: Combat Evolved" },
  { quote: "The Library is pain.", source: "Halo: Combat Evolved" },
  // Grand Theft Auto III
  { quote: "Leave me alone!", source: "Grand Theft Auto III" },
  { quote: "Dodo flying.", source: "Grand Theft Auto III" },
  { quote: "I know a place on the edge of the Red Light District.", source: "Grand Theft Auto III" },
  // Silent Hill 2
  { quote: "In my restless dreams, I see that town.", source: "Silent Hill 2" },
  { quote: "There was a hole here. It's gone now.", source: "Silent Hill 2" },
  { quote: "Dog ending.", source: "Silent Hill 2" },
  // Super Smash Bros. Melee
  { quote: "No items, Fox only, Final Destination.", source: "Super Smash Bros. Melee" },
  { quote: "Wavedashing.", source: "Super Smash Bros. Melee" },
  { quote: "A NEW RECORD!", source: "Super Smash Bros. Melee" },
  // Metal Gear Solid 2: Sons of Liberty
  { quote: "Fission Mailed.", source: "Metal Gear Solid 2: Sons of Liberty" },
  { quote: "I need scissors! 61!", source: "Metal Gear Solid 2: Sons of Liberty" },
  { quote: "The La Li Lu Le Lo?", source: "Metal Gear Solid 2: Sons of Liberty" },
  // Metroid Prime
  { quote: "Scanning approach.", source: "Metroid Prime" },
  { quote: "Chozo Ghosts.", source: "Metroid Prime" },
  { quote: "That soundtrack though.", source: "Metroid Prime" },
  // The Legend of Zelda: The Wind Waker
  { quote: "Sploosh! Kaboom!", source: "The Legend of Zelda: The Wind Waker" },
  { quote: "Triforce shard gathering.", source: "The Legend of Zelda: The Wind Waker" },
  { quote: "Tingle Tuner.", source: "The Legend of Zelda: The Wind Waker" }
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
console.log("Written part 1!");
