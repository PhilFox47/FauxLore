import fs from 'fs';

const GAMING_QUOTES = [
  // 26. The Mark of Kri
  { quote: "Rau and Kuzo.", source: "The Mark of Kri" },
  { quote: "Stealth kills.", source: "The Mark of Kri" },
  { quote: "Right stick combat system.", source: "The Mark of Kri" },
  // 27. Call of Juarez
  { quote: "May God have mercy on your soul.", source: "Call of Juarez" },
  { quote: "Reverend Ray.", source: "Call of Juarez" },
  { quote: "Reading the Bible while shooting outlaws.", source: "Call of Juarez" },
  // 28. Hotel Dusk: Room 215
  { quote: "Kyle Hyde.", source: "Hotel Dusk: Room 215" },
  { quote: "Red Crown.", source: "Hotel Dusk: Room 215" },
  { quote: "Holding your DS sideways.", source: "Hotel Dusk: Room 215" },
  // 29. Jeanne d'Arc
  { quote: "For France!", source: "Jeanne d'Arc" },
  { quote: "Armlet power.", source: "Jeanne d'Arc" },
  { quote: "Historical inaccuracy with frogs.", source: "Jeanne d'Arc" },
  // 30. The World Ends with You
  { quote: "Zetta slow!", source: "The World Ends with You" },
  { quote: "Calling!", source: "The World Ends with You" },
  { quote: "So zetta slow!", source: "The World Ends with You" },
  // 31. Lost Odyssey
  { quote: "A Thousand Years of Dreams.", source: "Lost Odyssey" },
  { quote: "Kaim Argonar.", source: "Lost Odyssey" },
  { quote: "The true Final Fantasy XIII.", source: "Lost Odyssey" },
  // 32. Mirror's Edge
  { quote: "Faith.", source: "Mirror's Edge" },
  { quote: "Runner vision.", source: "Mirror's Edge" },
  { quote: "Still Alive.", source: "Mirror's Edge" },
  // 33. Deadly Premonition
  { quote: "Isn't that right, Zach?", source: "Deadly Premonition" },
  { quote: "F K... in the coffee.", source: "Deadly Premonition" },
  { quote: "The Sinner's Sandwich.", source: "Deadly Premonition" },
  // 34. Enslaved: Odyssey to the West
  { quote: "Monkey and Trip.", source: "Enslaved: Odyssey to the West" },
  { quote: "Pigsy.", source: "Enslaved: Odyssey to the West" },
  { quote: "Andy Serkis as a cloud-riding monkey.", source: "Enslaved: Odyssey to the West" },
  // 35. Singularity
  { quote: "Time Manipulation Device.", source: "Singularity" },
  { quote: "Barisov.", source: "Singularity" },
  { quote: "Reverting soldiers into dust.", source: "Singularity" },
  // 36. Alpha Protocol
  { quote: "A Steven Heck of a time.", source: "Alpha Protocol" },
  { quote: "Orphans.", source: "Alpha Protocol" },
  { quote: "The dialogue timer is running out!", source: "Alpha Protocol" },
  // 37. The Saboteur
  { quote: "Sean Devlin.", source: "The Saboteur" },
  { quote: "Color returns.", source: "The Saboteur" },
  { quote: "Blowing up zeppelins in black and white Paris.", source: "The Saboteur" },
  // 38. Ghost Trick: Phantom Detective
  { quote: "Sissel.", source: "Ghost Trick: Phantom Detective" },
  { quote: "Missile!", source: "Ghost Trick: Phantom Detective" },
  { quote: "4 minutes before death.", source: "Ghost Trick: Phantom Detective" },
  // 39. El Shaddai: Ascension of the Metatron
  { quote: "Are you sure that's enough armor?", source: "El Shaddai: Ascension of the Metatron" },
  { quote: "No, I want the best.", source: "El Shaddai: Ascension of the Metatron" },
  { quote: "Denim jeans in heaven.", source: "El Shaddai: Ascension of the Metatron" },
  // 40. Binary Domain
  { quote: "Big Bo.", source: "Binary Domain" },
  { quote: "Scrapheads.", source: "Binary Domain" },
  { quote: "Yelling commands at your TV.", source: "Binary Domain" },
  // 41. Spec Ops: The Line
  { quote: "Do you feel like a hero yet?", source: "Spec Ops: The Line" },
  { quote: "White phosphorus.", source: "Spec Ops: The Line" },
  { quote: "Welcome to Dubai.", source: "Spec Ops: The Line" },
  // 42. Sleeping Dogs
  { quote: "A man who never eats pork buns is never a whole man!", source: "Sleeping Dogs" },
  { quote: "Wei Shen.", source: "Sleeping Dogs" },
  { quote: "Environmental takedowns in the night market.", source: "Sleeping Dogs" },
  // 43. Asura's Wrath
  { quote: "Burst!", source: "Asura's Wrath" },
  { quote: "Six-Armed Vajra Asura.", source: "Asura's Wrath" },
  { quote: "Punching the finger of a god.", source: "Asura's Wrath" },
  // 44. Remember Me
  { quote: "Memory remix.", source: "Remember Me" },
  { quote: "Nilin.", source: "Remember Me" },
  { quote: "Neo-Paris 2084.", source: "Remember Me" },
  // 45. Puppeteer
  { quote: "Kutaro.", source: "Puppeteer" },
  { quote: "Moon Bear King.", source: "Puppeteer" },
  { quote: "Theatre stage platforming.", source: "Puppeteer" },
  // 46. The Wolf Among Us
  { quote: "Glass him.", source: "The Wolf Among Us" },
  { quote: "Bigby.", source: "The Wolf Among Us" },
  { quote: "Fabletown will remember that.", source: "The Wolf Among Us" },
  // 47. Valiant Hearts: The Great War
  { quote: "Emile.", source: "Valiant Hearts: The Great War" },
  { quote: "Walt.", source: "Valiant Hearts: The Great War" },
  { quote: "The saddest dog simulator.", source: "Valiant Hearts: The Great War" },
  // 48. Sunset Overdrive
  { quote: "Awesomepocalypse.", source: "Sunset Overdrive" },
  { quote: "Overcharge.", source: "Sunset Overdrive" },
  { quote: "Grinding on wires with a teddy bear launcher.", source: "Sunset Overdrive" },
  // 49. SOMA
  { quote: "Simon, are you there?", source: "SOMA" },
  { quote: "Coin flip.", source: "SOMA" },
  { quote: "Existential dread at the bottom of the ocean.", source: "SOMA" },
  // 50. Her Story
  { quote: "Hannah.", source: "Her Story" },
  { quote: "Eve.", source: "Her Story" },
  { quote: "Typing 'murder' into a retro database.", source: "Her Story" }
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
console.log("Written part 2!");
