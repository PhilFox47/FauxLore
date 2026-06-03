import fs from 'fs';

const AUDIOBOOK_QUOTES = [
  // 34. The Name of the Wind (2007)
  { quote: "It was the patient, cut-flower sound of a man who is waiting to die.", source: "The Name of the Wind" },
  { quote: "Nick Podehl giving Kvothe the perfect arrogant but compelling voice.", source: "The Name of the Wind" },
  { quote: "Three silence parts, zero third books.", source: "The Name of the Wind" },

  // 35. American Gods (2001)
  { quote: "Religions are, by definition, metaphors.", source: "American Gods" },
  { quote: "The full cast 10th anniversary edition makes the road trip epic.", source: "American Gods" },
  { quote: "Shadow Moon getting beat up in every state.", source: "American Gods" },

  // 36. I'm Glad My Mom Died (2022)
  { quote: "I was conditioned to believe any boundary I wanted was a betrayal of her.", source: "I'm Glad My Mom Died" },
  { quote: "Jennette McCurdy reading her own heartbreaking and hilarious memoir.", source: "I'm Glad My Mom Died" },
  { quote: "The most ruthless title in the self-help section.", source: "I'm Glad My Mom Died" },

  // 37. Greenlights (2020)
  { quote: "Sometimes you gotta go back to go forward.", source: "Greenlights" },
  { quote: "Matthew McConaughey turning a memoir into a 7-hour fireside chat.", source: "Greenlights" },
  { quote: "Alright, alright, alright. (You knew it was coming)", source: "Greenlights" },

  // 38. Spare (2023)
  { quote: "I was brought into the world in case something happened to Willy.", source: "Spare" },
  { quote: "Prince Harry reading his own story, frostbitten todger and all.", source: "Spare" },
  { quote: "Elizabeth Arden cream has never been the same.", source: "Spare" },

  // 39. Can't Hurt Me (2018)
  { quote: "You are in danger of living a life so comfortable and soft, that you will die without ever realizing your true potential.", source: "Can't Hurt Me" },
  { quote: "David Goggins stopping the audiobook every chapter to do a podcast-style debrief.", source: "Can't Hurt Me" },
  { quote: "They don't know me son!", source: "Can't Hurt Me" },

  // 40. The Silent Patient (2019)
  { quote: "We are all crazy, I believe, just in different ways.", source: "The Silent Patient" },
  { quote: "Jack Hawkins and Louise Brealey navigating Alicia's silence.", source: "The Silent Patient" },
  { quote: "Diary entries narrated out loud kind of defeat the purpose of silence.", source: "The Silent Patient" },

  // 41. The Seven Husbands of Evelyn Hugo (2017)
  { quote: "Never let anyone make you feel ordinary.", source: "The Seven Husbands of Evelyn Hugo" },
  { quote: "Alma Cuervo giving Evelyn that perfect gravelly Hollywood elite voice.", source: "The Seven Husbands of Evelyn Hugo" },
  { quote: "When you marry seven times but only love one woman.", source: "The Seven Husbands of Evelyn Hugo" },

  // 42. Circe (2018)
  { quote: "A golden cage is still a cage.", source: "Circe" },
  { quote: "Perdita Weeks uses her silvery voice to turn a witch into a feminist icon.", source: "Circe" },
  { quote: "POV: You've been exiled to an island and keep turning men into pigs.", source: "Circe" },

  // 43. A Man Called Ove (2012)
  { quote: "People said Ove saw the world in black and white. But she was color.", source: "A Man Called Ove" },
  { quote: "George Newbern perfectly capturing the curmudgeonly grunts.", source: "A Man Called Ove" },
  { quote: "Just a grumpy Swedish man checking regulations.", source: "A Man Called Ove" },

  // 44. Good Omens (1990)
  { quote: "Most of the great triumphs and tragedies of history are caused, not by people being fundamentally good or fundamentally bad, but by people being fundamentally people.", source: "Good Omens" },
  { quote: "Martin Jarvis voicing an angel, a demon, and the Antichrist.", source: "Good Omens" },
  { quote: "Every cassette tape left in a car eventually turns into Best of Queen.", source: "Good Omens" },

  // 45. Frankenstein (1818)
  { quote: "Beware; for I am fearless, and therefore powerful.", source: "Frankenstein" },
  { quote: "Dan Stevens bringing life to the creature's sorrow.", source: "Frankenstein" },
  { quote: "Victor Frankenstein making the worst post-grad project ever.", source: "Frankenstein" },

  // 46. Dracula (1897)
  { quote: "Listen to them, the children of the night. What music they make!", source: "Dracula" },
  { quote: "Alan Cumming and Tim Curry making the most terrifying full-cast production.", source: "Dracula" },
  { quote: "Jonathan Harker writing in his diary while being bled dry.", source: "Dracula" },

  // 47. The Great Gatsby (1925)
  { quote: "And so with the sunshine and the great bursts of leaves growing on the trees, just as things grow in fast movies, I had that familiar conviction that life was beginning over again with the summer.", source: "The Great Gatsby" },
  { quote: "Jake Gyllenhaal performing Fitzgerald's prose with incredible smoothness.", source: "The Great Gatsby" },
  { quote: "Old sport.", source: "The Great Gatsby" },

  // 48. Jane Eyre (1847)
  { quote: "I am no bird; and no net ensnares me: I am a free human being with an independent will.", source: "Jane Eyre" },
  { quote: "Thandiwe Newton's powerful rendition of the resilient governess.", source: "Jane Eyre" },
  { quote: "Red room trauma.", source: "Jane Eyre" },

  // 49. The Alchemist (1988)
  { quote: "And, when you want something, all the universe conspires in helping you to achieve it.", source: "The Alchemist" },
  { quote: "Jeremy Irons reading a philosophical fable makes it sound extra profound.", source: "The Alchemist" },
  { quote: "Just following some hawks to find treasure.", source: "The Alchemist" },

  // 50. The Kite Runner (2003)
  { quote: "For you, a thousand times over.", source: "The Kite Runner" },
  { quote: "Khaled Hosseini reading his own devastatingly emotional novel.", source: "The Kite Runner" },
  { quote: "Running kites and breaking hearts.", source: "The Kite Runner" },

  // 51. The Midnight Library (2020)
  { quote: "Never underestimate the big importance of small things.", source: "The Midnight Library" },
  { quote: "Carey Mulligan guiding us through the library of alternate lives.", source: "The Midnight Library" },
  { quote: "Librarian Mrs. Elm dealing with all the parallel universes.", source: "The Midnight Library" },

  // 52. Tomorrow, and Tomorrow, and Tomorrow (2022)
  { quote: "What is a game? It's tomorrow, and tomorrow, and tomorrow.", source: "Tomorrow, and Tomorrow, and Tomorrow" },
  { quote: "Jennifer Kim and Julian Cihi perfectly capturing the decades-long friendship.", source: "Tomorrow, and Tomorrow, and Tomorrow" },
  { quote: "Just two friends refusing to go to therapy.", source: "Tomorrow, and Tomorrow, and Tomorrow" },

  // 53. The Hunger Games (2008)
  { quote: "May the odds be ever in your favor.", source: "The Hunger Games" },
  { quote: "Tatiana Maslany reading the special edition with incredible intensity.", source: "The Hunger Games" },
  { quote: "Peeta blending into a rock.", source: "The Hunger Games" },

  // 54. The Boy in the Striped Pajamas (2006)
  { quote: "Sitting around miserable all day won't make you any happier.", source: "The Boy in the Striped Pajamas" },
  { quote: "Michael Maloney's devastatingly innocent delivery.", source: "The Boy in the Striped Pajamas" },
  { quote: "Historical inaccuracy for the sake of tragedy.", source: "The Boy in the Striped Pajamas" },

  // 55. A Court of Thorns and Roses (2015)
  { quote: "Be glad of your human heart, Feyre. Pity those who don't feel anything at all.", source: "A Court of Thorns and Roses" },
  { quote: "Jennifer Ikeda and GraphicAudio bringing the Spring Court alive.", source: "A Court of Thorns and Roses" },
  { quote: "The cauldron boils.", source: "A Court of Thorns and Roses" },

  // 56. Fourth Wing (2023)
  { quote: "A dragon without its rider is a tragedy. A rider without their dragon is dead.", source: "Fourth Wing" },
  { quote: "Rebecca Soler narrating with someone occasionally coughing in the background.", source: "Fourth Wing" },
  { quote: "GraphicAudio adding dragon roars directly into your eardrums.", source: "Fourth Wing" },

  // 57. Remarkably Bright Creatures (2022)
  { quote: "Humans. For the most part, you are dull and blundering. But occasionally, you can be remarkably bright creatures.", source: "Remarkably Bright Creatures" },
  { quote: "Michael Urie voicing a grumpy, captive giant Pacific octopus.", source: "Remarkably Bright Creatures" },
  { quote: "Marcellus knows everything.", source: "Remarkably Bright Creatures" },

  // 58. Lessons in Chemistry (2022)
  { quote: "Children, set the table. Your mother needs a moment to herself.", source: "Lessons in Chemistry" },
  { quote: "Miranda Raison bringing Elizabeth Zott's uncompromising brilliance to life.", source: "Lessons in Chemistry" },
  { quote: "Cooking is just chemistry.", source: "Lessons in Chemistry" },

  // 59. Fairy Tale (2022)
  { quote: "Time is water, Charlie.", source: "Fairy Tale" },
  { quote: "Seth Numrich narrating a boy and his dog descending into another world.", source: "Fairy Tale" },
  { quote: "Stephen King can't write a book without a magic dog.", source: "Fairy Tale" },

  // 60. It (1986)
  { quote: "We all float down here.", source: "It" },
  { quote: "Steven Weber performing for 44 hours, descending into utter madness.", source: "It" },
  { quote: "Pennywise's stutter through the speakers.", source: "It" },

  // 61. The Stand (1978)
  { quote: "Show me a man or a woman alone and I'll show you a saint. Give me two and they'll fall in love. Give me three and they'll invent the charming thing we call 'society'. Give me four and they'll build a pyramid. Give me five and they'll make one an outcast. Give me six and they'll reinvent prejudice. Give me seven and in seven years they'll reinvent warfare.", source: "The Stand" },
  { quote: "Grover Gardner guiding you through 47 hours of post-apocalyptic survival.", source: "The Stand" },
  { quote: "Captain Trips sneezes.", source: "The Stand" },

  // 62. The Body Keeps the Score (2014)
  { quote: "Trauma fact destroys the fabric of time.", source: "The Body Keeps the Score" },
  { quote: "Sean Pratt narrating one of the heaviest psychology books ever written.", source: "The Body Keeps the Score" },
  { quote: "My therapist recommended this audiobook.", source: "The Body Keeps the Score" },

  // 63. Think Again (2021)
  { quote: "If knowledge is power, knowing what we don't know is wisdom.", source: "Think Again" },
  { quote: "Adam Grant reading his own organizational psychology insights.", source: "Think Again" },
  { quote: "Time to unlearn everything you know.", source: "Think Again" },

  // 64. Outliers (2008)
  { quote: "Practice isn't the thing you do once you're good. It's the thing you do that makes you good.", source: "Outliers" },
  { quote: "Malcolm Gladwell teaching you the 10,000-hour rule.", source: "Outliers" },
  { quote: "Just need to be a Canadian hockey player born in January.", source: "Outliers" },

  // 65. A Promised Land (2020)
  { quote: "My identity might begin with the fact of my race, but it didn't, couldn't end there.", source: "A Promised Land" },
  { quote: "Barack Obama's soothing cadence lasting for 29 hours.", source: "A Promised Land" },
  { quote: "Let me be clear.", source: "A Promised Land" },

  // 66. Me Talk Pretty One Day (2000)
  { quote: "Every day we're told that we live in the greatest country on earth. And it's always stated as an undeniable fact: Leos are born between July 23 and August 22, fitted therefore with plenty of leadership qualities; Americans are the best.", source: "Me Talk Pretty One Day" },
  { quote: "David Sedaris reading his own essays with his unmistakable lisp.", source: "Me Talk Pretty One Day" },
  { quote: "Learning French through pure humiliation.", source: "Me Talk Pretty One Day" }
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
console.log("Successfully written audiobooks 34-66!");
