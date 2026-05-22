import fs from 'fs';

const GER_BOOKS_QUOTES = [
  // 68. Der Seelenbrecher
  { quote: "Er wird deine Seele brechen.", source: "Der Seelenbrecher" },
  { quote: "Trapped in a psychiatric clinic during a snowstorm.", source: "Der Seelenbrecher" },
  { quote: "Caspar's amnesia and riddles.", source: "Der Seelenbrecher" },

  // 69. Das Paket
  { quote: "Was auch immer du tust, nimm das Paket nicht an.", source: "Das Paket" },
  { quote: "Emma Stein trembling in her house.", source: "Das Paket" },
  { quote: "The hairdresser serial killer.", source: "Das Paket" },

  // 70. Der Heimweg
  { quote: "Begleite mich am Telefon.", source: "Der Heimweg" },
  { quote: "Jules working the night shift.", source: "Der Heimweg" },
  { quote: "Klara is terrified on her way home.", source: "Der Heimweg" },

  // 71. Mimik
  { quote: "Dein Gesicht verrät dich.", source: "Mimik" },
  { quote: "Hannah Herbst reading microexpressions.", source: "Mimik" },
  { quote: "When you analyze the confession video and the killer is... you.", source: "Mimik" },

  // 72. Die Einladung
  { quote: "Die Einladung ins Nirgendwo.", source: "Die Einladung" },
  { quote: "Marla tracing the class reunion.", source: "Die Einladung" },
  { quote: "Sebastian Fitzek twists strike again.", source: "Die Einladung" },

  // 73. Der Insasse
  { quote: "Wie weit würdest du gehen, um die Wahrheit zu finden?", source: "Der Insasse" },
  { quote: "Till Berkhoff goes voluntarily into the psych ward.", source: "Der Insasse" },
  { quote: "Guido T. knows what happened to Max.", source: "Der Insasse" },

  // 74. Tschick
  { quote: "Beste Sommerferien ever.", source: "Tschick" },
  { quote: "Maik Klingenberg and a stolen Lada.", source: "Tschick" },
  { quote: "Roadtrip through the East German province.", source: "Tschick" },

  // 75. Er ist wieder da
  { quote: "Ich bin wieder da.", source: "Er ist wieder da" },
  { quote: "Waking up on a patch of grass in 2011 Berlin.", source: "Er ist wieder da" },
  { quote: "A dictator becomes a YouTube star.", source: "Er ist wieder da" },

  // 76. Altes Land
  { quote: "Dat geiht di nix an.", source: "Altes Land" },
  { quote: "Vera Eckhoff und das Fachwerkhaus im Alten Land.", source: "Altes Land" },
  { quote: "Apples, refugees, and northern German stubbornness.", source: "Altes Land" },

  // 77. Mittagsstunde
  { quote: "Kein Mensch muss müssen.", source: "Mittagsstunde" },
  { quote: "Ingwer Feddersen returning to Brinkebüll.", source: "Mittagsstunde" },
  { quote: "The dying village pub.", source: "Mittagsstunde" },

  // 78. Zur See
  { quote: "Das Meer nimmt alles.", source: "Zur See" },
  { quote: "A family on a North Sea island.", source: "Zur See" },
  { quote: "Dörte Hansen documenting island traditions fading away.", source: "Zur See" },

  // 79. Unterleuten
  { quote: "Jeder hat eine Wahrheit, die er verteidigt.", source: "Unterleuten" },
  { quote: "Wind turbines tearing a village apart.", source: "Unterleuten" },
  { quote: "Brandenburg province drama.", source: "Unterleuten" },

  // 80. Über Menschen
  { quote: "Manchmal muss man die Stadt verlassen.", source: "Über Menschen" },
  { quote: "Dora moving to the country during the pandemic.", source: "Über Menschen" },
  { quote: "Living next to the local village Nazi.", source: "Über Menschen" },

  // 81. Vom Ende der Einsamkeit
  { quote: "Ich kenne den Tod schon lange, aber jetzt kennt er auch mich.", source: "Vom Ende der Einsamkeit" },
  { quote: "Jules, Marty and Liz losing their parents.", source: "Vom Ende der Einsamkeit" },
  { quote: "Alva and the old camera.", source: "Vom Ende der Einsamkeit" },

  // 82. Hard Land
  { quote: "It’s 1985 in Missouri.", source: "Hard Land" },
  { quote: "Sam's summer job at the cinema.", source: "Hard Land" },
  { quote: "Bruce Springsteen quotes and coming of age.", source: "Hard Land" },

  // 83. Der Trafikant
  { quote: "Wien, 1937.", source: "Der Trafikant" },
  { quote: "Franz Huchel taking advice from Sigmund Freud.", source: "Der Trafikant" },
  { quote: "The changing atmosphere at the tobacco shop.", source: "Der Trafikant" },

  // 84. Ein ganzes Leben
  { quote: "Ein Leben voller Berge und Schnee.", source: "Ein ganzes Leben" },
  { quote: "Andreas Egger building the cable cars.", source: "Ein ganzes Leben" },
  { quote: "Avalanches and quiet resilience.", source: "Ein ganzes Leben" },

  // 85. Das Haus der Schwestern
  { quote: "Ein altes Geheimnis in Yorkshire.", source: "Das Haus der Schwestern" },
  { quote: "Charlotte Freeman snowed in at Westhill House.", source: "Das Haus der Schwestern" },
  { quote: "Charlotte Link mastering the suspense thriller.", source: "Das Haus der Schwestern" },

  // 86. Die Rosenzüchterin
  { quote: "Die Rosen verbergen viel.", source: "Die Rosenzüchterin" },
  { quote: "Francine and Beatrice in Guernsey.", source: "Die Rosenzüchterin" },
  { quote: "WW2 secrets coming to light.", source: "Die Rosenzüchterin" },

  // 87. Einsame Nacht
  { quote: "Kälte und Schnee verbergen die Spuren.", source: "Einsame Nacht" },
  { quote: "Kate Linville investigating in the frozen moors.", source: "Einsame Nacht" },
  { quote: "Nobody is safe in the snowy loneliness.", source: "Einsame Nacht" },

  // 88. Winterkartoffelknödel
  { quote: "Oma kocht am besten.", source: "Winterkartoffelknödel" },
  { quote: "Franz Eberhofer ermittelt in Niederkaltenkirchen.", source: "Winterkartoffelknödel" },
  { quote: "Birkenberger, Eberhofer und Leberkäs.", source: "Winterkartoffelknödel" },

  // 89. Dampfnudelblues
  { quote: "Achtung, bayerischer Humor voraus.", source: "Dampfnudelblues" },
  { quote: "Eberhofer looking into the school principal's death.", source: "Dampfnudelblues" },
  { quote: "Bavarian village crime at its finest.", source: "Dampfnudelblues" },

  // 90. Milchgeld
  { quote: "Kluftinger ist knurrig.", source: "Milchgeld" },
  { quote: "Kommissar Kluftinger in the Allgäu.", source: "Milchgeld" },
  { quote: "The cult of Kässpatzen begins.", source: "Milchgeld" },

  // 91. Liebes Kind
  { quote: "Lena und die Kinder in der Hütte.", source: "Liebes Kind" },
  { quote: "Escaping the windowless cabin.", source: "Liebes Kind" },
  { quote: "Romy Hausmann rewriting the abduction thriller.", source: "Liebes Kind" },

  // 92. Alte Sorten
  { quote: "Im Obstgarten heilen alte Wunden.", source: "Alte Sorten" },
  { quote: "Sally and Liss at the remote farm.", source: "Alte Sorten" },
  { quote: "Pears and potatoes over psych wards.", source: "Alte Sorten" },

  // 93. Die Liebe im Ernstfall
  { quote: "Fünf Frauen, fünf Schicksale.", source: "Die Liebe im Ernstfall" },
  { quote: "Daniela Krien maps modern female lives in Leipzig.", source: "Die Liebe im Ernstfall" },
  { quote: "Love, really, is complicated.", source: "Die Liebe im Ernstfall" },

  // 94. Stay away from Gretchen
  { quote: "Das Ostpreußen-Trauma.", source: "Stay away from Gretchen" },
  { quote: "Greta's dementia revealing the 1945 flight.", source: "Stay away from Gretchen" },
  { quote: "Tom learning his mother's dark secrets.", source: "Stay away from Gretchen" },

  // 95. Die Enkelin
  { quote: "Geschichte wiederholt sich nicht, aber sie reimt sich.", source: "Die Enkelin" },
  { quote: "Kaspar discovering his wife's secret life.", source: "Die Enkelin" },
  { quote: "Völkische Siedler in modern Germany.", source: "Die Enkelin" },

  // 96. Echtzeitalter
  { quote: "Till sitting in his room gaming.", source: "Echtzeitalter" },
  { quote: "Age of Empires II as a coping mechanism.", source: "Echtzeitalter" },
  { quote: "Austrian elite boarding school stress.", source: "Echtzeitalter" },

  // 97. Herkunft
  { quote: "Woher kommst du?", source: "Herkunft" },
  { quote: "Saša Stanišić and the memories of Višegrad.", source: "Herkunft" },
  { quote: "The choose-your-own-adventure grandmother chapter.", source: "Herkunft" },

  // 98. Kruso
  { quote: "Die Freiheit der Ostsee.", source: "Kruso" },
  { quote: "Ed working at the Klausner on Hiddensee.", source: "Kruso" },
  { quote: "Dropouts at the edge of the GDR.", source: "Kruso" },

  // 99. Das Jesus Video
  { quote: "Ein Zeitreisender vor zweitausend Jahren?", source: "Das Jesus Video" },
  { quote: "Stephen Foxx finding a modern manual in a 2000-year-old tomb.", source: "Das Jesus Video" },
  { quote: "The hunt for the camcorder that filmed Christ.", source: "Das Jesus Video" },

  // 100. Corpus Delicti
  { quote: "Ein Prozess im Jahr 2057.", source: "Corpus Delicti" },
  { quote: "Mia Holl and the METHOD.", source: "Corpus Delicti" },
  { quote: "When brushing your teeth wrong makes you a criminal.", source: "Corpus Delicti" }
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
console.log("Successfully written german books 68-100!");
