import fs from 'fs';

const AUDIOBOOK_QUOTES = [
  // 1. Project Hail Mary (2021)
  { quote: "Amaze!", source: "Project Hail Mary" },
  { quote: "Ray Porter brings Rocky to life effortlessly.", source: "Project Hail Mary" },
  { quote: "Math is the universal language, but jazz hands are a close second.", source: "Project Hail Mary" },

  // 2. The Martian (2011)
  { quote: "I'm gonna have to science the shit out of this.", source: "The Martian" },
  { quote: "R.C. Bray or Wil Wheaton, the great debate.", source: "The Martian" },
  { quote: "Mark Watney space pirate.", source: "The Martian" },

  // 3. Born a Crime (2016)
  { quote: "Language brings with it an identity and a culture, or at least the perception of it.", source: "Born a Crime" },
  { quote: "Trevor Noah's mastery of accents makes this the best way to consume the book.", source: "Born a Crime" },
  { quote: "Getting thrown out of a moving car by your mother.", source: "Born a Crime" },

  // 4. Becoming (2018)
  { quote: "For me, becoming isn't about arriving somewhere or achieving a certain aim.", source: "Becoming" },
  { quote: "Read by Michelle Obama herself, with all the warmth you'd expect.", source: "Becoming" },
  { quote: "When the First Lady tells you to eat your vegetables.", source: "Becoming" },

  // 5. Harry Potter and the Sorcerer's Stone (1997)
  { quote: "It does not do to dwell on dreams and forget to live.", source: "Harry Potter and the Sorcerer's Stone" },
  { quote: "Jim Dale or Stephen Fry? Choose your wizard.", source: "Harry Potter and the Sorcerer's Stone" },
  { quote: "Pronouncing Voldemort without the 't' like Jim Dale used to.", source: "Harry Potter and the Sorcerer's Stone" },

  // 6. World War Z (2006)
  { quote: "The monsters that rose from the dead, they are nothing compared to the ones we carry in our hearts.", source: "World War Z" },
  { quote: "The ultimate full-cast audiobook experience with Mark Hamill, Alan Alda, and more.", source: "World War Z" },
  { quote: "It's an oral history, so obviously you should listen to it.", source: "World War Z" },

  // 7. The Hitchhiker's Guide to the Galaxy (1979)
  { quote: "Time is an illusion. Lunchtime doubly so.", source: "The Hitchhiker's Guide to the Galaxy" },
  { quote: "Stephen Fry narrating the ultimate guide to the universe.", source: "The Hitchhiker's Guide to the Galaxy" },
  { quote: "Don't panic when the audiobook ends.", source: "The Hitchhiker's Guide to the Galaxy" },

  // 8. Ready Player One (2011)
  { quote: "No one in the world ever gets what they want and that is beautiful.", source: "Ready Player One" },
  { quote: "Wil Wheaton narrating a book that mentions Wil Wheaton.", source: "Ready Player One" },
  { quote: "So much 80s nostalgia you'll grow a mullet just listening.", source: "Ready Player One" },

  // 9. The Fellowship of the Ring (1954)
  { quote: "All that is gold does not glitter, Not all those who wander are lost.", source: "The Fellowship of the Ring" },
  { quote: "Andy Serkis brings the precious back to life.", source: "The Fellowship of the Ring" },
  { quote: "Listening to the walking simulator for 20 hours.", source: "The Fellowship of the Ring" },

  // 10. 11/22/63 (2011)
  { quote: "The past is obdurate. It doesn't want to be changed.", source: "11/22/63" },
  { quote: "Craig Wasson's narration of Jake's time-traveling diner dive.", source: "11/22/63" },
  { quote: "Poundcake!", source: "11/22/63" },

  // 11. Where the Crawdads Sing (2018)
  { quote: "There are some who can live without wild things, and some who cannot.", source: "Where the Crawdads Sing" },
  { quote: "Cassandra Campbell brings the marsh to life with her southern drawl.", source: "Where the Crawdads Sing" },
  { quote: "Just a girl, her boat, and an unsolved murder.", source: "Where the Crawdads Sing" },

  // 12. Daisy Jones & The Six (2019)
  { quote: "I had absolutely no interest in being somebody else's muse.", source: "Daisy Jones & The Six" },
  { quote: "A full-cast documentary format that begs to be listened to.", source: "Daisy Jones & The Six" },
  { quote: "Fleetwood Mac fanfiction at peak performance.", source: "Daisy Jones & The Six" },

  // 13. The Dutch House (2019)
  { quote: "Do you think it's possible to ever see the past as it actually was?", source: "The Dutch House" },
  { quote: "Narrated by Tom Hanks, which is exactly as soothing as it sounds.", source: "The Dutch House" },
  { quote: "I'd listen to Tom Hanks read the phone book.", source: "The Dutch House" },

  // 14. Educated (2018)
  { quote: "You can love someone and still choose to say goodbye to them.", source: "Educated" },
  { quote: "Julia Whelan narrates Tara Westover's escape from the mountain.", source: "Educated" },
  { quote: "Making you realize your family maybe wasn't that weird after all.", source: "Educated" },

  // 15. The Book Thief (2005)
  { quote: "I have hated words and I have loved them, and I hope I have made them right.", source: "The Book Thief" },
  { quote: "Allan Corduner's personification of Death is chillingly gentle.", source: "The Book Thief" },
  { quote: "Try not to cry while driving.", source: "The Book Thief" },

  // 16. Pride and Prejudice (1813)
  { quote: "I could easily forgive his pride, if he had not mortified mine.", source: "Pride and Prejudice" },
  { quote: "Rosamund Pike reading Austen is pure British elegance.", source: "Pride and Prejudice" },
  { quote: "Mr. Darcy ignoring everyone for 15 hours straight.", source: "Pride and Prejudice" },

  // 17. 1984 (1949)
  { quote: "Who controls the past controls the future. Who controls the present controls the past.", source: "1984" },
  { quote: "Simon Prebble captures the bleakness of Oceania perfectly.", source: "1984" },
  { quote: "We are the dead (and my commute is too long).", source: "1984" },

  // 18. To Kill a Mockingbird (1960)
  { quote: "You never really understand a person until you consider things from his point of view.", source: "To Kill a Mockingbird" },
  { quote: "Sissy Spacek brings Scout's innocence and wisdom to life.", source: "To Kill a Mockingbird" },
  { quote: "It's a sin to listen to anything else today.", source: "To Kill a Mockingbird" },

  // 19. Dune (1965)
  { quote: "I must not fear. Fear is the mind-killer.", source: "Dune" },
  { quote: "A huge ensemble cast, but they randomly switch out halfway through chapters.", source: "Dune" },
  { quote: "The spice must flow, even into my earbuds.", source: "Dune" },

  // 20. Bossypants (2011)
  { quote: "You can't be that kid standing at the top of the waterslide, overthinking it.", source: "Bossypants" },
  { quote: "Tina Fey reading her own jokes with impeccable comedic timing.", source: "Bossypants" },
  { quote: "Yes, and...", source: "Bossypants" },

  // 21. Sapiens: A Brief History of Humankind (2011)
  { quote: "Biology enables, Culture forbids.", source: "Sapiens: A Brief History of Humankind" },
  { quote: "Derek Perkins explaining why we gossip and believe in imaginary entities.", source: "Sapiens: A Brief History of Humankind" },
  { quote: "Wait, we just out-gossiped the Neanderthals?", source: "Sapiens: A Brief History of Humankind" },

  // 22. Atomic Habits (2018)
  { quote: "You do not rise to the level of your goals. You fall to the level of your systems.", source: "Atomic Habits" },
  { quote: "James Clear reads his own manual for getting 1% better every day.", source: "Atomic Habits" },
  { quote: "Listening to this at 2x speed for maximum productivity.", source: "Atomic Habits" },

  // 23. Mythos (2017)
  { quote: "The Greeks created gods that were in their image; warlike but fond of dancing.", source: "Mythos" },
  { quote: "Stephen Fry telling modern versions of Greek myths is pure joy.", source: "Mythos" },
  { quote: "Zeus, no! (The explanation for basically every Greek myth)", source: "Mythos" },

  // 24. Outlander (1991)
  { quote: "For where all love is, the speaking is unnecessary.", source: "Outlander" },
  { quote: "Davina Porter's seamless transitions between Scottish accents.", source: "Outlander" },
  { quote: "Je suis prest to sit in traffic and listen to Jamie Fraser.", source: "Outlander" },

  // 25. A Game of Thrones (1996)
  { quote: "Never forget what you are, for surely the world will not.", source: "A Game of Thrones" },
  { quote: "Roy Dotrice voicing hundreds of characters, sometimes changing their accents entirely.", source: "A Game of Thrones" },
  { quote: "Petyr 'Pee-tire' Baelish.", source: "A Game of Thrones" },

  // 26. The Girl on the Train (2015)
  { quote: "Hollow: I understand the meaning of the word. I am empty.", source: "The Girl on the Train" },
  { quote: "Three separate narrators for three very unreliable women.", source: "The Girl on the Train" },
  { quote: "Gaslighting: The Audiobook.", source: "The Girl on the Train" },

  // 27. The Goldfinch (2013)
  { quote: "We are so accustomed to disguise ourselves to others, that in the end, we become disguised to ourselves.", source: "The Goldfinch" },
  { quote: "David Pittu narrating 32 hours of trauma and art theft.", source: "The Goldfinch" },
  { quote: "Boris's Ukrainian accent carrying the entire story.", source: "The Goldfinch" },

  // 28. The Help (2009)
  { quote: "You is kind. You is smart. You is important.", source: "The Help" },
  { quote: "Four phenomenal voice actors bringing Jackson, Mississippi to life.", source: "The Help" },
  { quote: "The terrible awful, narrated in high definition.", source: "The Help" },

  // 29. Ender's Game (1985)
  { quote: "The enemy's gate is down.", source: "Ender's Game" },
  { quote: "Stefan Rudnicki's booming voice as the adults manipulating children.", source: "Ender's Game" },
  { quote: "Wait, the simulation was real?", source: "Ender's Game" },

  // 30. The Handmaid's Tale (1985)
  { quote: "Don't let the bastards grind you down.", source: "The Handmaid's Tale" },
  { quote: "Claire Danes delivering a quiet, desperate narration.", source: "The Handmaid's Tale" },
  { quote: "Under His Eye (and my headphones).", source: "The Handmaid's Tale" },

  // 31. Talking to Strangers (2019)
  { quote: "We think we can easily see into the hearts of others based on the flimsiest of clues.", source: "Talking to Strangers" },
  { quote: "An audiobook structured less like a book and more like a high-end podcast.", source: "Talking to Strangers" },
  { quote: "Malcolm Gladwell using sound bites to blow your mind.", source: "Talking to Strangers" },

  // 32. Never Let Me Go (2005)
  { quote: "Memories, even your most precious ones, fade surprisingly quickly.", source: "Never Let Me Go" },
  { quote: "Rosalyn Landor's wistful narration of clones facing their fate.", source: "Never Let Me Go" },
  { quote: "The most depressing British boarding school.", source: "Never Let Me Go" },

  // 33. The Night Circus (2011)
  { quote: "The circus arrives without warning.", source: "The Night Circus" },
  { quote: "Jim Dale bringing his magical voice to a magical competition.", source: "The Night Circus" },
  { quote: "Smelling caramel apples through your AirPods.", source: "The Night Circus" }
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
console.log("Successfully written audiobooks 1-33!");
