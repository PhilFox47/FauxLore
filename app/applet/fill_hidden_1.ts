import fs from 'fs';

const GAMING_QUOTES = [
  // 1. Star Control II
  { quote: "Juffo-Wup fills in my omissions.", source: "Star Control II" },
  { quote: "Launch fighters!", source: "Star Control II" },
  { quote: "We come in peace. We are the Ur-Quan.", source: "Star Control II" },
  // 2. Plok
  { quote: "Did you see my flag?", source: "Plok" },
  { quote: "Fleas everywhere!", source: "Plok" },
  { quote: "Tim Follin's masterpiece soundtrack.", source: "Plok" },
  // 3. Live A Live
  { quote: "Those who rely on the power of another...", source: "Live A Live" },
  { quote: "Megalomania.", source: "Live A Live" },
  { quote: "Oersted did nothing wrong.", source: "Live A Live" },
  // 4. Terranigma
  { quote: "Resurrect the world.", source: "Terranigma" },
  { quote: "A small bird brought a message.", source: "Terranigma" },
  { quote: "That ending though...", source: "Terranigma" },
  // 5. Vandal Hearts
  { quote: "Blood geysers.", source: "Vandal Hearts" },
  { quote: "Vandalier class.", source: "Vandal Hearts" },
  { quote: "A tactical RPG pioneer.", source: "Vandal Hearts" },
  // 6. Skullmonkeys
  { quote: "Beans, beans, the musical fruit.", source: "Skullmonkeys" },
  { quote: "Willie Trombone!", source: "Skullmonkeys" },
  { quote: "A true claymation fever dream.", source: "Skullmonkeys" },
  // 7. Brave Fencer Musashi
  { quote: "Minku!", source: "Brave Fencer Musashi" },
  { quote: "Lumina, sword of luminescence!", source: "Brave Fencer Musashi" },
  { quote: "Sleep deprivation mechanics.", source: "Brave Fencer Musashi" },
  // 8. Outcast
  { quote: "Ulukai.", source: "Outcast" },
  { quote: "Greetings, Cutter Slade.", source: "Outcast" },
  { quote: "Voxel landscapes ahead of their time.", source: "Outcast" },
  // 9. Omikron: The Nomad Soul
  { quote: "Transfer your soul.", source: "Omikron: The Nomad Soul" },
  { quote: "David Bowie is everywhere.", source: "Omikron: The Nomad Soul" },
  { quote: "The Dreamers.", source: "Omikron: The Nomad Soul" },
  // 10. Vagrant Story
  { quote: "The blood is the life.", source: "Vagrant Story" },
  { quote: "Reinforcements? I am the reinforcements.", source: "Vagrant Story" },
  { quote: "Ashley Riot's fabulous chaps.", source: "Vagrant Story" },
  // 11. Skies of Arcadia
  { quote: "Moons give me strength!", source: "Skies of Arcadia" },
  { quote: "Vyse the Legend.", source: "Skies of Arcadia" },
  { quote: "Random encounters every two steps.", source: "Skies of Arcadia" },
  // 12. Giants: Citizen Kabuto
  { quote: "Kabuto smash!", source: "Giants: Citizen Kabuto" },
  { quote: "Meccaryns.", source: "Giants: Citizen Kabuto" },
  { quote: "Base building in a shooter?", source: "Giants: Citizen Kabuto" },
  // 13. The Legend of Dragoon
  { quote: "Volcano!", source: "The Legend of Dragoon" },
  { quote: "Gust of Wind Dance!", source: "The Legend of Dragoon" },
  { quote: "Lavitz... :(", source: "The Legend of Dragoon" },
  // 14. Anachronox
  { quote: "Sly Boots.", source: "Anachronox" },
  { quote: "Fatty Fargo.", source: "Anachronox" },
  { quote: "Having a literal planet in your party.", source: "Anachronox" },
  // 15. Illbleed
  { quote: "The horror park.", source: "Illbleed" },
  { quote: "Eriko!", source: "Illbleed" },
  { quote: "Checking every room for traps.", source: "Illbleed" },
  // 16. Shadow Hearts
  { quote: "Judgment Ring.", source: "Shadow Hearts" },
  { quote: "Malice.", source: "Shadow Hearts" },
  { quote: "Yuri Hyuga's transformations.", source: "Shadow Hearts" },
  // 17. Gothic II
  { quote: "Show me your wares.", source: "Gothic II" },
  { quote: "For Innos!", source: "Gothic II" },
  { quote: "Getting killed by a meatbug.", source: "Gothic II" },
  // 18. Freedom Fighters
  { quote: "For the rebellion!", source: "Freedom Fighters" },
  { quote: "Plumber.", source: "Freedom Fighters" },
  { quote: "Jesper Kyd's choir soundtrack.", source: "Freedom Fighters" },
  // 19. Beyond Good & Evil
  { quote: "Propaganda!", source: "Beyond Good & Evil" },
  { quote: "Carlson & Peeters.", source: "Beyond Good & Evil" },
  { quote: "Still waiting for the sequel...", source: "Beyond Good & Evil" },
  // 20. Sphinx and the Cursed Mummy
  { quote: "Mummy platforming.", source: "Sphinx and the Cursed Mummy" },
  { quote: "Blade of Osiris.", source: "Sphinx and the Cursed Mummy" },
  { quote: "The infamous save-corrupting bug.", source: "Sphinx and the Cursed Mummy" },
  // 21. Breakdown
  { quote: "Derrick Cole.", source: "Breakdown" },
  { quote: "First-person eating.", source: "Breakdown" },
  { quote: "First-person backflips.", source: "Breakdown" },
  // 22. The Chronicles of Riddick: Escape from Butcher Bay
  { quote: "The dark... are you afraid of the dark?", source: "The Chronicles of Riddick: Escape from Butcher Bay" },
  { quote: "Get him a surgeon.", source: "The Chronicles of Riddick: Escape from Butcher Bay" },
  { quote: "Shank combat simulator.", source: "The Chronicles of Riddick: Escape from Butcher Bay" },
  // 23. Psychonauts
  { quote: "I am the milkman. My milk is delicious.", source: "Psychonauts" },
  { quote: "Lungfishopolis.", source: "Psychonauts" },
  { quote: "The Meat Circus.", source: "Psychonauts" },
  // 24. Killer7
  { quote: "In the name of Harman.", source: "Killer7" },
  { quote: "Heaven Smile.", source: "Killer7" },
  { quote: "Master, we're in a tight spot!", source: "Killer7" },
  // 25. Stubbs the Zombie in Rebel Without a Pulse
  { quote: "Brains!", source: "Stubbs the Zombie" },
  { quote: "Maggie Monday.", source: "Stubbs the Zombie" },
  { quote: "Bowling with your own head.", source: "Stubbs the Zombie" }
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
console.log("Written part 1!");
