import fs from 'fs';

const POP_BOOKS_QUOTES = [
  // 68. The Last Thing He Told Me
  { quote: "Protect her.", source: "The Last Thing He Told Me" },
  { quote: "Hannah and Bailey.", source: "The Last Thing He Told Me" },
  { quote: "When your husband leaves nothing but a duffel bag of cash.", source: "The Last Thing He Told Me" },

  // 69. Firekeeper's Daughter
  { quote: "To know the firekeeper is to know the fire.", source: "Firekeeper's Daughter" },
  { quote: "Daunis Fontaine.", source: "Firekeeper's Daughter" },
  { quote: "Undercover in the Ojibwe reservation.", source: "Firekeeper's Daughter" },

  // 70. The Love Hypothesis
  { quote: "Hypothesis: When you fake-date a grumpy professor, you might actually fall in love.", source: "The Love Hypothesis" },
  { quote: "Olive and Adam.", source: "The Love Hypothesis" },
  { quote: "Reylo fanfiction that conquered BookTok.", source: "The Love Hypothesis" },

  // 71. Malibu Rising
  { quote: "The Riva family always throws the best parties.", source: "Malibu Rising" },
  { quote: "Nina Riva.", source: "Malibu Rising" },
  { quote: "A house fire in 1983.", source: "Malibu Rising" },

  // 72. Rock Paper Scissors
  { quote: "My husband doesn't recognize my face.", source: "Rock Paper Scissors" },
  { quote: "Amelia and Adam Wright.", source: "Rock Paper Scissors" },
  { quote: "Face blindness and a snowstorm in Scotland.", source: "Rock Paper Scissors" },

  // 73. A Court of Silver Flames
  { quote: "I am the rock against which the surf crashes.", source: "A Court of Silver Flames" },
  { quote: "Nesta and Cassian.", source: "A Court of Silver Flames" },
  { quote: "The House of Wind book club.", source: "A Court of Silver Flames" },

  // 74. Babel
  { quote: "An act of translation is always an act of betrayal.", source: "Babel" },
  { quote: "Robin Swift at Oxford.", source: "Babel" },
  { quote: "Dark academia meets silver-working magic.", source: "Babel" },

  // 75. The Maid
  { quote: "I am your maid. I know so much about you.", source: "The Maid" },
  { quote: "Molly Gray.", source: "The Maid" },
  { quote: "Finding Mr. Black dead in his suite.", source: "The Maid" },

  // 76. Book Lovers
  { quote: "I'm the city person, the one who gets dumped.", source: "Book Lovers" },
  { quote: "Nora and Charlie.", source: "Book Lovers" },
  { quote: "A rom-com for the grumpy executive.", source: "Book Lovers" },

  // 77. The Housemaid
  { quote: "Welcome to the family.", source: "The Housemaid" },
  { quote: "Millie and the Winchesters.", source: "The Housemaid" },
  { quote: "The attic room locks from the outside.", source: "The Housemaid" },

  // 78. Fairy Tale
  { quote: "Radar.", source: "Fairy Tale" },
  { quote: "Charlie Reade and Mr. Bowditch.", source: "Fairy Tale" },
  { quote: "A boy and his dog descend down the spiral staircase.", source: "Fairy Tale" },

  // 79. Sea of Tranquility
  { quote: "I think, as a species, we have a desire to believe that we're living at the climax of the story.", source: "Sea of Tranquility" },
  { quote: "Gaspery-Jacques Roberts.", source: "Sea of Tranquility" },
  { quote: "Time travel anomalies under the dome.", source: "Sea of Tranquility" },

  // 80. Gallant
  { quote: "Shadows have teeth.", source: "Gallant" },
  { quote: "Olivia Prior.", source: "Gallant" },
  { quote: "Ghouls on the wrong side of the wall.", source: "Gallant" },

  // 81. Lightlark
  { quote: "To survive, you must deceive.", source: "Lightlark" },
  { quote: "Isla Crown.", source: "Lightlark" },
  { quote: "The Centennial curses.", source: "Lightlark" },

  // 82. The Paris Apartment
  { quote: "Ben's apartment on Rue des Amants.", source: "The Paris Apartment" },
  { quote: "Jess looking for her brother.", source: "The Paris Apartment" },
  { quote: "The neighbors are definitely hiding something.", source: "The Paris Apartment" },

  // 83. Fourth Wing
  { quote: "Fascinating. You look all frail and breakable, but you're really a violent little thing, aren't you?", source: "Fourth Wing" },
  { quote: "Tairn and Andarna.", source: "Fourth Wing" },
  { quote: "Riding dragons, crossing parapets, and avoiding Xaden.", source: "Fourth Wing" },

  // 84. Happy Place
  { quote: "Harriet and Wyn.", source: "Happy Place" },
  { quote: "Faking it for the friend group.", source: "Happy Place" },
  { quote: "The cottage in Maine.", source: "Happy Place" },

  // 85. Yellowface
  { quote: "Athena Liu is dead.", source: "Yellowface" },
  { quote: "June Hayward.", source: "Yellowface" },
  { quote: "When stealing a manuscript goes horribly wrong... or right?", source: "Yellowface" },

  // 86. Divine Rivals
  { quote: "I am writing this from a trench.", source: "Divine Rivals" },
  { quote: "Iris and Roman.", source: "Divine Rivals" },
  { quote: "Magical typewriters crossing enemy lines.", source: "Divine Rivals" },

  // 87. None of This Is True
  { quote: "Alix Summers and Josie Fair.", source: "None of This Is True" },
  { quote: "Birthday twins.", source: "None of This Is True" },
  { quote: "A podcast that ruins lives.", source: "None of This Is True" },

  // 88. Iron Flame
  { quote: "We are the marked.", source: "Iron Flame" },
  { quote: "Aretia.", source: "Iron Flame" },
  { quote: "Venin and wyvern.", source: "Iron Flame" },

  // 89. Hell Bent
  { quote: "Let Lethe burn.", source: "Hell Bent" },
  { quote: "Alex going to hell for Darlington.", source: "Hell Bent" },
  { quote: "Demon hunting at Yale.", source: "Hell Bent" },

  // 90. Weyward
  { quote: "The Weyward women.", source: "Weyward" },
  { quote: "Kate, Violet, and Altha.", source: "Weyward" },
  { quote: "Witchcraft passed down through generations.", source: "Weyward" },

  // 91. The Covenant of Water
  { quote: "A family where at least one person dies by drowning in every generation.", source: "The Covenant of Water" },
  { quote: "Big Ammachi.", source: "The Covenant of Water" },
  { quote: "The condition.", source: "The Covenant of Water" },

  // 92. Holly
  { quote: "Holly Gibney.", source: "Holly" },
  { quote: "Penny Dahl and the professors.", source: "Holly" },
  { quote: "Retirees with a terrifying diet.", source: "Holly" },

  // 93. The Familiar
  { quote: "Luzia and Santángel.", source: "The Familiar" },
  { quote: "Magic in Golden Age Spain.", source: "The Familiar" },
  { quote: "Miracles sold for a price.", source: "The Familiar" },

  // 94. Funny Story
  { quote: "Daphne and Miles.", source: "Funny Story" },
  { quote: "When your exes run off together.", source: "Funny Story" },
  { quote: "Roommates by necessity.", source: "Funny Story" },

  // 95. The Women
  { quote: "Women can be heroes too.", source: "The Women" },
  { quote: "Frankie McGrath in Vietnam.", source: "The Women" },
  { quote: "Combat nurses in a war zone.", source: "The Women" },

  // 96. House of Flame and Shadow
  { quote: "My friends are with me.", source: "House of Flame and Shadow" },
  { quote: "Bryce Quinlan visiting another world.", source: "House of Flame and Shadow" },
  { quote: "The crossover we've been waiting for.", source: "House of Flame and Shadow" },

  // 97. The God of the Woods
  { quote: "Camp Emerson in the Adirondacks.", source: "The God of the Woods" },
  { quote: "Barbara Van Laar.", source: "The God of the Woods" },
  { quote: "Two missing children, decades apart.", source: "The God of the Woods" },

  // 98. The Teacher
  { quote: "Eve and Syd.", source: "The Teacher" },
  { quote: "Scandal at Caseham High.", source: "The Teacher" },
  { quote: "A psychological thriller in the classroom.", source: "The Teacher" },

  // 99. The Reappearance of Rachel Price
  { quote: "My mother disappeared 16 years ago.", source: "The Reappearance of Rachel Price" },
  { quote: "Bel Price.", source: "The Reappearance of Rachel Price" },
  { quote: "Making a true crime documentary about your own family.", source: "The Reappearance of Rachel Price" },

  // 100. Leather & Lark
  { quote: "Lark and Lachlan.", source: "Leather & Lark" },
  { quote: "The Ruinous Love Trilogy continues.", source: "Leather & Lark" },
  { quote: "A hitman and a chaotic singer.", source: "Leather & Lark" }
];

const filePath = './src/lib/flavorTexts.ts';
let content = fs.readFileSync(filePath, 'utf8');
const match = content.match(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = (\{[\s\S]*?\});\n\nexport function/);
const obj = eval('(' + match[1] + ')');

let bookArr = obj['Book'] || [];

for (const quoteObj of POP_BOOKS_QUOTES) {
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
console.log("Successfully written popular books 68-100!");
