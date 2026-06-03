import fs from 'fs';

const AUDIOBOOK_QUOTES = [
  // 67. Calypso (2018)
  { quote: "Though there's an industry built on telling you otherwise, there are few real joys in middle age.", source: "Calypso" },
  { quote: "David Sedaris making feeding a tumor to a snapping turtle sound reasonable.", source: "Calypso" },
  { quote: "The Sea Section.", source: "Calypso" },

  // 68. Catch-22 (1961)
  { quote: "Anybody who wants to get out of combat duty isn't really crazy.", source: "Catch-22" },
  { quote: "Jay O. Sanders navigating the absurd bureaucracy of Pianosa.", source: "Catch-22" },
  { quote: "Major Major Major Major.', source: 'Catch-22" },

  // 69. Slaughterhouse-Five (1969)
  { quote: "So it goes.", source: "Slaughterhouse-Five" },
  { quote: "Ethan Hawke giving Billy Pilgrim's unstuck-in-time journey a perfect slacker vibe.", source: "Slaughterhouse-Five" },
  { quote: "Tralfamadorian toilet plungers.", source: "Slaughterhouse-Five" },

  // 70. Fahrenheit 451 (1953)
  { quote: "It was a pleasure to burn.", source: "Fahrenheit 451" },
  { quote: "Tim Robbins narrating Bradbury's fiery dystopia.", source: "Fahrenheit 451" },
  { quote: "Mechanical Hound has entered the chat.", source: "Fahrenheit 451" },

  // 71. Brave New World (1932)
  { quote: "Actual happiness always looks pretty squalid in comparison with the overcompensations for misery.", source: "Brave New World" },
  { quote: "Michael York capturing the unnerving cheerfulness of the World State.", source: "Brave New World" },
  { quote: "Pass the soma.", source: "Brave New World" },

  // 72. The Catcher in the Rye (1951)
  { quote: "Don't ever tell anybody anything. If you do, you start missing everybody.", source: "The Catcher in the Rye" },
  { quote: "Michael Crouch channeling peak teenage angst.", source: "The Catcher in the Rye" },
  { quote: "Everyone is a phony.", source: "The Catcher in the Rye" },

  // 73. Animal Farm (1945)
  { quote: "All animals are equal, but some animals are more equal than others.", source: "Animal Farm" },
  { quote: "Ralph Cosham voicing communist farm animals.", source: "Animal Farm" },
  { quote: "Two legs baaaad.", source: "Animal Farm" },

  // 74. The Lion, the Witch and the Wardrobe (1950)
  { quote: "Always winter but never Christmas.", source: "The Lion, the Witch and the Wardrobe" },
  { quote: "Michael York telling the tale of Narnia.", source: "The Lion, the Witch and the Wardrobe" },
  { quote: "Selling out your family for Turkish Delight.", source: "The Lion, the Witch and the Wardrobe" },

  // 75. The Hobbit (1937)
  { quote: "In a hole in the ground there lived a hobbit.", source: "The Hobbit" },
  { quote: "Andy Serkis doing a one-man show of all 13 dwarves, Gandalf, and Bilbo.", source: "The Hobbit" },
  { quote: "Riddles in the dark!", source: "The Hobbit" },

  // 76. The Color Purple (1982)
  { quote: "I think it pisses God off if you walk by the color purple in a field somewhere and don't notice it.", source: "The Color Purple" },
  { quote: "Samira Wiley delivering a beautiful, gut-wrenching performance.", source: "The Color Purple" },
  { quote: "Celie writing to God.", source: "The Color Purple" },

  // 77. Beloved (1987)
  { quote: "Freeing yourself was one thing, claiming ownership of that freed self was another.", source: "Beloved" },
  { quote: "Toni Morrison reading her own masterpiece.", source: "Beloved" },
  { quote: "124 was spiteful.", source: "Beloved" },

  // 78. The Secret History (1992)
  { quote: "Beauty is rarely soft or consolatory. Quite often, genuine beauty is something quite eerie.", source: "The Secret History" },
  { quote: "Donna Tartt narrating her own dark academia classic.", source: "The Secret History" },
  { quote: "Taking ancient Greek way too seriously.", source: "The Secret History" },

  // 79. The Fault in Our Stars (2012)
  { quote: "Some infinities are bigger than other infinities.", source: "The Fault in Our Stars" },
  { quote: "Kate Rudd making you sob in the grocery store.", source: "The Fault in Our Stars" },
  { quote: "It's a metaphor, see.", source: "The Fault in Our Stars" },

  // 80. Gone Girl (2012)
  { quote: "There are two sides to every story.", source: "Gone Girl" },
  { quote: "Julia Whelan and Kirby Heyborne playing the most toxic couple.", source: "Gone Girl" },
  { quote: "The Cool Girl monologue delivered perfectly.", source: "Gone Girl" },

  // 81. The Da Vinci Code (2003)
  { quote: "Men go to far greater lengths to avoid what they fear than to obtain what they desire.", source: "The Da Vinci Code" },
  { quote: "Paul Michael narrating Robert Langdon's breathless puzzles.", source: "The Da Vinci Code" },
  { quote: "The cryptex.", source: "The Da Vinci Code" },

  // 82. The Girl with the Dragon Tattoo (2005)
  { quote: "What she had realized was that love was that moment when your heart was about to burst.", source: "The Girl with the Dragon Tattoo" },
  { quote: "Simon Vance navigating the Swedish pronunciations effortlessly.", source: "The Girl with the Dragon Tattoo" },
  { quote: "Mikael Blomkvist drinking a gallon of coffee per chapter.", source: "The Girl with the Dragon Tattoo" },

  // 83. Water for Elephants (2006)
  { quote: "Age is a terrible thief. Just when you're getting the hang of life, it knocks your legs out from under you.", source: "Water for Elephants" },
  { quote: "David Pittu playing Jacob at two different ages.", source: "Water for Elephants" },
  { quote: "Rosie the elephant speaks Polish.", source: "Water for Elephants" },

  // 84. Little Fires Everywhere (2017)
  { quote: "Sometimes you need to scorch everything to the ground, and start over.", source: "Little Fires Everywhere" },
  { quote: "Jennifer Lim bringing the simmering tension of Shaker Heights to a boil.", source: "Little Fires Everywhere" },
  { quote: "Who burned the house down?", source: "Little Fires Everywhere" },

  // 85. The Vanishing Half (2020)
  { quote: "You can escape a town, but you cannot escape blood.", source: "The Vanishing Half" },
  { quote: "Shayna Small capturing the distinct voices of the Vignes twins.", source: "The Vanishing Half" },
  { quote: "Mallard, Louisiana.", source: "The Vanishing Half" },

  // 86. Dark Matter (2016)
  { quote: "Are you happy with your life?", source: "Dark Matter" },
  { quote: "Jon Lindstrom narrating a terrifying trip through the multiverse.", source: "Dark Matter" },
  { quote: "When you have to fight 50 alternate versions of yourself.", source: "Dark Matter" },

  // 87. Recursion (2019)
  { quote: "Memory makes reality.", source: "Recursion" },
  { quote: "Jon Lindstrom and Abby Craden tackling False Memory Syndrome.", source: "Recursion" },
  { quote: "Resetting the timeline by drowning in a deprivation tank.", source: "Recursion" },

  // 88. The Three-Body Problem (2008)
  { quote: "To ruin a man's civilization, ruin his history.", source: "The Three-Body Problem" },
  { quote: "Luke Daniels bringing hard sci-fi and physics to audio.", source: "The Three-Body Problem" },
  { quote: "The sophons are listening.", source: "The Three-Body Problem" },

  // 89. Children of Time (2015)
  { quote: "Life is not a journey, but a competitive race.", source: "Children of Time" },
  { quote: "Mel Hudson narrating the evolution of highly intelligent spiders.", source: "Children of Time" },
  { quote: "Embracing your inner arachnid.", source: "Children of Time" },

  // 90. Red Rising (2014)
  { quote: "I would have lived in peace. But my enemies brought me war.", source: "Red Rising" },
  { quote: "Tim Gerard Reynolds is Darrow. There is no debate.", source: "Red Rising" },
  { quote: "Bloodydamn amazing.", source: "Red Rising" },

  // 91. The Way of Kings (2010)
  { quote: "Life before death. Strength before weakness. Journey before destination.", source: "The Way of Kings" },
  { quote: "Michael Kramer and Kate Reading: the royal couple of fantasy audiobooks.", source: "The Way of Kings" },
  { quote: "Kaladin brooding in a chasm.", source: "The Way of Kings" },

  // 92. Mistborn: The Final Empire (2006)
  { quote: "There's always another secret.", source: "Mistborn: The Final Empire" },
  { quote: "Michael Kramer pronouncing Kelsier and Vin.", source: "Mistborn: The Final Empire" },
  { quote: "Burning atium to see the future.", source: "Mistborn: The Final Empire" },

  // 93. Dungeon Crawler Carl (2020)
  { quote: "Goddammit, Donut.", source: "Dungeon Crawler Carl" },
  { quote: "Jeff Hays doing incredible vocal acrobatics for a guy and his cat.", source: "Dungeon Crawler Carl" },
  { quote: "GLURP GLURP!", source: "Dungeon Crawler Carl" },

  // 94. We Are Legion (We Are Bob) (2016)
  { quote: "I was a von Neumann probe. Literally.", source: "We Are Legion (We Are Bob)" },
  { quote: "Ray Porter voicing a dozen different versions of the same guy, and making them distinct.", source: "We Are Legion (We Are Bob)" },
  { quote: "The Bobiverse expands.", source: "We Are Legion (We Are Bob)" },

  // 95. Norse Mythology (2017)
  { quote: "That was how the world was made, and that is how it will end.", source: "Norse Mythology" },
  { quote: "Neil Gaiman reading his own retelling, sounding like an ancient skald.", source: "Norse Mythology" },
  { quote: "Loki Ruins Everything: The Audiobook.", source: "Norse Mythology" },

  // 96. Unbroken (2010)
  { quote: "Without dignity, identity is erased.", source: "Unbroken" },
  { quote: "Edward Herrmann narrating Louis Zamperini's incredible survival.", source: "Unbroken" },
  { quote: "Fighting off sharks with an oar.", source: "Unbroken" },

  // 97. Into Thin Air (1997)
  { quote: "The summit is just a halfway point.", source: "Into Thin Air" },
  { quote: "Jon Krakauer reading his own harrowing account of the Everest disaster.", source: "Into Thin Air" },
  { quote: "Why do rich people pay to freeze on a mountain?", source: "Into Thin Air" },

  // 98. A Short History of Nearly Everything (2003)
  { quote: "To begin with, for you to be here now trillions of drifting atoms had somehow to assemble in an intricate and intriguingly obliging manner to create you.", source: "A Short History of Nearly Everything" },
  { quote: "Richard Matthews making science feel like a grand adventure.", source: "A Short History of Nearly Everything" },
  { quote: "We are all made of star stuff.", source: "A Short History of Nearly Everything" },

  // 99. The Boys in the Boat (2013)
  { quote: "It is hard to make that boat go as fast as you want to. The enemy, of course, is resistance of the water.", source: "The Boys in the Boat" },
  { quote: "Edward Herrmann telling the story of the 1936 Olympic rowing team.", source: "The Boys in the Boat" },
  { quote: "Catching a crab.", source: "The Boys in the Boat" },

  // 100. As You Wish: Inconceivable Tales from the Making of The Princess Bride (2014)
  { quote: "As you wish.", source: "As You Wish: Inconceivable Tales from the Making of The Princess Bride" },
  { quote: "Cary Elwes and the entire original cast narrating their own memories.", source: "As You Wish: Inconceivable Tales from the Making of The Princess Bride" },
  { quote: "Andre the Giant drinking all the alcohol.", source: "As You Wish: Inconceivable Tales from the Making of The Princess Bride" }
];

const filePath = './src/lib/flavorTexts.ts';
let content = fs.readFileSync(filePath, 'utf8');
const match = content.match(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = (\{[\s\S]*?\});\n\nexport function/);
const obj = eval('(' + match[1] + ')');

let audiobookArr = obj['Audiobook'] || [];

for (const quoteObj of AUDIOBOOK_QUOTES) {
  const exists = audiobookArr.some((entry: any) => {
    if (typeof entry === 'string') return entry === quoteObj.quote;
    return entry.quote === quoteObj.quote;
  });
  
  if (!exists) {
    audiobookArr.push(quoteObj);
  }
}

obj['Audiobook'] = audiobookArr;

const exportString = "export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry[]> = " + JSON.stringify(obj, null, 2) + ";";
content = content.replace(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = \{[\s\S]*?\};\n/, exportString + '\n');
fs.writeFileSync(filePath, content);
console.log("Successfully written audiobooks 67-100!");
