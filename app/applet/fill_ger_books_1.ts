import fs from 'fs';

const GER_BOOKS_QUOTES = [
  // 1. Die Leiden des jungen Werthers
  { quote: "Am Ende sind wir doch alle allein.", source: "Die Leiden des jungen Werthers" },
  { quote: "Lotte, Lotte!", source: "Die Leiden des jungen Werthers" },
  { quote: "The original emo kid causing a 18th-century fashion trend.", source: "Die Leiden des jungen Werthers" },

  // 2. Die Räuber
  { quote: "Das Gesetz hat zum Schneckengang verdorben, was Adlerflug geworden wäre.", source: "Die Räuber" },
  { quote: "Karl Moor's bohemian forest hideout.", source: "Die Räuber" },
  { quote: "Franz Moor is literally the worst brother ever.", source: "Die Räuber" },

  // 3. Faust: Der Tragödie erster Teil
  { quote: "Da steh ich nun, ich armer Tor! Und bin so klug als wie zuvor.", source: "Faust: Der Tragödie erster Teil" },
  { quote: "Mephistopheles' pact with Heinrich.", source: "Faust: Der Tragödie erster Teil" },
  { quote: "Das also war des Pudels Kern!", source: "Faust: Der Tragödie erster Teil" },

  // 4. Aus dem Leben eines Taugenichts
  { quote: "Wem Gott will rechte Gunst erweisen, / Den schickt er in die weite Welt.", source: "Aus dem Leben eines Taugenichts" },
  { quote: "A romantic journey to Italy.", source: "Aus dem Leben eines Taugenichts" },
  { quote: "When you're too lazy to work so you just play the violin.", source: "Aus dem Leben eines Taugenichts" },

  // 5. Woyzeck
  { quote: "Jeder Mensch ist ein Abgrund, es schwindelt einem, wenn man hinabsieht.", source: "Woyzeck" },
  { quote: "Franz Woyzeck's tragic descent into madness.", source: "Woyzeck" },
  { quote: "The 'eat nothing but green peas' diet.", source: "Woyzeck" },

  // 6. Der Sandmann
  { quote: "Holzapfelchen, Holzapfelchen!", source: "Der Sandmann" },
  { quote: "Nathanael and the automaton Olimpia.", source: "Der Sandmann" },
  { quote: "Coppelius stealing eyes.", source: "Der Sandmann" },

  // 7. Kabale und Liebe
  { quote: "Wir können nicht zusammen leben, aber wir können zusammen sterben.", source: "Kabale und Liebe" },
  { quote: "Ferdinand and Luise's tragic love.", source: "Kabale und Liebe" },
  { quote: "When 18th century class differences ruin everything including your lemonade.", source: "Kabale und Liebe" },

  // 8. Nathan der Weise
  { quote: "Es eifre jeder seiner unbestochnen, von Vorurteilen freien Liebe nach!", source: "Nathan der Weise" },
  { quote: "The Ring Parable in Jerusalem.", source: "Nathan der Weise" },
  { quote: "Three rings to bind them... wait, wrong book.", source: "Nathan der Weise" },

  // 9. Effi Briest
  { quote: "Das ist ein weites Feld.", source: "Effi Briest" },
  { quote: "Effi and Innstetten.", source: "Effi Briest" },
  { quote: "The Chinese ghost upstairs.", source: "Effi Briest" },

  // 10. Der Schimmelreiter
  { quote: "Wenn ihr ihn nicht wollt, so nehmt mich!", source: "Der Schimmelreiter" },
  { quote: "Hauke Haien and his dikes.", source: "Der Schimmelreiter" },
  { quote: "Riding a glowing white horse into the storm.", source: "Der Schimmelreiter" },

  // 11. Die Judenbuche
  { quote: "Nichts ist erbärmlicher als ein Mensch, der sich selbst verachtet.", source: "Die Judenbuche" },
  { quote: "Friedrich Mergel's return to the village.", source: "Die Judenbuche" },
  { quote: "The tree remembers.", source: "Die Judenbuche" },

  // 12. Max und Moritz
  { quote: "Dieses war der erste Streich, doch der zweite folgt sogleich.", source: "Max und Moritz" },
  { quote: "Widow Bolte's chickens.", source: "Max und Moritz" },
  { quote: "Getting ground into grain by the miller.", source: "Max und Moritz" },

  // 13. Buddenbrooks
  { quote: "Der Frühling war da, in der Tat, und der Himmel lächelte.", source: "Buddenbrooks" },
  { quote: "The decline of a merchant family in Lübeck.", source: "Buddenbrooks" },
  { quote: "Thomas Mann making a family dinner look like a tragedy.", source: "Buddenbrooks" },

  // 14. Der Untertan
  { quote: "Wer treten wollte, musste sich treten lassen.", source: "Der Untertan" },
  { quote: "Diederich Heßling's blind obedience.", source: "Der Untertan" },
  { quote: "The ultimate satire of the German Empire.", source: "Der Untertan" },

  // 15. Die Verwandlung
  { quote: "Als Gregor Samsa eines Morgens aus unruhigen Träumen erwachte, fand er sich in seinem Bett zu einem ungeheueren Ungeziefer verwandelt.", source: "Die Verwandlung" },
  { quote: "An apple lodged in the back.", source: "Die Verwandlung" },
  { quote: "Kafka making everyone fear waking up as a bug.", source: "Die Verwandlung" },

  // 16. Der Process
  { quote: "Jemand musste Josef K. verleumdet haben...", source: "Der Process" },
  { quote: "Navigating the absurd bureaucracy of the court.", source: "Der Process" },
  { quote: "Waiting in front of the law forever.", source: "Der Process" },

  // 17. Der Zauberberg
  { quote: "Die Zeit ist ein Geheimnis.", source: "Der Zauberberg" },
  { quote: "Hans Castorp's sanatorium visit.", source: "Der Zauberberg" },
  { quote: "Going to visit your cousin for three weeks and staying for seven years.", source: "Der Zauberberg" },

  // 18. Siddhartha
  { quote: "Weisheit ist nicht mitteilbar.", source: "Siddhartha" },
  { quote: "The ferryman by the river.", source: "Siddhartha" },
  { quote: "Listening to the Omakaras.", source: "Siddhartha" },

  // 19. Der Steppenwolf
  { quote: "Nur für Verrückte.", source: "Der Steppenwolf" },
  { quote: "Harry Haller and Hermine.", source: "Der Steppenwolf" },
  { quote: "The Magic Theater.", source: "Der Steppenwolf" },

  // 20. Berlin Alexanderplatz
  { quote: "Franz Biberkopf macht eine Kur.", source: "Berlin Alexanderplatz" },
  { quote: "The roar of the city in the 1920s.", source: "Berlin Alexanderplatz" },
  { quote: "Reinhold is bad news.", source: "Berlin Alexanderplatz" },

  // 21. Im Westen nichts Neues
  { quote: "Wir sind verlassen wie Kinder und erfahren wie alte Leute...", source: "Im Westen nichts Neues" },
  { quote: "Paul Bäumer in the trenches.", source: "Im Westen nichts Neues" },
  { quote: "Katczinsky's uncanny ability to find food.", source: "Im Westen nichts Neues" },

  // 22. Emil und die Detektive
  { quote: "Parole Emil!", source: "Emil und die Detektive" },
  { quote: "Chasing the man in the bowler hat.", source: "Emil und die Detektive" },
  { quote: "Gustav with the horn.", source: "Emil und die Detektive" },

  // 23. Das fliegende Klassenzimmer
  { quote: "Einen Freund übersieht man nicht.", source: "Das fliegende Klassenzimmer" },
  { quote: "Martin, Johnny, Matz, Uli, and Kreuzkamm.", source: "Das fliegende Klassenzimmer" },
  { quote: "Jumping off a gym ladder with an umbrella.", source: "Das fliegende Klassenzimmer" },

  // 24. Hiob
  { quote: "Mendel Singer war ein frommer, gottesfürchtiger und gewöhnlicher Jude.", source: "Hiob" },
  { quote: "Menuchim's miraculous healing.", source: "Hiob" },
  { quote: "Joseph Roth's modern Job.", source: "Hiob" },

  // 25. Radetzkymarsch
  { quote: "Der Kaiser war ein alter Mann.", source: "Radetzkymarsch" },
  { quote: "The declining Austro-Hungarian Empire.", source: "Radetzkymarsch" },
  { quote: "Carl Joseph von Trotta drinking too much cognac.", source: "Radetzkymarsch" },

  // 26. Schachnovelle
  { quote: "Das Schachspiel hat wie die Liebe die Eigenschaft, dass es einen Partner braucht.", source: "Schachnovelle" },
  { quote: "Dr. B and Mirko Czentovic.", source: "Schachnovelle" },
  { quote: "Going insane by playing chess against yourself.", source: "Schachnovelle" },

  // 27. Das siebte Kreuz
  { quote: "Und wir fühlten, wie das Leben in unserm Herzen schlug.", source: "Das siebte Kreuz" },
  { quote: "Georg Heisler's escape from Westhofen.", source: "Das siebte Kreuz" },
  { quote: "Seven plane trees chopped down.", source: "Das siebte Kreuz" },

  // 28. Draußen vor der Tür
  { quote: "Eine Tür geht zu. Und du stehst draußen.", source: "Draußen vor der Tür" },
  { quote: "Beckmann returns from the war.", source: "Draußen vor der Tür" },
  { quote: "Those terrible, terrible gas mask glasses.", source: "Draußen vor der Tür" },

  // 29. Das Parfum
  { quote: "Im achtzehnten Jahrhundert lebte in Frankreich ein Mann...", source: "Das Parfum" },
  { quote: "Jean-Baptiste Grenouille collecting scents.", source: "Das Parfum" },
  { quote: "Literally the worst-scented execution party ever.", source: "Das Parfum" },

  // 30. Die Blechtrommel
  { quote: "Zugegeben: ich bin Insasse einer Heil- und Pflegeanstalt.", source: "Die Blechtrommel" },
  { quote: "Oskar Matzerath refusing to grow.", source: "Die Blechtrommel" },
  { quote: "Shattering glass with a scream.", source: "Die Blechtrommel" },

  // 31. Homo faber
  { quote: "Ich glaube nicht an Fügung und Schicksal, als Techniker bin ich gewohnt mit den Formeln der Wahrscheinlichkeit zu rechnen.", source: "Homo faber" },
  { quote: "Walter Faber's journey to Greece.", source: "Homo faber" },
  { quote: "The worst coincidence in literature.", source: "Homo faber" },

  // 32. Biedermann und die Brandstifter
  { quote: "Scherz ist die drittbeste Tarnung.", source: "Biedermann und die Brandstifter" },
  { quote: "Gottlieb Biedermann letting arsonists into his attic.", source: "Biedermann und die Brandstifter" },
  { quote: "Handing the matches to the guys with the gasoline.", source: "Biedermann und die Brandstifter" },

  // 33. Der Besuch der alten Dame
  { quote: "Die Welt machte mich zu einer Hure, nun mache ich sie zu einem Bordell.", source: "Der Besuch der alten Dame" },
  { quote: "Claire Zachanassian returning to Güllen.", source: "Der Besuch der alten Dame" },
  { quote: "A billion for justice.", source: "Der Besuch der alten Dame" }
];

const filePath = './src/lib/flavorTexts.ts';
let content = fs.readFileSync(filePath, 'utf8');
const match = content.match(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = (\{[\s\S]*?\});\n\nexport function/);
const obj = eval('(' + match[1] + ')');

let bookArr = obj['Book'] || [];

for (const quoteObj of GER_BOOKS_QUOTES) {
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
console.log("Successfully written german books 1-33!");
