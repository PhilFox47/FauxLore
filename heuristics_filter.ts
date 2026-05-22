import fs from 'fs';
import { MEDIA_FLAVOR_TEXTS } from './src/lib/flavorTexts.ts';

const STOP_WORDS = new Set(["the", "a", "an", "is", "in", "on", "and", "of", "to", "for", "with", "my", "your"]);

function isLikelyTitle(text: string): boolean {
  // Remove the trailing period if it exists to check the words
  let clean = text.trim();
  if (clean.endsWith('.')) clean = clean.slice(0, -1);
  
  const words = clean.split(/\s+/);
  if (words.length > 5) return false; // Titles usually aren't super long
  
  // If we have exclamation or question mark, it's likely a quote, e.g. "Objection!"
  if (/[!?]/.test(text)) return false;
  
  // If it contains things like "I am", "I ", it's probably a quote
  if (clean.includes("I am") || clean.includes("I ") || clean.includes("You ") || clean.includes("It ")) return false;
  
  let capitalizedCount = 0;
  for (const word of words) {
    const lower = word.toLowerCase();
    if (STOP_WORDS.has(lower)) continue;
    // Check if the word starts with a capital letter
    if (/^[A-Z]/.test(word)) {
      capitalizedCount++;
    } else {
      // If a significant word is not capitalized, this might be a regular sentence fragment.
      return false;
    }
  }
  
  // If all significant words are capitalized, it's likely a title.
  return true;
}

// Manual overrides for things that we know are titles but might not be caught, or quotes that might be caught
const EXPLICIT_TITLES = new Set([
  "Dungeon Crawler Carl.", "Doctor Who.", "Stranger Things.", 
  "The Magnus Archives.", "First Dates.", "Love Island.", "Survivor.",
  "Fate/stay night.", "Umineko When They Cry.", "Higurashi When They Cry.",
  "Komi Can't Communicate.", "Kaguya-sama.", "Oshi no Ko.",
  "My Dress-Up Darling.", "Cowboy Bebop.", "Trigun.", "Hellsing.", 
  "Black Lagoon.", "Ghost in the Shell.", "Akira.", "Devilman Crybaby.",
  "The Bobiverse.", "Appleseed.", "Gundam.", "Evangelion.", "Steins;Gate.",
  "Clannad.", "Tsukihime.", "Mahoyo.", "Zero Escape.",  "Visual novels are games.",
  "Visual novels aren't games.", "Muv-Luv Extra was just a prank.", "Aokana.", "Nekopara.",
  "Grisaia.", "Fruits of Grisaia.", "Katawa Shoujo.", "Danganronpa.", "Ace Attorney.",
  "Virtue's Last Reward.", "Zero Time Dilemma.", "Finding Paradise.", "Impostor Factory.",
  "Slay the Princess.", "Being a Dik.", "Summertime Saga.", "Orion.",
  "G-senjou no Maou.", "Dies irae.", "Atri: My Dear Moments.", "White Album 2.",
  "Saya no Uta.", "Subarashiki Hibi.", "Witch on the Holy Night.", "Tsukihime remake.",
  "Fate Grand Order is a VN... physically.", "Ciconia When They Cry.", "Ougon Musou Kyoku.",
  "The visual novel medium is literature.", "The anime adaptation ruined it.",
  "Fullmetal Alchemist.", "Gintama.", "Hunter x Hunter.", "Death Note.",
  "Attack on Titan.", "Kagura Bachi.", "Oyasumi Punpun.", "Tokyo Ghoul.",
  "Chainsaw Man.", "Fire Punch.", "Frieren.", "Spy x Family.", "Demon Slayer.",
  "Nana.", "Yotsuba&!", "Asadora!", "20th Century Boys.", "Pluto.",
  "Vagabond.", "Slam Dunk.", "Haikyuu!!", "Kuruko's Basketball.", "Blue Lock.",
  "Hajime no Ippo.", "Wind Breaker.", "Bouncer.", "GTO.", "Great Teacher Onizuka.",
  "Mob Psycho 100.", "One Punch Man.", "Gantz.", "Inuyasha.", "Sailor Moon.",
  "Cardcaptor Sakura.", "Fruits Basket.", "Ouran High School Host Club.",
  "Rose of Versailles.", "Uzumaki.", "Gyo.", "Tomie.", "Peep Show.", "Fleabag.", "The Bear.",
  "The Mandalorian.", "Ted Lasso.", "Severance.", "The office.", "Parks and Recreation.",
  "Arrested Development.", "Bob's Burgers.", "King of the Hill.", "The Simpsons.",
  "Futurama.", "Avatar: The Last Airbender.", "Bojack Horseman.", "The Sopranos.",
  "Mad Men.", "The Wire.", "Twin Peaks.", "Lost.", "Scrubs.", "The IT Crowd.",
  "Fawlty Towers.", "Blackadder.", "San Junipero.", "The Crown.", "Succession.",
  "Stranger Things.", "Black Mirror.", "Sherlock.", "Doctor Who.", "The Great British Bake Off.",
  "MasterChef.", "Hell's Kitchen.", "Kitchen Nightmares.", "Shark Tank.",
  "Dragons' Den.", "RuPaul's Drag Race.", "Big Brother.", "First Dates.",
  "Love Island.", "Survivor.", "The Amazing Race.", "Jeopardy!", "Wheel of Fortune.",
  "The Price is Right.", "Taskmaster's assistant.", "Game Changer.",
  "Dropout TV.", "Whose Line Is It Anyway?", "The Magnus Archives.",
  "Welcome to Night Vale.", "The Bobiverse.", "Dungeon Crawler Carl.",
  "Sound Booth Theater.", "The Martian read by RC Bray (RIP original version).",
  "The Martian read by Wil Wheaton.", "Project Hail Mary read by Ray Porter.",
  "The Hitchhiker's Guide read by Stephen Fry.", "Harry Potter read by Jim Dale (Grammy winner).",
  "Harry Potter read by Stephen Fry (The superior version).", "Audie Award winner.",
  "Earphones Award.", "AudioFile Magazine.", "Scribd.", "Storytel.", "Audible Originals.",
  "Spotify audiobooks.", "Serial podcast.", "S-Town.", "My Favorite Murder.",
  "Sword and Scale.", "Lore podcast.", "Dan Carlin's Hardcore History.",
  "Der Besuch der alten Dame.", "Die Physiker.", "Faust.", "Die Verwandlung.",
  "Im Westen nichts Neues.", "All Quiet on the Western Front.", "Der Steppenwolf.",
  "Siddhartha.", "Die unendliche Geschichte.", "The Neverending Story.",
  "Momo.", "Tintenherz.", "Inkheart.", "Der Augensammler.", "Die Therapie.",
  "Passagier 23.", "Der Seelenbrecher.", "Psychothriller.", "Die Känguru-Chroniken.",
  "Asoziales Netzwerk.", "QualityLand.", "Fourth Wing.", "Iron Flame.",
  "Harry Potter.", "Percy Jackson.", "Camp Half-Blood.", "Hunger Games.",
  "Catching Fire.", "Twilight.", "A Court of Thorns and Roses.", "Mistborn.",
  "Stormlight Archive.", "The Name of the Wind.", "The Kingkiller Chronicle.",
  "A Song of Ice and Fire.", "Good Omens.", "Discworld.", "American Gods.",
  "The Ocean at the End of the Lane.", "Coraline.", "The Martian.", "Project Hail Mary.",
  "Red Rising.", "The Expanse.", "Foundation.", "I, Robot.", "Neuromancer.",
  "Snow Crash.", "Cat's Cradle.", "Brave New World.", "Soma.", "Fahrenheit 451.",
  "Slaughterhouse-Five.", "The Catcher in the Rye.", "To Kill a Mockingbird.",
  "The Great Gatsby.", "Pride and Prejudice.", "Jane Eyre.", "Wuthering Heights.",
  "Moby-Dick.", "Les Misérables.", "The Count of Monte Cristo.", "Frankenstein.",
  "Dracula.", "The Picture of Dorian Gray.", "Alice's Adventures in Wonderland.",
  "Marvel.", "The Death of Superman.", "Doomsday Clock.", "The Dark Knight Returns.",
  "The Killing Joke.", "Tower of Babel.", "Crisis on Infinite Earths.", "Flashpoint.",
  "Man of Steel.", "Wonder Woman.", "Fantastic Four.", "The Illuminati.", "Infinity Gauntlet."
]);

const EXPLICIT_QUOTES = new Set([
  "Wasted.", "You died.", "Finish him!", "Boy.", "Suck it down.", 
  "Job's done.", "Ready to work.", "Do a flip!", "Jason!", "Shaun!", "C9!",
  "Cyka blyat.", "gg wp", "EZ", "No re", "Lumbago.", "Tahiti.", "Git gud.",
  "Bapanada.", "SHAW!", "Wololo.", "Maidenless.", "SEGA!",
  "F2P BTW.", "Pay to win.", "Save scumming.", "Speedrun strats.", "Any% glitchless.", "Frame perfect input.",
  "Wavedashing.", "L-Cancel.", "MEDIC!", "Motherlode.", "Rosebud.", "IDDQD", "IDKFA",
  "Always.", "Forty-two.", "Timshel.", "As you wish.", "Oook.", "Amaze!", "Jazz hands.", "Rocky.",
  "Violence.", "Ineffable.", "Phony.", "Old sport.",
  "Pivot!", "Bazinga.", "D'oh!", "Norm!", "Legen—wait for it—dary!", 
  "Valar morghulis.", "Cowabunga!", "Excellent...", "Allons-y!", "Geronimo!",
  "Exterminate!", "Delete!", "Phrasing!", "Plinko.", "Sashay away.", "Shantay you stay.",
  "Daleks.", "Cybermen.", "Weeping Angels.", "Demogorgon.", "Gabagool.",
  "EAGLE!", "Super hans.", "Corner!", "Behind!", "Cousin!", "Grogu.", "Believe.",
  "Annyong.", "Alriiiiight.", "Uhhhhhhhhhhh.", "Bankai.", "Domain Expansion.",
  "Tatakae.", "Dattebayo!", "Rasengan!", "Chidori!", "Getsuga Tensho!", "Hollowfication.",
  "Kamehameha!", "Super Saiyan.", "Ultra Instinct.", "Frieza!", "Plus Ultra!", "Detroit Smash!",
  "Meruem.", "Tenoi.", "Zoltraak.", "Waku waku!", "Elegant!", 
  "BLAST.", "Tomodachi.", "Zone.", "Egoist.", "Snikt!", "Shazam!", "BAMF!", "THWIP!", "Excelsior!",
  "Chimichangas!", "SNAP."
]);

for (const category in MEDIA_FLAVOR_TEXTS) {
  const oldList = MEDIA_FLAVOR_TEXTS[category];
  const newList = [];
  
  for (const text of oldList) {
    if (EXPLICIT_TITLES.has(text) || EXPLICIT_TITLES.has(text.replace('.', ''))) {
      continue;
    }
    if (EXPLICIT_QUOTES.has(text) || EXPLICIT_QUOTES.has(text.replace('.', ''))) {
      newList.push(text);
      continue;
    }
    if (isLikelyTitle(text)) {
      console.log(`Filtering out (likely title): ${text}`);
      continue;
    }
    newList.push(text);
  }
  MEDIA_FLAVOR_TEXTS[category] = newList;
}

const exportString = `export const MEDIA_FLAVOR_TEXTS: Record<string, string[]> = ${JSON.stringify(MEDIA_FLAVOR_TEXTS, null, 2)};`;
fs.writeFileSync('./src/lib/flavorTexts.ts', exportString);
console.log("Finished rewriting src/lib/flavorTexts.ts");
