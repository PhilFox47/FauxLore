import fs from 'fs';

const POP_BOOKS_QUOTES = [
  // 1. Divergent
  { quote: "Fear doesn't shut you down; it wakes you up.", source: "Divergent" },
  { quote: "Choosing a faction.", source: "Divergent" },
  { quote: "Jumping off a moving train because walking is for the weak.", source: "Divergent" },

  // 2. Ready Player One
  { quote: "No one in the world ever gets what they want and that is beautiful.", source: "Ready Player One" },
  { quote: "The OASIS.", source: "Ready Player One" },
  { quote: "80s pop culture references: The Book.", source: "Ready Player One" },

  // 3. The Night Circus
  { quote: "The circus arrives without warning.", source: "The Night Circus" },
  { quote: "Celia and Marco.", source: "The Night Circus" },
  { quote: "Le Cirque des Rêves aesthetic.", source: "The Night Circus" },

  // 4. Miss Peregrine's Home for Peculiar Children
  { quote: "I used to dream about escaping my ordinary life, but my life was never ordinary.", source: "Miss Peregrine's Home for Peculiar Children" },
  { quote: "Loops and wights.", source: "Miss Peregrine's Home for Peculiar Children" },
  { quote: "Creepy vintage photos: The Book.", source: "Miss Peregrine's Home for Peculiar Children" },

  // 5. Daughter of Smoke & Bone
  { quote: "Once upon a time, an angel and a devil fell in love.", source: "Daughter of Smoke & Bone" },
  { quote: "Karou's blue hair.", source: "Daughter of Smoke & Bone" },
  { quote: "Collecting teeth for wishes doesn't sound creepy at all.", source: "Daughter of Smoke & Bone" },

  // 6. 11/22/63
  { quote: "The past is obdurate.", source: "11/22/63" },
  { quote: "Jake Epping going back in time.", source: "11/22/63" },
  { quote: "Turns out changing history gives the universe indigestion.", source: "11/22/63" },

  // 7. A Dance with Dragons
  { quote: "A reader lives a thousand lives before he dies.", source: "A Dance with Dragons" },
  { quote: "Daenerys on Drogon's back.", source: "A Dance with Dragons" },
  { quote: "Still waiting for the next book...", source: "A Dance with Dragons" },

  // 8. Shatter Me
  { quote: "I am a broken girl. I am an old tragedy.", source: "Shatter Me" },
  { quote: "Juliette's lethal touch.", source: "Shatter Me" },
  { quote: "Warner changing the entire plot dynamic.", source: "Shatter Me" },

  // 9. The Fault in Our Stars
  { quote: "Some infinities are bigger than other infinities.", source: "The Fault in Our Stars" },
  { quote: "Hazel Grace and Augustus Waters.", source: "The Fault in Our Stars" },
  { quote: "Okay? Okay.", source: "The Fault in Our Stars" },

  // 10. Throne of Glass
  { quote: "You could rattle the stars. You could do anything.", source: "Throne of Glass" },
  { quote: "Celaena Sardothien.", source: "Throne of Glass" },
  { quote: "An assassin who spends 90% of her time reading and shopping.", source: "Throne of Glass" },

  // 11. Shadow and Bone
  { quote: "Fine. Make me your villain.", source: "Shadow and Bone" },
  { quote: "The Sun Summoner.", source: "Shadow and Bone" },
  { quote: "The Darkling doing literally anything: everyone gasps.", source: "Shadow and Bone" },

  // 12. Cinder
  { quote: "Even in the future the story begins with Once Upon a Time.", source: "Cinder" },
  { quote: "Cyborg Cinderella.", source: "Cinder" },
  { quote: "Losing a cyborg foot instead of a glass slipper.", source: "Cinder" },

  // 13. Me Before You
  { quote: "You only get one life. It's actually your duty to live it as fully as possible.", source: "Me Before You" },
  { quote: "Louisa Clark's bumblebee tights.", source: "Me Before You" },
  { quote: "Bringing a whole box of tissues for the ending.", source: "Me Before You" },

  // 14. The Raven Boys
  { quote: "She wore red, but her name was Blue.", source: "The Raven Boys" },
  { quote: "Gansey's quest for Glendower.", source: "The Raven Boys" },
  { quote: "Dead Welsh kings and wealthy prep school boys.", source: "The Raven Boys" },

  // 15. Defending Jacob
  { quote: "The problem with kids is they don't know how fragile they are.", source: "Defending Jacob" },
  { quote: "Andy Barber's trial.", source: "Defending Jacob" },
  { quote: "The ending that makes you question everything.", source: "Defending Jacob" },

  // 16. The Ocean at the End of the Lane
  { quote: "I went away in my head, into a book. That was where I went whenever real life was too hard or too inflexible.", source: "The Ocean at the End of the Lane" },
  { quote: "Lettie Hempstock's pond.", source: "The Ocean at the End of the Lane" },
  { quote: "Getting a worm extracted from your foot by a fairy.", source: "The Ocean at the End of the Lane" },

  // 17. The Rosie Project
  { quote: "I am forty-nine years, eight months, and three days old.", source: "The Rosie Project" },
  { quote: "Don Tillman's Wife Project.", source: "The Rosie Project" },
  { quote: "Aspergers and extreme scheduling.", source: "The Rosie Project" },

  // 18. Doctor Sleep
  { quote: "Fear is the rust of life, destroying its brightness.", source: "Doctor Sleep" },
  { quote: "Dan Torrance and Abra Stone.", source: "Doctor Sleep" },
  { quote: "The True Knot basically being psychic RV boomers.", source: "Doctor Sleep" },

  // 19. Vicious
  { quote: "Plenty of humans were monstrous, and plenty of monsters knew how to play at being human.", source: "Vicious" },
  { quote: "Victor and Eli.", source: "Vicious" },
  { quote: "Extra Ordinary people with extra ordinary grudges.", source: "Vicious" },

  // 20. Eleanor & Park
  { quote: "Holding Eleanor's hand was like holding a butterfly.", source: "Eleanor & Park" },
  { quote: "Reading comics on the school bus.", source: "Eleanor & Park" },
  { quote: "Mixed mixtapes in the 80s.", source: "Eleanor & Park" },

  // 21. Red Rising
  { quote: "I would have lived in peace. But my enemies brought me war.", source: "Red Rising" },
  { quote: "Darrow of Lykos.", source: "Red Rising" },
  { quote: "Hogwarts in space, but incredibly violent.", source: "Red Rising" },

  // 22. Station Eleven
  { quote: "Because survival is insufficient.", source: "Station Eleven" },
  { quote: "The Traveling Symphony.", source: "Station Eleven" },
  { quote: "Shakespeare after the flu apocalypse.", source: "Station Eleven" },

  // 23. Big Little Lies
  { quote: "They were women who had it all.", source: "Big Little Lies" },
  { quote: "Madeline, Celeste, and Jane.", source: "Big Little Lies" },
  { quote: "Trivia night gone incredibly wrong.", source: "Big Little Lies" },

  // 24. All the Light We Cannot See
  { quote: "Open your eyes and see what you can with them before they close forever.", source: "All the Light We Cannot See" },
  { quote: "Marie-Laure and Werner.", source: "All the Light We Cannot See" },
  { quote: "The Sea of Flames diamond curse.", source: "All the Light We Cannot See" },

  // 25. We Were Liars
  { quote: "Be a little kinder than you have to.", source: "We Were Liars" },
  { quote: "The Sinclair family on Beechwood Island.", source: "We Were Liars" },
  { quote: "That twist hit like a burning house.", source: "We Were Liars" },

  // 26. The Girl on the Train
  { quote: "I have lost control over everything, even the places in my head.", source: "The Girl on the Train" },
  { quote: "Rachel commuting to London.", source: "The Girl on the Train" },
  { quote: "Never trust someone who blackouts that often.", source: "The Girl on the Train" },

  // 27. A Court of Thorns and Roses
  { quote: "Don't feel bad for one moment about doing what brings you joy.", source: "A Court of Thorns and Roses" },
  { quote: "Feyre and Tamlin.", source: "A Court of Thorns and Roses" },
  { quote: "Beauty and the Beast with aggressively attractive faeries.", source: "A Court of Thorns and Roses" },

  // 28. Red Queen
  { quote: "Anyone can betray anyone.", source: "Red Queen" },
  { quote: "Mare Barrow's lightning.", source: "Red Queen" },
  { quote: "Silvers vs. Reds.", source: "Red Queen" },

  // 29. Six of Crows
  { quote: "No mourners. No funerals.", source: "Six of Crows" },
  { quote: "Kaz Brekker's heist.", source: "Six of Crows" },
  { quote: "Six teenage criminals who are somehow simultaneously 17 and 45 years old.", source: "Six of Crows" },

  // 30. The Fifth Season
  { quote: "This is the way the world ends... for the last time.", source: "The Fifth Season" },
  { quote: "Orogeny and the Stillness.", source: "The Fifth Season" },
  { quote: "An earth magic system based on tectonic spite.", source: "The Fifth Season" },

  // 31. An Ember in the Ashes
  { quote: "Fear is only your enemy if you allow it to be.", source: "An Ember in the Ashes" },
  { quote: "Laia and Elias at Blackcliff Academy.", source: "An Ember in the Ashes" },
  { quote: "The Commandant being the absolute worst mother ever.", source: "An Ember in the Ashes" },

  // 32. Illuminae
  { quote: "Am I not merciful?", source: "Illuminae" },
  { quote: "Kady Grant and AIDAN.", source: "Illuminae" },
  { quote: "A rogue AI who is terrifyingly romantic.", source: "Illuminae" },

  // 33. Dark Matter
  { quote: "Are you happy with your life?", source: "Dark Matter" },
  { quote: "Jason Dessen's multiverse.", source: "Dark Matter" },
  { quote: "The worst case of 'stealing my own life' ever recorded.", source: "Dark Matter" }
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
console.log("Successfully written popular books 1-33!");
