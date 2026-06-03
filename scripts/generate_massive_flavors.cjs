const fs = require('fs');

const data = {
  Game: {
    refs: [
      "Rock and Stone!", "If you don't rock and stone, you ain't comin' home.", "Bapanada.", "Shaw!", "No cost too great.",
      "Nanomachines, son!", "Rules of Nature!", "Kept you waiting, huh?", "You're pretty good.", "La-li-lu-le-lo.",
      "Wind's howling.", "Place of power, gotta be.", "How about a game of Gwent?", "Sul sul!", "Reticulating splines...",
      "Lok'tar Ogar!", "For the Horde!", "My life for Aiur!", "Nuclear launch detected.", "Your health is low, do you have any potions or food?",
      "Do you get to the Cloud District very often?", "Stop right there, criminal scum!",  "Wake up, we're here. Why are you shaking?", 
      "Stand in the ashes of a trillion dead souls...", "Does this unit have a soul?", "I am a monument to all your sins.", 
      "Watch those wrist rockets!", "Good soldiers follow orders.", "Let me guess... someone stole your sweetroll.", 
      "I've got balls of steel.", "You can't just shoot a hole into the surface of Mars.", "Welcome to the fantasy zone!", 
      "So long, gay Bowser!", "Kirov reporting.", "Spy's sappin' my sentry!", "Pootis Spencer here.", "Voodoo One, Viper's on station.", 
      "Patrolling the Mojave almost makes you wish for a nuclear winter.", "Another settlement needs your help."
    ],
    nouns: ["boss fight", "skill tree", "RNG", "drop rate", "speedrun", "save file", "inventory", "lore", "hitbox", "i-frames", "cutscene"],
    adjectives: ["busted", "perfect", "janky", "sublime", "unforgiving", "transcendent", "absolute cinema", "goated", "trash", "god-tier"]
  },
  Book: {
    refs: [
      "The man in black fled across the desert, and the gunslinger followed.", "A screaming comes across the sky.", 
      "I am an invisible man.", "You better not never tell nobody but God.", "There was a boy called Eustace Clarence Scrubb.", 
      "All this happened, more or less.", "Stay gold, Ponyboy.", "It was a bright cold day in April, and the clocks were striking thirteen.", 
      "It is a truth universally acknowledged...", "Happy families are all alike...", "Call me Ishmael.", 
      "Mother died today. Or maybe yesterday; I can't be sure.", "It was love at first sight.", "Ships at a distance have every man's wish on board.", 
      "Lolita, light of my life, fire of my loins.", "A story has no beginning or end...", "The sky above the port was the color of television...", 
      "We were somewhere around Barstow on the edge of the desert...","I write this sitting in the kitchen sink.", 
      "In my younger and more vulnerable years...", "Last night I dreamt I went to Manderley again.", "The past is a foreign country...", 
      "If you really want to hear about it...", "Every summer Lin Kong returned to Goose Village...", "riverrun, past Eve and Adam's...", 
      "I had the story, bit by bit, from various people...", "You don't know about me without you have read a book...", 
      "Once upon a time and a very good time it was..."
    ],
    nouns: ["prologue", "epilogue", "character arc", "plot twist", "magic system", "worldbuilding", "paperback edition", "dust jacket", "font choice", "author's note"],
    adjectives: ["dense", "purple", "immaculate", "devastating", "heartbreaking", "life-altering", "cozy", "page-turning", "unputdownable", "mind-bending"]
  },
  Audiobook: {
    refs: [
      "Audible hopes you have enjoyed this program.", "This is Audible.", "Chapter One.", "End of disc.", "Please insert disc two.",
      "GraphicAudio: A Movie In Your Mind", "Read by the author.", "Unabridged edition.", "Narrated by Jim Dale.", "Narrated by Stephen Fry.",
      "Narrated by Ray Porter.", "Narrated by Michael Kramer.", "Narrated by Kate Reading.", "Narrated by Simon Vance.", 
      "The accompanying reference guide...", "PDF attachment included.", "Speed set to 1.5x.", "Speed set to 2.0x.", "Speed set to 3.0x (Are you okay?).",
      "Playback paused.", "Sleep timer engaged.", "Whispersync ready.", "Library loan expired.", "Hold available on Libby.", 
      "Return early?", "Renew checkout.", "Skip backward 15 seconds.", "Skip backward 30 seconds."
    ],
    nouns: ["narrator's voice", "audio mixing", "character voices", "pacing", "background music", "chapter transition", "pronunciation", "sound quality"],
    adjectives: ["soothing", "grating", "hypnotic", "cinematic", "captivating", "sleep-inducing", "flawless", "bizarre", "transcendent", "buttery"]
  },
  "Visual Novel": {
    refs: [
      "El Psy Kongroo.", "Tuturu~", "I am mad scientist, it's so cool!", "Sonuvabitch.", "People die if they are killed.", 
      "The archer class really is made up of archers.", "Just because you're correct doesn't mean you're right.", "Trace on.", 
      "Unlimited Blade Works.", "When the seagulls cry.", "Without love, it cannot be seen.", "Ushiromiya Battler, I'm going to tear you apart!", 
      "Dango Daikazoku.", "Waku waku.", "A body has been discovered!", "Upupupu~", "It's punishment time!", "No, that's wrong!", 
      "Allow me to cut through those words!", "Sore wa chigau yo!", "Just Monika.", "I gently open the door...", 
      "Every day, I imagine a future where I can be with you.", "Katawa Shoujo changed my life.", "Muv-Luv Alternative PTSD.", 
      "Tsukihime remake is real.", "This chair. This chair. This chair.", "Nanaya grindset.", "Defenseless anus."
    ],
    nouns: ["common route", "bad ending", "true ending", "CG gallery", "skip button", "auto-read speed", "text box transparency", "protagonist's monologue", "BGM", "voice acting"],
    adjectives: ["soul-crushing", "fluffy", "kinetic", "branching", "untranslated", "machine-translated", "peak", "tragic", "too long", "masterful"]
  },
  Manga: {
    refs: [
      "Omae wa mou shindeiru.", "Za Warudo!", "Wryyyyyyy!", "Muda muda muda muda!", "Ora ora ora ora!", "Ho, you're approaching me?", 
      "I can't beat the shit out of you without getting closer.", "Equivalent exchange.", "It's a terrible day for rain.", 
      "I will take a potato chip... and eat it!", "All according to keikaku.", "It's over 9000!", "The One Piece is real!", 
      "Nothing happened.", "Dattebayo!", "Bankai.", "Domain Expansion.", "Nah, I'd win.", "Stand proud, you are strong.", 
      "Tatakae.", "Give up your dreams and die.", "Susume!", "I am a hero for fun.", "100 pushups, 100 sit-ups...", "Plus Ultra!", 
      "I AM HERE!", "See you space cowboy...", "Aria of the soul.", "Gantz ball.", "Kagurabachi: Peak fiction.", "Enough time has passed.", 
      "Bocchi the Rock!", "Don't toy with me.", "Oyasumi Punpun destroyed me.", "Read Berserk.", "He laughed."
    ],
    nouns: ["panel layout", "double-page spread", "lineart", "screentone", "translation notes", "author's comment", "cliffhanger", "pacing", "hiatus", "training arc"],
    adjectives: ["crisp", "detailed", "messy", "god-tier", "sloppy", "hype", "devastating", "hilarious", "edgy", "kino"]
  },
  Series: {
    refs: [
      "Pivot!", "We were on a break!", "Bears. Beets. Battlestar Galactica.", "That's what she said.", "Cool cool cool cool cool.", 
      "Nine-Nine!", "Winter is coming.", "The Lannisters send their regards.", "I am the one who knocks.", "Yeah, science!", 
      "Wubba lubba dub dub!", "I turned myself into a pickle!", "The truth is out there.", "Trust no one.", "Live long and prosper.", 
      "Beam me up, Scotty.", "Wibbly wobbly, timey wimey.", "Exterminate!", "The owls are not what they seem.", "Damn fine cup of coffee.", 
      "We have to go back!", "Not Penny's boat.", "So say we all.", "Frak.", "I'd like to buy the world a Coke.", 
      "Don't stop believin'.", "I've made a huge mistake.", "There's always money in the banana stand.", "Her?", 
      "Taste the deafening silence.", "Succession theme intensifies.", "L to the OG.", "Boar on the floor.", "Yes, Chef!", "Heard, Chef!",
      "You come at the king, you best not miss."
    ],
    nouns: ["season finale", "pilot episode", "bottle episode", "character development", "theme song", "laugh track", "cancellation", "spin-off", "canon", "cliffhanger"],
    adjectives: ["bingeable", "dragged out", "cancelled too soon", "overrated", "groundbreaking", "iconic", "boring", "masterful", "funny", "heart-wrenching"]
  },
  Movie: {
    refs: [
      "Hasta la vista, baby.", "Get to the chopper!", "I am your father.", "Hello there.", "I have the high ground.", 
      "It's a trap!", "Here's looking at you, kid.", "We'll always have Paris.", "You're gonna need a bigger boat.", 
      "I feel the need - the need for speed.", "To infinity and beyond!", "There's no place like home.", "I see dead people.", 
      "Why so serious?", "My precious.", "You shall not pass!", "Fly, you fools!", "I love the smell of napalm in the morning.", 
      "Say hello to my little friend!", "You can't handle the truth!", "Leave the gun, take the cannoli.", "Life finds a way.", 
      "Clever girl.", "Avengers, assemble.", "I love you 3000.", "Perfectly balanced, as all things should be.", "First rule of Fight Club...", 
      "The Matrix has you.", "I know kung fu.", "Rosebud.", "Frankly, my dear, I don't give a damn.", "I'm walking here!", 
      "You talkin' to me?", "Here's Johnny!", "All work and no play makes Jack a dull boy."
    ],
    nouns: ["cinematography", "director's cut", "post-credits scene", "CGI", "practical effects", "score", "sound design", "pacing", "plot twist", "dialogue"],
    adjectives: ["Oscar-worthy", "pretentious", "breathtaking", "gritty", "mind-blowing", "kino", "absolute cinema", "lackluster", "stunning", "overhyped"]
  },
  Comic: {
    refs: [
      "With great power comes great responsibility.", "I am Vengeance. I am the Night.", "Avengers Assemble!", "It's clobberin' time!", 
      "Hulk smash!", "Snikt!", "Thwip!", "Bamf!", "Excelsior!", "Make mine Marvel.", "In brightest day, in blackest night.", 
      "By the hoary hosts of Hoggoth!", "Imperius Rex!", "Hail Hydra.", "I can do this all day.", "On your left.", "Wakanda Forever.", 
      "I am Groot.", "I'm the best there is at what I do.", "Sweet Christmas!", "To me, my X-Men.", "Magneto was right.", 
      "Face it Tiger, you just hit the jackpot.", "We live in a society.", "All it takes is one bad day.", "I'm the goddamn Batman.", 
      "Kneel before Zod!", "Darkseid is.", "Anti-Life justifies my hate.", "Crisis on Infinite Earths.", "Secret Wars.", 
      "Who watches the Watchmen?", "Nothing ends, Adrian. Nothing ever ends.", "I'm not locked in here with you. You're locked in here with me!", 
      "Remember, remember, the 5th of November.", "This city is afraid of me. I have seen its true face."
    ],
    nouns: ["variant cover", "splash page", "coloring", "inker", "speech bubble", "paneling", "retcon", "reboot", "crossover event", "omnibus"],
    adjectives: ["mint condition", "graded", "near-mint", "iconic", "confusing", "groundbreaking", "gritty", "overpriced", "vibrant", "dynamic"]
  }
};

const templates = [
  "The {noun} is {adjective}.",
  "I can't get over how {adjective} the {noun} was.",
  "When the {noun} hits just right 😩👌.",
  "Unpopular opinion: the {noun} is {adjective}.",
  "The {adjective} {noun} lives in my head rent-free.",
  "That {noun} was absolutely {adjective}.",
  "Is it just me, or is the {noun} kinda {adjective}?",
  "My therapist: The {adjective} {noun} isn't real.",
  "Everyone talks about the plot, but the {noun} is {adjective}."
];

let code = fs.readFileSync('src/lib/flavorTexts.ts', 'utf8');

for (const [type, info] of Object.entries(data)) {
  const searchString = `"${type}": [\n`;
  const insertIndex = code.indexOf(searchString);
  if (insertIndex !== -1) {
    const splitIndex = insertIndex + searchString.length;
    let insertion = '';
    
    // Add specific refs
    for (const ref of info.refs) {
      insertion += `    \`${ref.replace(/`/g, '\\\\`')}\`,\n`;
    }
    
    // Generate combinations up to around 260 to double the ~240 existing items
    let generated = 0;
    outerLoop: for (const noun of info.nouns) {
      for (const adj of info.adjectives) {
        for (const template of templates) {
          const combo = template.replace('{noun}', noun).replace('{adjective}', adj);
          insertion += `    \`${combo}\`,\n`;
          generated++;
          if (generated > 260) break outerLoop;
        }
      }
    }
    
    code = code.slice(0, splitIndex) + insertion + code.slice(splitIndex);
  }
}

fs.writeFileSync('src/lib/flavorTexts.ts', code);
console.log("Added massive unique flavors!");
