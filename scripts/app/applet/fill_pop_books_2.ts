import fs from 'fs';

const POP_BOOKS_QUOTES = [
  // 34. It Ends with Us
  { quote: "Just because someone hurts you doesn't mean you can simply stop loving them.", source: "It Ends with Us" },
  { quote: "Lily Bloom.", source: "It Ends with Us" },
  { quote: "Ryle finding her journals.", source: "It Ends with Us" },

  // 35. Scythe
  { quote: "Thou shalt kill.", source: "Scythe" },
  { quote: "Rowan and Citra.", source: "Scythe" },
  { quote: "When the Cloud achieves godhood and ends natural death.", source: "Scythe" },

  // 36. A Court of Mist and Fury
  { quote: "To the people who look at the stars and wish, Rhys.", source: "A Court of Mist and Fury" },
  { quote: "The Night Court.", source: "A Court of Mist and Fury" },
  { quote: "Chapter 55.", source: "A Court of Mist and Fury" },

  // 37. Nevernight
  { quote: "The darker the night, the brighter the stars.", source: "Nevernight" },
  { quote: "Mia Corvere and Mister Kindly.", source: "Nevernight" },
  { quote: "Footnotes that are basically the author roasting you.", source: "Nevernight" },

  // 38. The Woman in Cabin 10
  { quote: "I was not a reliable witness, not even to my own life.", source: "The Woman in Cabin 10" },
  { quote: "Lo Blacklock on the Aurora.", source: "The Woman in Cabin 10" },
  { quote: "Claustrophobia on a luxury cruise.", source: "The Woman in Cabin 10" },

  // 39. Caraval
  { quote: "Remember, it's only a game.", source: "Caraval" },
  { quote: "Scarlett and Legend.", source: "Caraval" },
  { quote: "Is it real, or is it magic?", source: "Caraval" },

  // 40. The Seven Husbands of Evelyn Hugo
  { quote: "They are just husbands. I am Evelyn Hugo.", source: "The Seven Husbands of Evelyn Hugo" },
  { quote: "Celia St. James.", source: "The Seven Husbands of Evelyn Hugo" },
  { quote: "Monique realizing how she connects to the story.", source: "The Seven Husbands of Evelyn Hugo" },

  // 41. The Hate U Give
  { quote: "What's the point of having a voice if you're gonna be silent in those moments you shouldn't be?", source: "The Hate U Give" },
  { quote: "Starr Carter.", source: "The Hate U Give" },
  { quote: "THUG LIFE.", source: "The Hate U Give" },

  // 42. One of Us Is Lying
  { quote: "Things get clearer when you're not looking through a fake lens.", source: "One of Us Is Lying" },
  { quote: "Simon Kelleher's app.", source: "One of Us Is Lying" },
  { quote: "The Breakfast Club, but with murder.", source: "One of Us Is Lying" },

  // 43. Eleanor Oliphant Is Completely Fine
  { quote: "If someone asks you how you are, you are meant to say FINE.", source: "Eleanor Oliphant Is Completely Fine" },
  { quote: "Eleanor and Raymond.", source: "Eleanor Oliphant Is Completely Fine" },
  { quote: "She is, in fact, not completely fine.", source: "Eleanor Oliphant Is Completely Fine" },

  // 44. The Bear and the Nightingale
  { quote: "Blood is blood. It remembers.", source: "The Bear and the Nightingale" },
  { quote: "Vasya and the Frost Demon.", source: "The Bear and the Nightingale" },
  { quote: "Russian folklore making the cold feel even colder.", source: "The Bear and the Nightingale" },

  // 45. Strange the Dreamer
  { quote: "I think you're a fairy tale. I think you're magical, and brave, and exquisite.", source: "Strange the Dreamer" },
  { quote: "Lazlo Strange and Weep.", source: "Strange the Dreamer" },
  { quote: "Blue gods and moth magic.", source: "Strange the Dreamer" },

  // 46. Where the Crawdads Sing
  { quote: "Sometimes she heard night-sounds she didn't know or jumped from lightning too close.", source: "Where the Crawdads Sing" },
  { quote: "Kya Clark, the Marsh Girl.", source: "Where the Crawdads Sing" },
  { quote: "Nature observing a murder trial.", source: "Where the Crawdads Sing" },

  // 47. The Cruel Prince
  { quote: "If I cannot be better than them, I will become so much worse.", source: "The Cruel Prince" },
  { quote: "Jude Duarte and Prince Cardan.", source: "The Cruel Prince" },
  { quote: "Bullying enemies to lovers.", source: "The Cruel Prince" },

  // 48. Normal People
  { quote: "It's funny the decisions you make when you like someone.", source: "Normal People" },
  { quote: "Connell and Marianne.", source: "Normal People" },
  { quote: "Miscommunication: The Novel.", source: "Normal People" },

  // 49. Children of Blood and Bone
  { quote: "We are all children of blood and bone.", source: "Children of Blood and Bone" },
  { quote: "Zélie and the maji.", source: "Children of Blood and Bone" },
  { quote: "Riding a lionaire into battle.", source: "Children of Blood and Bone" },

  // 50. Spinning Silver
  { quote: "The winter king has come for his gold.", source: "Spinning Silver" },
  { quote: "Miryem, Wanda, and Irina.", source: "Spinning Silver" },
  { quote: "Rumpelstiltskin meets financial independence.", source: "Spinning Silver" },

  // 51. The Poppy War
  { quote: "War doesn't determine who is right. War determines who remains.", source: "The Poppy War" },
  { quote: "Rin at Sinegard.", source: "The Poppy War" },
  { quote: "Going from 'magic school' to 'war crimes' real fast.", source: "The Poppy War" },

  // 52. The Silent Patient
  { quote: "We are all crazy, I believe, just in different ways.", source: "The Silent Patient" },
  { quote: "Alicia Berenson's silence.", source: "The Silent Patient" },
  { quote: "Theo Faber digging way too deep.", source: "The Silent Patient" },

  // 53. Daisy Jones & The Six
  { quote: "I had absolutely no interest in being somebody else's muse.", source: "Daisy Jones & The Six" },
  { quote: "Daisy and Billy Dunne.", source: "Daisy Jones & The Six" },
  { quote: "Fleetwood Mac vibes intensifies.", source: "Daisy Jones & The Six" },

  // 54. The Priory of the Orange Tree
  { quote: "No woman should be made to fear her own power.", source: "The Priory of the Orange Tree" },
  { quote: "Ead Duryan and Queen Sabran.", source: "The Priory of the Orange Tree" },
  { quote: "It's an 800-page standalone dragon epic.", source: "The Priory of the Orange Tree" },

  // 55. Red, White & Royal Blue
  { quote: "History, huh? Bet we could make some.", source: "Red, White & Royal Blue" },
  { quote: "Alex Claremont-Diaz and Prince Henry.", source: "Red, White & Royal Blue" },
  { quote: "Turkeys named Cornbread and Butter.", source: "Red, White & Royal Blue" },

  // 56. Ninth House
  { quote: "I want to survive this world that keeps trying to destroy me.", source: "Ninth House" },
  { quote: "Galaxy 'Alex' Stern.", source: "Ninth House" },
  { quote: "Yale secret societies, but with ghosts.", source: "Ninth House" },

  // 57. A Good Girl's Guide to Murder
  { quote: "Pip Fitz-Amobi.", source: "A Good Girl's Guide to Murder" },
  { quote: "Solving a murder for a school project.", source: "A Good Girl's Guide to Murder" },
  { quote: "And Andie Bell.", source: "A Good Girl's Guide to Murder" },

  // 58. The Starless Sea
  { quote: "For those who feel a pulling in their souls.", source: "The Starless Sea" },
  { quote: "Zachary Ezra Rawlins.", source: "The Starless Sea" },
  { quote: "A love letter to books hidden within a book.", source: "The Starless Sea" },

  // 59. House of Earth and Blood
  { quote: "Through love, all is possible.", source: "House of Earth and Blood" },
  { quote: "Bryce Quinlan and Hunt Athalar.", source: "House of Earth and Blood" },
  { quote: "The vacuum cleaner. If you know, you know.", source: "House of Earth and Blood" },

  // 60. The Midnight Library
  { quote: "Between life and death there is a library.", source: "The Midnight Library" },
  { quote: "Nora Seed's many lives.", source: "The Midnight Library" },
  { quote: "The Book of Regrets.", source: "The Midnight Library" },

  // 61. The Invisible Life of Addie LaRue
  { quote: "I remember you.", source: "The Invisible Life of Addie LaRue" },
  { quote: "Luc and Henry.", source: "The Invisible Life of Addie LaRue" },
  { quote: "Making a deal with the dark.", source: "The Invisible Life of Addie LaRue" },

  // 62. The Guest List
  { quote: "The bride, the plus one, the best man, the wedding planner.", source: "The Guest List" },
  { quote: "A wedding on an isolated Irish island.", source: "The Guest List" },
  { quote: "Everyone has a secret, and someone is dead.", source: "The Guest List" },

  // 63. From Blood and Ash
  { quote: "We will rise.", source: "From Blood and Ash" },
  { quote: "Poppy and Hawke.", source: "From Blood and Ash" },
  { quote: "The Maiden.", source: "From Blood and Ash" },

  // 64. Mexican Gothic
  { quote: "High Place.", source: "Mexican Gothic" },
  { quote: "Noemí Taboada.", source: "Mexican Gothic" },
  { quote: "Mushrooms are terrifying.", source: "Mexican Gothic" },

  // 65. Piranesi
  { quote: "The Beauty of the House is immeasurable.", source: "Piranesi" },
  { quote: "The Other.", source: "Piranesi" },
  { quote: "Endless halls of marble statues.", source: "Piranesi" },

  // 66. Iron Widow
  { quote: "I will not bow.", source: "Iron Widow" },
  { quote: "Zetian.", source: "Iron Widow" },
  { quote: "Pacific Rim meets empress Wu Zetian.", source: "Iron Widow" },

  // 67. Project Hail Mary
  { quote: "Amaze!", source: "Project Hail Mary" },
  { quote: "Ryland Grace and Rocky.", source: "Project Hail Mary" },
  { quote: "Jazz hands.", source: "Project Hail Mary" }
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
console.log("Successfully written popular books 34-67!");
