import fs from 'fs';

const GER_BOOKS_QUOTES = [
  // 34. Die Physiker
  { quote: "Was alle angeht, können nur alle lösen.", source: "Die Physiker" },
  { quote: "Möbius, Newton, and Einstein.", source: "Die Physiker" },
  { quote: "Dr. Mathilde von Zahnd is the real villain.", source: "Die Physiker" },

  // 35. Ansichten eines Clowns
  { quote: "Ich bin ein Clown und sammle Augenblicke.", source: "Ansichten eines Clowns" },
  { quote: "Hans Schnier calling everyone on the phone.", source: "Ansichten eines Clowns" },
  { quote: "Marie leaving the clown for a Catholic.", source: "Ansichten eines Clowns" },

  // 36. Die verlorene Ehre der Katharina Blum
  { quote: "Wie Gewalt entstehen und wohin sie führen kann.", source: "Die verlorene Ehre der Katharina Blum" },
  { quote: "Katharina Blum and the ZEITUNG.", source: "Die verlorene Ehre der Katharina Blum" },
  { quote: "Journalistic ethics? Never heard of them.", source: "Die verlorene Ehre der Katharina Blum" },

  // 37. Deutschstunde
  { quote: "Die Pflicht, mein Junge.", source: "Deutschstunde" },
  { quote: "Siggi Jepsen writing his essay in juvenile detention.", source: "Deutschstunde" },
  { quote: "The joys of writing essays about 'The Pleasures of Duty'.", source: "Deutschstunde" },

  // 38. Jakob der Lügner
  { quote: "Bäume haben wir uns ausgedacht.", source: "Jakob der Lügner" },
  { quote: "Jakob Heym inventing radio news in the ghetto.", source: "Jakob der Lügner" },
  { quote: "Hope from a non-existent radio.", source: "Jakob der Lügner" },

  // 39. Der Vorleser
  { quote: "Warum tust du das?", source: "Der Vorleser" },
  { quote: "Michael Berg reading to Hanna Schmitz.", source: "Der Vorleser" },
  { quote: "The consequences of hiding illiteracy.", source: "Der Vorleser" },

  // 40. Momo
  { quote: "Zeit ist Leben. Und das Leben wohnt im Herzen.", source: "Momo" },
  { quote: "The Men in Grey stealing time.", source: "Momo" },
  { quote: "Cassiopeia the tortoise always knowing what to do.", source: "Momo" },

  // 41. Die unendliche Geschichte
  { quote: "Tue was du willst.", source: "Die unendliche Geschichte" },
  { quote: "Bastian Balthazar Bux reading in the attic.", source: "Die unendliche Geschichte" },
  { quote: "Artax in the Swamps of Sadness. Still hurts.", source: "Die unendliche Geschichte" },

  // 42. Krabat
  { quote: "Das ist die Mühle im Koselbruch, wo die schwarze Magie gelehrt wird.", source: "Krabat" },
  { quote: "Krabat and the Master.", source: "Krabat" },
  { quote: "Turning into ravens to study dark magic.", source: "Krabat" },

  // 43. Der Räuber Hotzenplotz
  { quote: "Kasperl und Seppel.", source: "Der Räuber Hotzenplotz" },
  { quote: "Hotzenplotz stealing the coffee mill.", source: "Der Räuber Hotzenplotz" },
  { quote: "Petrosilius Zwackelmann smelling potatoes.", source: "Der Räuber Hotzenplotz" },

  // 44. Sansibar oder der letzte Grund
  { quote: "Gott hat uns den Rücken zugekehrt.", source: "Sansibar oder der letzte Grund" },
  { quote: "The reading boy and the wooden sculpture.", source: "Sansibar oder der letzte Grund" },
  { quote: "Escaping to Sweden.", source: "Sansibar oder der letzte Grund" },

  // 45. Der geteilte Himmel
  { quote: "Es gibt keine einfache Wahrheit.", source: "Der geteilte Himmel" },
  { quote: "Rita and Manfred.", source: "Der geteilte Himmel" },
  { quote: "A love story divided by the Berlin Wall.", source: "Der geteilte Himmel" },

  // 46. Nachdenken über Christa T.
  { quote: "Wann, wenn nicht jetzt?", source: "Nachdenken über Christa T." },
  { quote: "Reconstructing the life of Christa T.", source: "Nachdenken über Christa T." },
  { quote: "Searching for individuality in the GDR.", source: "Nachdenken über Christa T." },

  // 47. Die neuen Leiden des jungen W.
  { quote: "Edgar Wibeau had a plan.", source: "Die neuen Leiden des jungen W." },
  { quote: "Jeans and the tape recorder.", source: "Die neuen Leiden des jungen W." },
  { quote: "Werther updated for the GDR.", source: "Die neuen Leiden des jungen W." },

  // 48. Sonnenallee
  { quote: "Es war einmal in einem Land, das es nicht mehr gibt...", source: "Sonnenallee" },
  { quote: "Micha Kuppisch and the letter from Miriam.", source: "Sonnenallee" },
  { quote: "Rolling Stones records on the black market.", source: "Sonnenallee" },

  // 49. Faserland
  { quote: "Ich ziehe meine Barbourjacke an.", source: "Faserland" },
  { quote: "Traveling through Germany drinking too much.", source: "Faserland" },
  { quote: "Pop literature defined by beer and brand names.", source: "Faserland" },

  // 50. Herr Lehmann
  { quote: "Ich bin doch kein Hund.", source: "Herr Lehmann" },
  { quote: "Frank Lehmann working at the Einfall.", source: "Herr Lehmann" },
  { quote: "The Berlin Wall falling while you just want a beer.", source: "Herr Lehmann" },

  // 51. Soloalbum
  { quote: "Ich muss jetzt erst mal Oasis hören.", source: "Soloalbum" },
  { quote: "Heartbreak and music magazines.", source: "Soloalbum" },
  { quote: "Nick Hornby translated to 90s Germany.", source: "Soloalbum" },

  // 52. Die 13½ Leben des Käpt'n Blaubär
  { quote: "Zamonien ist kein Ort für Schwächlinge.", source: "Die 13½ Leben des Käpt'n Blaubär" },
  { quote: "Professor Nachtigaller and the Blaubär.", source: "Die 13½ Leben des Käpt'n Blaubär" },
  { quote: "Beware of the Stollentroll.", source: "Die 13½ Leben des Käpt'n Blaubär" },

  // 53. Die Stadt der Träumenden Bücher
  { quote: "Hier fängt die Geschichte an, in den Katakomben.", source: "Die Stadt der Träumenden Bücher" },
  { quote: "Hildegunst von Mythenmetz exploring Buchhaim.", source: "Die Stadt der Träumenden Bücher" },
  { quote: "Books that can literally kill you.", source: "Die Stadt der Träumenden Bücher" },

  // 54. Tintenherz
  { quote: "Bücher müssen schwer sein, weil die ganze Welt in ihnen steckt.", source: "Tintenherz" },
  { quote: "Mo 'Zauberzunge' Folchart reading characters to life.", source: "Tintenherz" },
  { quote: "Capricorn and Staubfinger.", source: "Tintenherz" },

  // 55. Herr der Diebe
  { quote: "Venedig ist eine Stadt für Diebe.", source: "Herr der Diebe" },
  { quote: "Scipio, the Thief Lord.", source: "Herr der Diebe" },
  { quote: "The magical merry-go-round that changes your age.", source: "Herr der Diebe" },

  // 56. Rubinrot
  { quote: "Liebe durch alle Zeiten.", source: "Rubinrot" },
  { quote: "Gwendolyn Shepherd jumping through time.", source: "Rubinrot" },
  { quote: "Charlotte was supposed to be the time traveler.", source: "Rubinrot" },

  // 57. Saphirblau
  { quote: "Xemerius the gargoyle.", source: "Saphirblau" },
  { quote: "Gideon de Villiers being complicated.", source: "Saphirblau" },
  { quote: "Time traveling to 18th century soirees.", source: "Saphirblau" },

  // 58. Smaragdgrün
  { quote: "Der Graf von Saint Germain.", source: "Smaragdgrün" },
  { quote: "Closing the circle of blood.", source: "Smaragdgrün" },
  { quote: "Immortality isn't everything it's cracked up to be.", source: "Smaragdgrün" },

  // 59. Der Schwarm
  { quote: "Das Meer schlägt zurück.", source: "Der Schwarm" },
  { quote: "The Yrr.", source: "Der Schwarm" },
  { quote: "Whales attacking ships makes you rethink whale watching.", source: "Der Schwarm" },

  // 60. Die Vermessung der Welt
  { quote: "Es ist seltsam, dachte er, daß es die Welt gibt.", source: "Die Vermessung der Welt" },
  { quote: "Carl Friedrich Gauß and Alexander von Humboldt.", source: "Die Vermessung der Welt" },
  { quote: "One measures with math, the other by climbing a volcano.", source: "Die Vermessung der Welt" },

  // 61. Tyll
  { quote: "Ich sterbe heute nicht.", source: "Tyll" },
  { quote: "Tyll Ulenspiegel in the Thirty Years' War.", source: "Tyll" },
  { quote: "Juggling through the apocalypse.", source: "Tyll" },

  // 62. Die Känguru-Chroniken
  { quote: "Mein Mitbewohner ist ein Känguru.", source: "Die Känguru-Chroniken" },
  { quote: "Schnapspralinen!", source: "Die Känguru-Chroniken" },
  { quote: "The Anti-Terror-Netzwerk.", source: "Die Känguru-Chroniken" },

  // 63. Das Känguru-Manifest
  { quote: "Wir müssen den Pinguin jagen.", source: "Das Känguru-Manifest" },
  { quote: "A capitalist penguin as the ultimate enemy.", source: "Das Känguru-Manifest" },
  { quote: "Witzig.", source: "Das Känguru-Manifest" },

  // 64. Die Känguru-Offenbarung
  { quote: "Auf der Suche nach dem Pinguin.", source: "Die Känguru-Offenbarung" },
  { quote: "Känguru in New York.", source: "Die Känguru-Offenbarung" },
  { quote: "Das Asoziale Netzwerk strikes again.", source: "Die Känguru-Offenbarung" },

  // 65. QualityLand
  { quote: "Peter Arbeitsloser.", source: "QualityLand" },
  { quote: "The algorithm knows what you want.", source: "QualityLand" },
  { quote: "Drones delivering pink dolphin vibrators.", source: "QualityLand" },

  // 66. Die Therapie
  { quote: "Keine Krankheit ist schlimmer als die Unsicherheit.", source: "Die Therapie" },
  { quote: "Viktor Larenz seeking answers on Parkum.", source: "Die Therapie" },
  { quote: "Anna Spiegel's schizophrenic stories.", source: "Die Therapie" },

  // 67. Das Amokspiel
  { quote: "Spielen wir ein Spiel?", source: "Das Amokspiel" },
  { quote: "The radio station hostage situation.", source: "Das Amokspiel" },
  { quote: "Ira Samin negotiating with a killer.", source: "Das Amokspiel" }
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
console.log("Successfully written german books 34-67!");
