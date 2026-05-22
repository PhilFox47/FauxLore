import fs from 'fs';

const BOOK_QUOTES = [
  // 1. The Epic of Gilgamesh
  { quote: "He who has seen everything, I will make known to the lands.", source: "The Epic of Gilgamesh" },
  { quote: "Enkidu, my brother.", source: "The Epic of Gilgamesh" },
  { quote: "Searching for immortality and failing.", source: "The Epic of Gilgamesh" },
  // 2. The Iliad
  { quote: "Sing, O muse, of the rage of Achilles, son of Peleus.", source: "The Iliad" },
  { quote: "Hector's body dragging behind the chariot.", source: "The Iliad" },
  { quote: "The original bromance: Achilles and Patroclus.", source: "The Iliad" },
  // 3. The Odyssey
  { quote: "Tell me, O muse, of that ingenious hero who travelled far and wide.", source: "The Odyssey" },
  { quote: "Nobody is blinding me!", source: "The Odyssey" },
  { quote: "Taking 10 years to ask for directions.", source: "The Odyssey" },
  // 4. The Republic
  { quote: "The heaviest penalty for declining to rule is to be ruled by someone inferior to yourself.", source: "The Republic" },
  { quote: "Allegory of the Cave.", source: "The Republic" },
  { quote: "Philosopher kings looking at shadows.", source: "The Republic" },
  // 5. Beowulf
  { quote: "Hwæt! We Gar-Dena in gear-dagum, peod-cyninga, þrym gefrunon.", source: "Beowulf" },
  { quote: "Ripping Grendel's arm off.", source: "Beowulf" },
  { quote: "Fighting a dragon when you're way past retirement age.", source: "Beowulf" },
  // 6. The Divine Comedy
  { quote: "Abandon all hope, ye who enter here.", source: "The Divine Comedy" },
  { quote: "Ascending Mount Purgatory.", source: "The Divine Comedy" },
  { quote: "Writing a self-insert fanfic to put all your enemies in hell.", source: "The Divine Comedy" },
  // 7. The Canterbury Tales
  { quote: "Whan that Aprille with his shoures soote...", source: "The Canterbury Tales" },
  { quote: "The Wife of Bath's progressive opinions.", source: "The Canterbury Tales" },
  { quote: "The Miller's Tale involves a lot of farting.", source: "The Canterbury Tales" },
  // 8. Don Quixote
  { quote: "Finally, from so little sleeping and so much reading, his brain dried up and he went completely out of his mind.", source: "Don Quixote" },
  { quote: "Tilting at windmills.", source: "Don Quixote" },
  { quote: "Sancho Panza trying to keep reality intact.", source: "Don Quixote" },
  // 9. Paradise Lost
  { quote: "Better to reign in Hell, than serve in Heaven.", source: "Paradise Lost" },
  { quote: "Pandemonium.", source: "Paradise Lost" },
  { quote: "Satan accidentally being the most compelling character.", source: "Paradise Lost" },
  // 10. Gulliver's Travels
  { quote: "Every man desires to live long, but no man wishes to be old.", source: "Gulliver's Travels" },
  { quote: "Lilliputians and Brobdingnagians.", source: "Gulliver's Travels" },
  { quote: "A modest proposal of an adventure.", source: "Gulliver's Travels" },
  // 11. Candide
  { quote: "We must cultivate our garden.", source: "Candide" },
  { quote: "The best of all possible worlds.", source: "Candide" },
  { quote: "Pangloss refusing to read the room.", source: "Candide" },
  // 12. Pride and Prejudice
  { quote: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.", source: "Pride and Prejudice" },
  { quote: "Mr. Darcy's awkward proposal.", source: "Pride and Prejudice" },
  { quote: "Elizabeth Bennet giving peak side-eye.", source: "Pride and Prejudice" },
  // 13. Frankenstein
  { quote: "Beware; for I am fearless, and therefore powerful.", source: "Frankenstein" },
  { quote: "The modern Prometheus.", source: "Frankenstein" },
  { quote: "Knowledge is knowing Frankenstein isn't the monster. Wisdom is knowing Frankenstein IS the monster.", source: "Frankenstein" },
  // 14. The Count of Monte Cristo
  { quote: "All human wisdom is contained in these two words: Wait and hope.", source: "The Count of Monte Cristo" },
  { quote: "Château d'If escape.", source: "The Count of Monte Cristo" },
  { quote: "The ultimate 10-year revenge plot.", source: "The Count of Monte Cristo" },
  // 15. Jane Eyre
  { quote: "I am no bird; and no net ensnares me.", source: "Jane Eyre" },
  { quote: "The madwoman in the attic.", source: "Jane Eyre" },
  { quote: "Reader, I married him.", source: "Jane Eyre" },
  // 16. Wuthering Heights
  { quote: "Whatever our souls are made of, his and mine are the same.", source: "Wuthering Heights" },
  { quote: "Heathcliff roaming the moors.", source: "Wuthering Heights" },
  { quote: "Every single character making the worst possible choices.", source: "Wuthering Heights" },
  // 17. Moby-Dick
  { quote: "Call me Ishmael.", source: "Moby-Dick" },
  { quote: "Ahab's obsession with the white whale.", source: "Moby-Dick" },
  { quote: "Skimming past the 50 pages about whale anatomy.", source: "Moby-Dick" },
  // 18. Madame Bovary
  { quote: "She wanted to die, but she also wanted to live in Paris.", source: "Madame Bovary" },
  { quote: "Arsenic makes for a bad time.", source: "Madame Bovary" },
  { quote: "Emma mistaking romance novels for reality.", source: "Madame Bovary" },
  // 19. A Tale of Two Cities
  { quote: "It was the best of times, it was the worst of times.", source: "A Tale of Two Cities" },
  { quote: "Sydney Carton's sacrifice.", source: "A Tale of Two Cities" },
  { quote: "Madame Defarge knitting lists of names.", source: "A Tale of Two Cities" },
  // 20. Les Misérables
  { quote: "To love another person is to see the face of God.", source: "Les Misérables" },
  { quote: "Inspector Javert's relentless pursuit.", source: "Les Misérables" },
  { quote: "Stealing one loaf of bread equals 19 years.", source: "Les Misérables" },
  // 21. Alice's Adventures in Wonderland
  { quote: "Curiouser and curiouser!", source: "Alice's Adventures in Wonderland" },
  { quote: "Down the rabbit hole.", source: "Alice's Adventures in Wonderland" },
  { quote: "We're all mad here.", source: "Alice's Adventures in Wonderland" },
  // 22. Crime and Punishment
  { quote: "Pain and suffering are always inevitable for a large intelligence and a deep heart.", source: "Crime and Punishment" },
  { quote: "Raskolnikov's fever dream of guilt.", source: "Crime and Punishment" },
  { quote: "Just an axe-wielding student rethinking his life choices.", source: "Crime and Punishment" },
  // 23. War and Peace
  { quote: "We can know only that we know nothing. And that is the highest degree of human wisdom.", source: "War and Peace" },
  { quote: "Napoleon marching into Russia.", source: "War and Peace" },
  { quote: "Trying to keep track of 500 characters' Russian nicknames.", source: "War and Peace" },
  // 24. Middlemarch
  { quote: "What do we live for, if it is not to make life less difficult to each other?", source: "Middlemarch" },
  { quote: "Dorothea Brooke's idealism.", source: "Middlemarch" },
  { quote: "Casaubon's endlessly unfinished Key to All Mythologies.", source: "Middlemarch" },
  // 25. Anna Karenina
  { quote: "Happy families are all alike; every unhappy family is unhappy in its own way.", source: "Anna Karenina" },
  { quote: "Levin mowing the lawn to find inner peace.", source: "Anna Karenina" },
  { quote: "Watch out for that train.", source: "Anna Karenina" },
  // 26. The Brothers Karamazov
  { quote: "If God does not exist, then everything is permitted.", source: "The Brothers Karamazov" },
  { quote: "The Grand Inquisitor.", source: "The Brothers Karamazov" },
  { quote: "Dysfunctional family gatherings: Russian edition.", source: "The Brothers Karamazov" },
  // 27. The Adventures of Huckleberry Finn
  { quote: "All right, then, I'll go to hell.", source: "The Adventures of Huckleberry Finn" },
  { quote: "Rafting down the Mississippi with Jim.", source: "The Adventures of Huckleberry Finn" },
  { quote: "Tom Sawyer making everything unnecessarily complicated.", source: "The Adventures of Huckleberry Finn" },
  // 28. The Picture of Dorian Gray
  { quote: "The only way to get rid of a temptation is to yield to it.", source: "The Picture of Dorian Gray" },
  { quote: "A portrait locked in the attic.", source: "The Picture of Dorian Gray" },
  { quote: "Lord Henry whispering toxic advice.", source: "The Picture of Dorian Gray" },
  // 29. Dracula
  { quote: "Listen to them, the children of the night. What music they make!", source: "Dracula" },
  { quote: "Jonathan Harker's terrifying stay in Transylvania.", source: "Dracula" },
  { quote: "Van Helsing handing out garlic like candy.", source: "Dracula" },
  // 30. Heart of Darkness
  { quote: "The horror! The horror!", source: "Heart of Darkness" },
  { quote: "Cruising down the Congo River.", source: "Heart of Darkness" },
  { quote: "Kurtz going completely off the grid.", source: "Heart of Darkness" },
  // 31. The Hound of the Baskervilles
  { quote: "Mr. Holmes, they were the footprints of a gigantic hound!", source: "The Hound of the Baskervilles" },
  { quote: "Grimpen Mire.", source: "The Hound of the Baskervilles" },
  { quote: "Watson getting sent to a deadly moor alone.", source: "The Hound of the Baskervilles" },
  // 32. In Search of Lost Time
  { quote: "The true paradises are the paradises that we have lost.", source: "In Search of Lost Time" },
  { quote: "The taste of a madeleine dipped in tea.", source: "In Search of Lost Time" },
  { quote: "7 volumes of remembering stuff.", source: "In Search of Lost Time" },
  // 33. The Metamorphosis
  { quote: "As Gregor Samsa awoke one morning from uneasy dreams he found himself transformed in his bed into a gigantic insect.", source: "The Metamorphosis" },
  { quote: "An apple lodged in the back.", source: "The Metamorphosis" },
  { quote: "The worst case of taking a sick day ever.", source: "The Metamorphosis" }
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
console.log("Successfully written books 1-33!");
