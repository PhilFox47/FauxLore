import fs from 'fs';

const BOOK_QUOTES = [
  // 67. The Princess Bride
  { quote: "As you wish.", source: "The Princess Bride" },
  { quote: "Hello. My name is Inigo Montoya. You killed my father. Prepare to die.", source: "The Princess Bride" },
  { quote: "Inconceivable!", source: "The Princess Bride" },
  // 68. The Hitchhiker's Guide to the Galaxy
  { quote: "Don't Panic.", source: "The Hitchhiker's Guide to the Galaxy" },
  { quote: "The Answer to the Great Question... Of Life, the Universe and Everything... Is... Forty-two.", source: "The Hitchhiker's Guide to the Galaxy" },
  { quote: "Always know where your towel is.", source: "The Hitchhiker's Guide to the Galaxy" },
  // 69. Kindred
  { quote: "I lost an arm on my last trip home.", source: "Kindred" },
  { quote: "Dana time-traveling to the antebellum South.", source: "Kindred" },
  { quote: "Kevin trying to understand the paradox.", source: "Kindred" },
  // 70. The Name of the Rose
  { quote: "Books are not made to be believed, but to be subjected to inquiry.", source: "The Name of the Rose" },
  { quote: "William of Baskerville investigating the abbey.", source: "The Name of the Rose" },
  { quote: "Labyrinthine libraries and poisoned pages.", source: "The Name of the Rose" },
  // 71. Midnight's Children
  { quote: "I had been mysteriously handcuffed to history.", source: "Midnight's Children" },
  { quote: "Saleem Sinai's telepathic nose.", source: "Midnight's Children" },
  { quote: "Children born at the exact moment of India's independence.", source: "Midnight's Children" },
  // 72. The Color Purple
  { quote: "I think it pisses God off if you walk by the color purple in a field somewhere and don't notice it.", source: "The Color Purple" },
  { quote: "Celie's letters to God.", source: "The Color Purple" },
  { quote: "You told Harpo to beat me.", source: "The Color Purple" },
  // 73. Neuromancer
  { quote: "The sky above the port was the color of television, tuned to a dead channel.", source: "Neuromancer" },
  { quote: "Case jacking into the matrix.", source: "Neuromancer" },
  { quote: "Inventing cyberpunk before the internet was a thing.", source: "Neuromancer" },
  // 74. The Handmaid's Tale
  { quote: "Nolite te bastardes carborundorum.", source: "The Handmaid's Tale" },
  { quote: "Offred in Gilead.", source: "The Handmaid's Tale" },
  { quote: "Under His Eye.", source: "The Handmaid's Tale" },
  // 75. Blood Meridian
  { quote: "Whatever in creation exists without my knowledge exists without my consent.", source: "Blood Meridian" },
  { quote: "Judge Holden never sleeps, he says. He says he'll never die.", source: "Blood Meridian" },
  { quote: "The most violent western ever written.", source: "Blood Meridian" },
  // 76. It
  { quote: "We all float down here.", source: "It" },
  { quote: "The Losers Club facing Pennywise.", source: "It" },
  { quote: "Fear of clowns exponentially increased.", source: "It" },
  // 77. Beloved
  { quote: "Definitions belong to the definers, not the defined.", source: "Beloved" },
  { quote: "Sethe's haunted house.", source: "Beloved" },
  { quote: "124 was spiteful.", source: "Beloved" },
  // 78. The Alchemist
  { quote: "And, when you want something, all the universe conspires in helping you to achieve it.", source: "The Alchemist" },
  { quote: "Santiago's journey to the pyramids.", source: "The Alchemist" },
  { quote: "Personal legend.", source: "The Alchemist" },
  // 79. The Joy Luck Club
  { quote: "I was raised the Chinese way.", source: "The Joy Luck Club" },
  { quote: "Playing mahjong and telling stories.", source: "The Joy Luck Club" },
  { quote: "Generational trauma disguised as a board game night.", source: "The Joy Luck Club" },
  // 80. The Things They Carried
  { quote: "A true war story is never moral.", source: "The Things They Carried" },
  { quote: "Jimmy Cross carrying Martha's letters.", source: "The Things They Carried" },
  { quote: "The distinction between truth and story truth.", source: "The Things They Carried" },
  // 81. The Secret History
  { quote: "Beauty is rarely soft or consolatory. Quite often, genuine beauty is something quite eerie.", source: "The Secret History" },
  { quote: "Classics students taking their studies way too far.", source: "The Secret History" },
  { quote: "Dark academia aesthetic initialized.", source: "The Secret History" },
  // 82. The Giver
  { quote: "For the first time, he heard something that he knew to be music.", source: "The Giver" },
  { quote: "Jonas receiving memories from the Giver.", source: "The Giver" },
  { quote: "Seeing the color red.", source: "The Giver" },
  // 83. A Game of Thrones
  { quote: "Winter is coming.", source: "A Game of Thrones" },
  { quote: "Eddard Stark losing his head.", source: "A Game of Thrones" },
  { quote: "When you play the game of thrones, you win or you die.", source: "A Game of Thrones" },
  // 84. Infinite Jest
  { quote: "He was a very nice boy, but he was a little strange.", source: "Infinite Jest" },
  { quote: "The Entertainment that you literally can't stop watching.", source: "Infinite Jest" },
  { quote: "A book that's 30% footnotes.", source: "Infinite Jest" },
  // 85. Harry Potter and the Sorcerer's Stone
  { quote: "You're a wizard, Harry.", source: "Harry Potter and the Sorcerer's Stone" },
  { quote: "The boy who lived.", source: "Harry Potter and the Sorcerer's Stone" },
  { quote: "10 points to Gryffindor!", source: "Harry Potter and the Sorcerer's Stone" },
  // 86. The Perks of Being a Wallflower
  { quote: "And in that moment, I swear we were infinite.", source: "The Perks of Being a Wallflower" },
  { quote: "Charlie writes letters to a stranger.", source: "The Perks of Being a Wallflower" },
  { quote: "We accept the love we think we deserve.", source: "The Perks of Being a Wallflower" },
  // 87. Life of Pi
  { quote: "I must say a word about fear. It is life's only true opponent.", source: "Life of Pi" },
  { quote: "Trapped on a boat with a Bengal tiger.", source: "Life of Pi" },
  { quote: "Richard Parker.", source: "Life of Pi" },
  // 88. The Shadow of the Wind
  { quote: "Books are mirrors: you only see in them what you already have inside you.", source: "The Shadow of the Wind" },
  { quote: "The Cemetery of Forgotten Books.", source: "The Shadow of the Wind" },
  { quote: "Daniel Sempere tracking down Julián Carax.", source: "The Shadow of the Wind" },
  // 89. The Kite Runner
  { quote: "For you, a thousand times over.", source: "The Kite Runner" },
  { quote: "Amir and Hassan kite fighting.", source: "The Kite Runner" },
  { quote: "There is a way to be good again.", source: "The Kite Runner" },
  // 90. The Book Thief
  { quote: "I am haunted by humans.", source: "The Book Thief" },
  { quote: "Death narrating a story set in Nazi Germany.", source: "The Book Thief" },
  { quote: "Liesel Meminger stealing books.", source: "The Book Thief" },
  // 91. The Road
  { quote: "You have to carry the fire.", source: "The Road" },
  { quote: "The man and the boy pushing a shopping cart.", source: "The Road" },
  { quote: "Canned peaches and infinite gray.", source: "The Road" },
  // 92. The Hunger Games
  { quote: "May the odds be ever in your favor.", source: "The Hunger Games" },
  { quote: "Katniss volunteering as tribute.", source: "The Hunger Games" },
  { quote: "I volunteer!", source: "The Hunger Games" },
  // 93. The Martian
  { quote: "I'm gonna have to science the shit out of this.", source: "The Martian" },
  { quote: "Mark Watney growing potatoes on Mars.", source: "The Martian" },
  { quote: "Space pirate.", source: "The Martian" },
  // 94. The Song of Achilles
  { quote: "I could recognize him by touch alone, by smell; I would know him blind, by the way his breaths came and his feet struck the earth.", source: "The Song of Achilles" },
  { quote: "Patroclus narrating Achilles' life.", source: "The Song of Achilles" },
  { quote: "Name one hero who was happy.", source: "The Song of Achilles" },
  // 95. Gone Girl
  { quote: "There are two sides to every story.", source: "Gone Girl" },
  { quote: "Amy Dunne's master plan.", source: "Gone Girl" },
  { quote: "The 'Cool Girl' monologue.", source: "Gone Girl" },
  // 96. The Goldfinch
  { quote: "A great sorrow, and one that I am only beginning to understand: we don't get to choose our own hearts.", source: "The Goldfinch" },
  { quote: "Theo hiding a priceless painting.", source: "The Goldfinch" },
  { quote: "Boris being Boris.", source: "The Goldfinch" },
  // 97. A Little Life
  { quote: "Things get broken, and sometimes they get repaired.", source: "A Little Life" },
  { quote: "Jude's unending suffering.", source: "A Little Life" },
  { quote: "Four friends in New York, and a whole lot of trauma.", source: "A Little Life" },
  // 98. The Underground Railroad
  { quote: "Every slave thinks about it. In the morning, before they wake you up. In the evening, before you go to sleep.", source: "The Underground Railroad" },
  { quote: "Cora escaping via a literal underground train system.", source: "The Underground Railroad" },
  { quote: "Alternative history that hits too close to reality.", source: "The Underground Railroad" },
  // 99. Circe
  { quote: "But in a solitary life, there are rare moments when another soul dips near yours.", source: "Circe" },
  { quote: "Turning men into pigs.", source: "Circe" },
  { quote: "A witch on the island of Aiaia.", source: "Circe" },
  // 100. Tomorrow, and Tomorrow, and Tomorrow
  { quote: "What is a game? It's tomorrow, and tomorrow, and tomorrow.", source: "Tomorrow, and Tomorrow, and Tomorrow" },
  { quote: "Sam and Sadie making Ichigo.", source: "Tomorrow, and Tomorrow, and Tomorrow" },
  { quote: "The Oregon Trail hospital run.", source: "Tomorrow, and Tomorrow, and Tomorrow" },
  // 101. Fourth Wing
  { quote: "A dragon without its rider is a tragedy. A rider without their dragon is dead.", source: "Fourth Wing" },
  { quote: "Violet Sorrengail at Basgiath War College.", source: "Fourth Wing" },
  { quote: "Xaden Riorson's shadow daggers.", source: "Fourth Wing" }
];

const filePath = './src/lib/flavorTexts.ts';
let content = fs.readFileSync(filePath, 'utf8');
const match = content.match(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = (\{[\s\S]*?\});\n\nexport function/);
const obj = eval('(' + match[1] + ')');

let bookArr = obj['Book'] || [];

for (const quoteObj of BOOK_QUOTES) {
  const exists = bookArr.some((entry: any) => {
    if (typeof entry === 'string') return entry === quoteObj.quote;
    return entry.quote === quoteObj.quote;
  });
  
  if (!exists) {
    bookArr.push(quoteObj);
  }
}

obj['Book'] = bookArr;

const exportString = "export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry[]> = " + JSON.stringify(obj, null, 2) + ";";
content = content.replace(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = \{[\s\S]*?\};\n/, exportString + '\n');
fs.writeFileSync(filePath, content);
console.log("Successfully written books 67-101!");
