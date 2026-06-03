import fs from 'fs';

const BOOK_QUOTES = [
  // 34. Ulysses
  { quote: "Yes I said yes I will Yes.", source: "Ulysses" },
  { quote: "Leopold Bloom's walk around Dublin.", source: "Ulysses" },
  { quote: "A 700-page book about a completely normal Thursday.", source: "Ulysses" },
  // 35. The Great Gatsby
  { quote: "So we beat on, boats against the current, borne back ceaselessly into the past.", source: "The Great Gatsby" },
  { quote: "The green light at the end of Daisy's dock.", source: "The Great Gatsby" },
  { quote: "Old sport.", source: "The Great Gatsby" },
  // 36. The Sun Also Rises
  { quote: "Isn't it pretty to think so?", source: "The Sun Also Rises" },
  { quote: "Running with the bulls in Pamplona.", source: "The Sun Also Rises" },
  { quote: "The Lost Generation getting drunk in Europe.", source: "The Sun Also Rises" },
  // 37. To the Lighthouse
  { quote: "What is the meaning of life? That was all - a simple question; one that tended to close in on one with years.", source: "To the Lighthouse" },
  { quote: "The passage of Time Passes.", source: "To the Lighthouse" },
  { quote: "Stream of consciousness intensifies.", source: "To the Lighthouse" },
  // 38. All Quiet on the Western Front
  { quote: "I am young, I am twenty years old; yet I know nothing of life but despair, death, fear.", source: "All Quiet on the Western Front" },
  { quote: "Paul Bäumer's return to the front.", source: "All Quiet on the Western Front" },
  { quote: "Reaching for a butterfly.", source: "All Quiet on the Western Front" },
  // 39. The Sound and the Fury
  { quote: "I give you the mausoleum of all hope and desire.", source: "The Sound and the Fury" },
  { quote: "Benjy's fractured timeline.", source: "The Sound and the Fury" },
  { quote: "A tragic southern gothic tale.", source: "The Sound and the Fury" },
  // 40. Brave New World
  { quote: "O brave new world, that has such people in it!", source: "Brave New World" },
  { quote: "Taking Soma to forget your problems.", source: "Brave New World" },
  { quote: "Orgy-porgy.", source: "Brave New World" },
  // 41. The Hobbit
  { quote: "In a hole in the ground there lived a hobbit.", source: "The Hobbit" },
  { quote: "Riddles in the dark with Gollum.", source: "The Hobbit" },
  { quote: "Going on an adventure without a pocket handkerchief.", source: "The Hobbit" },
  // 42. Their Eyes Were Watching God
  { quote: "There are years that ask questions and years that answer.", source: "Their Eyes Were Watching God" },
  { quote: "Janie's return to Eatonville.", source: "Their Eyes Were Watching God" },
  { quote: "Tea Cake and the hurricane.", source: "Their Eyes Were Watching God" },
  // 43. The Grapes of Wrath
  { quote: "Wherever they's a fight so hungry people can eat, I'll be there.", source: "The Grapes of Wrath" },
  { quote: "The long journey on Route 66.", source: "The Grapes of Wrath" },
  { quote: "The turtle crossing the road.", source: "The Grapes of Wrath" },
  // 44. The Stranger
  { quote: "Mother died today. Or maybe yesterday; I can't be sure.", source: "The Stranger" },
  { quote: "The glaring Algerian sun.", source: "The Stranger" },
  { quote: "Blaming a murder on the weather.", source: "The Stranger" },
  // 45. The Little Prince
  { quote: "It is only with the heart that one can see rightly; what is essential is invisible to the eye.", source: "The Little Prince" },
  { quote: "Taming the fox.", source: "The Little Prince" },
  { quote: "A hat? No, it's a boa constrictor digesting an elephant.", source: "The Little Prince" },
  // 46. Animal Farm
  { quote: "All animals are equal, but some animals are more equal than others.", source: "Animal Farm" },
  { quote: "Boxer's tragic fate.", source: "Animal Farm" },
  { quote: "Pigs walking on two legs.", source: "Animal Farm" },
  // 47. 1984
  { quote: "War is peace. Freedom is slavery. Ignorance is strength.", source: "1984" },
  { quote: "Big Brother is watching you.", source: "1984" },
  { quote: "Room 101 and the rats.", source: "1984" },
  // 48. The Catcher in the Rye
  { quote: "Don't ever tell anybody anything. If you do, you start missing everybody.", source: "The Catcher in the Rye" },
  { quote: "Holden wearing his red hunting hat.", source: "The Catcher in the Rye" },
  { quote: "Calling everyone a phony.", source: "The Catcher in the Rye" },
  // 49. Invisible Man
  { quote: "I am invisible, understand, simply because people refuse to see me.", source: "Invisible Man" },
  { quote: "The Battle Royal.", source: "Invisible Man" },
  { quote: "Stealing power from Monopolated Light & Power.", source: "Invisible Man" },
  // 50. Fahrenheit 451
  { quote: "It was a pleasure to burn.", source: "Fahrenheit 451" },
  { quote: "Guy Montag the fireman.", source: "Fahrenheit 451" },
  { quote: "Mechanical hounds tracking you down.", source: "Fahrenheit 451" },
  // 51. Lord of the Flies
  { quote: "Kill the pig. Cut her throat. Spill her blood.", source: "Lord of the Flies" },
  { quote: "The conch shell shattering.", source: "Lord of the Flies" },
  { quote: "Kids left alone for five minutes: society collapses.", source: "Lord of the Flies" },
  // 52. The Lord of the Rings
  { quote: "Not all those who wander are lost.", source: "The Lord of the Rings" },
  { quote: "Destroying the One Ring in Mount Doom.", source: "The Lord of the Rings" },
  { quote: "Walking all the way to Mordor because the eagles were busy.", source: "The Lord of the Rings" },
  // 53. Lolita
  { quote: "Light of my life, fire of my loins.", source: "Lolita" },
  { quote: "Humbert Humbert's unreliable narration.", source: "Lolita" },
  { quote: "An unreliable narrator on a road trip of horrors.", source: "Lolita" },
  // 54. Things Fall Apart
  { quote: "Turning and turning in the widening gyre.", source: "Things Fall Apart" },
  { quote: "Okonkwo's tragic adherence to tradition.", source: "Things Fall Apart" },
  { quote: "The arrival of the missionaries.", source: "Things Fall Apart" },
  // 55. To Kill a Mockingbird
  { quote: "You never really understand a person until you consider things from his point of view.", source: "To Kill a Mockingbird" },
  { quote: "Atticus Finch in the courtroom.", source: "To Kill a Mockingbird" },
  { quote: "It's a sin to kill a mockingbird.", source: "To Kill a Mockingbird" },
  // 56. Catch-22
  { quote: "Just because you're paranoid doesn't mean they aren't after you.", source: "Catch-22" },
  { quote: "Yossarian wants out of the war.", source: "Catch-22" },
  { quote: "A bureaucratic paradox.", source: "Catch-22" },
  // 57. A Wrinkle in Time
  { quote: "It was a dark and stormy night.", source: "A Wrinkle in Time" },
  { quote: "Tessering across the universe.", source: "A Wrinkle in Time" },
  { quote: "IT, the giant pulsing brain of Camazotz.", source: "A Wrinkle in Time" },
  // 58. One Flew Over the Cuckoo's Nest
  { quote: "But I tried though. Goddammit, I sure as hell did that much, now, didn't I?", source: "One Flew Over the Cuckoo's Nest" },
  { quote: "Nurse Ratched's absolute control.", source: "One Flew Over the Cuckoo's Nest" },
  { quote: "McMurphy disrupting the ward's schedule.", source: "One Flew Over the Cuckoo's Nest" },
  // 59. The Bell Jar
  { quote: "I took a deep breath and listened to the old brag of my heart: I am, I am, I am.", source: "The Bell Jar" },
  { quote: "Esther Greenwood's descent into depression.", source: "The Bell Jar" },
  { quote: "The fig tree.", source: "The Bell Jar" },
  // 60. Dune
  { quote: "I must not fear. Fear is the mind-killer.", source: "Dune" },
  { quote: "He who controls the spice controls the universe.", source: "Dune" },
  { quote: "Walking without rhythm so you don't attract the worm.", source: "Dune" },
  // 61. In Cold Blood
  { quote: "Four shotgun blasts that, all told, ended six human lives.", source: "In Cold Blood" },
  { quote: "Creating the true crime genre.", source: "In Cold Blood" },
  { quote: "Truman Capote getting way too close to his subjects.", source: "In Cold Blood" },
  // 62. One Hundred Years of Solitude
  { quote: "Many years later, as he faced the firing squad, Colonel Aureliano Buendía was to remember that distant afternoon when his father took him to discover ice.", source: "One Hundred Years of Solitude" },
  { quote: "Macondo.", source: "One Hundred Years of Solitude" },
  { quote: "Everyone is named Aureliano or José Arcadio.", source: "One Hundred Years of Solitude" },
  // 63. Do Androids Dream of Electric Sheep?
  { quote: "You will be required to do wrong no matter where you go. It is the basic condition of life.", source: "Do Androids Dream of Electric Sheep?" },
  { quote: "Rick Deckard retiring replicants.", source: "Do Androids Dream of Electric Sheep?" },
  { quote: "The Voight-Kampff test.", source: "Do Androids Dream of Electric Sheep?" },
  // 64. Slaughterhouse-Five
  { quote: "So it goes.", source: "Slaughterhouse-Five" },
  { quote: "Billy Pilgrim has become unstuck in time.", source: "Slaughterhouse-Five" },
  { quote: "Tralfamadorians keeping humans in a zoo.", source: "Slaughterhouse-Five" },
  // 65. The Left Hand of Darkness
  { quote: "Light is the left hand of darkness and darkness the right hand of light.", source: "The Left Hand of Darkness" },
  { quote: "Genly Ai navigating the politics of Gethen.", source: "The Left Hand of Darkness" },
  { quote: "A world without fixed gender.", source: "The Left Hand of Darkness" },
  // 66. Watership Down
  { quote: "All the world will be your enemy, Prince with a Thousand Enemies.", source: "Watership Down" },
  { quote: "Fiver's bloody vision.", source: "Watership Down" },
  { quote: "It's just a cute book about rabbits, they said. It'll be fun, they said.", source: "Watership Down" }
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
console.log("Successfully written books 34-66!");
