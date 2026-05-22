import fs from 'fs';

const GAMING_QUOTES = [
  // 1. Anno 1602 (1998)
  { quote: "Euer Volk hungert!", source: "Anno 1602" },
  { quote: "Your people are starving!", source: "Anno 1602" },
  { quote: "Es mangelt an Alkohol!", source: "Anno 1602" },
  // 2. Anno 1404 (2009)
  { quote: "Die Karre steckt im Dreck.", source: "Anno 1404" },
  { quote: "Euer Volk will eine Moschee.", source: "Anno 1404" },
  { quote: "For the Emperor!", source: "Anno 1404" },
  // 3. Anno 1800 (2019)
  { quote: "A cup of coffee before the shift begins.", source: "Anno 1800" },
  { quote: "Es mangelt an Nähmaschinen.", source: "Anno 1800" },
  { quote: "Your city's appeal is soaring.", source: "Anno 1800" },
  // 4. The Settlers (1993)
  { quote: "Wuselfaktor", source: "The Settlers" },
  { quote: "The little generic people.", source: "The Settlers" },
  { quote: "Wegebau ist eine Kunst.", source: "The Settlers" },
  // 5. The Settlers II (1996)
  { quote: "Die Römer und ihr Gold.", source: "The Settlers II" },
  { quote: "Yippee!", source: "The Settlers II" },
  { quote: "Don't forget the flags.", source: "The Settlers II" },
  // 6. The Settlers III (1998)
  { quote: "Das Eisen wird knapp.", source: "The Settlers III" },
  { quote: "Mana for the gods.", source: "The Settlers III" },
  { quote: "Pikeniere vor!", source: "The Settlers III" },
  // 7. Gothic (2001)
  { quote: "Lass uns Wildschweine jagen gehen.", source: "Gothic" },
  { quote: "Zeig mir deine Ware.", source: "Gothic" },
  { quote: "Volles Pfund aufs Maul.", source: "Gothic" },
  // 8. Gothic 3 (2006)
  { quote: "Wo ist der Guru?", source: "Gothic 3" },
  { quote: "The wild boars are fully automatic.", source: "Gothic 3" },
  { quote: "Es wird nicht verhandelt!", source: "Gothic 3" },
  // 9. Risen (2009)
  { quote: "Was willst du, Inquisitor?", source: "Risen" },
  { quote: "No more magic.", source: "Risen" },
  { quote: "Patti needs help.", source: "Risen" },
  // 10. ELEX (2017)
  { quote: "Death to the Free People.", source: "ELEX" },
  { quote: "Cold logic governs here.", source: "ELEX" },
  { quote: "Jetpack exploration.", source: "ELEX" },
  // 11. Sacred (2004)
  { quote: "Follow the true path.", source: "Sacred" },
  { quote: "Eine Runde Mitleid.", source: "Sacred" },
  { quote: "Where is my horse?", source: "Sacred" },
  // 12. SpellForce: The Order of Dawn (2003)
  { quote: "Rune warriors arise.", source: "SpellForce: The Order of Dawn" },
  { quote: "Building bases, slaying dragons.", source: "SpellForce: The Order of Dawn" },
  { quote: "I am Rohen.", source: "SpellForce: The Order of Dawn" },
  // 13. Desperados: Wanted Dead or Alive (2001)
  { quote: "John Cooper at your service.", source: "Desperados: Wanted Dead or Alive" },
  { quote: "Doc McCoy's sniper shot.", source: "Desperados: Wanted Dead or Alive" },
  { quote: "Gute alte Wildwest-Manier.", source: "Desperados: Wanted Dead or Alive" },
  // 14. Desperados III (2020)
  { quote: "Time to show them how it's done.", source: "Desperados III" },
  { quote: "Isabelle's voodoo.", source: "Desperados III" },
  { quote: "A stealthy lasso down.", source: "Desperados III" },
  // 15. Shadow Tactics: Blades of the Shogun (2016)
  { quote: "The shogun commands it.", source: "Shadow Tactics: Blades of the Shogun" },
  { quote: "A mug of sake.", source: "Shadow Tactics: Blades of the Shogun" },
  { quote: "Mugen's sake trap.", source: "Shadow Tactics: Blades of the Shogun" },
  // 16. Shadow Gambit: The Cursed Crew (2023)
  { quote: "To the Red Marley!", source: "Shadow Gambit: The Cursed Crew" },
  { quote: "Ghost pirates on the loose.", source: "Shadow Gambit: The Cursed Crew" },
  { quote: "Time magic to rewrite history.", source: "Shadow Gambit: The Cursed Crew" },
  // 17. Crysis (2007)
  { quote: "Maximum armor.", source: "Crysis" },
  { quote: "But can it run Crysis?", source: "Crysis" },
  { quote: "Korean jungle tech.", source: "Crysis" },
  // 18. Crysis 2 (2011)
  { quote: "Maximum strength.", source: "Crysis 2" },
  { quote: "They call me Prophet.", source: "Crysis 2" },
  { quote: "New York in ruins.", source: "Crysis 2" },
  // 19. Far Cry (2004)
  { quote: "Jack Carver is having a bad day.", source: "Far Cry" },
  { quote: "Trigents in the jungle.", source: "Far Cry" },
  { quote: "Mercenaries incoming.", source: "Far Cry" },
  // 20. Deponia (2012)
  { quote: "Rufus save us all.", source: "Deponia" },
  { quote: "Huzza - he's a genius!", source: "Deponia" },
  { quote: "Müll für alle!", source: "Deponia" },
  // 21. Edna & Harvey: The Breakout (2008)
  { quote: "Alu-Hut aufsetzen.", source: "Edna & Harvey: The Breakout" },
  { quote: "Hallo Harvey!", source: "Edna & Harvey: The Breakout" },
  { quote: "Sprechende Stoffhasen lügen nicht.", source: "Edna & Harvey: The Breakout" },
  // 22. The Whispered World (2009)
  { quote: "Sadwick's fate.", source: "The Whispered World" },
  { quote: "Spot is my only friend.", source: "The Whispered World" },
  { quote: "The apocalypse is coming.", source: "The Whispered World" },
  // 23. Turrican II: The Final Fight (1991)
  { quote: "Welcome to Turrican.", source: "Turrican II: The Final Fight" },
  { quote: "Shoot or die!", source: "Turrican II: The Final Fight" },
  { quote: "Chris Huelsbeck's legacy.", source: "Turrican II: The Final Fight" },
  // 24. X3: Reunion (2005)
  { quote: "Trade, Fight, Build, Think.", source: "X3: Reunion" },
  { quote: "Argon Prime.", source: "X3: Reunion" },
  { quote: "Sector patrol.", source: "X3: Reunion" },
  // 25. X4: Foundations (2018)
  { quote: "The Boron are missing.", source: "X4: Foundations" },
  { quote: "Fleet commands.", source: "X4: Foundations" },
  { quote: "Space economy simulator.", source: "X4: Foundations" },
  // 26. The Guild 2 (2006)
  { quote: "Rattenfänger!", source: "The Guild 2" },
  { quote: "A dynasty must rise.", source: "The Guild 2" },
  { quote: "Veni, vidi, vici.", source: "The Guild 2" },
  // 27. Patrician III (2003)
  { quote: "A new ship has been finished.", source: "Patrician III" },
  { quote: "Lübeck is prospering.", source: "Patrician III" },
  { quote: "Pirates spotted near Rostock.", source: "Patrician III" },
  // 28. Port Royale (2002)
  { quote: "Buy low, sell high in the Caribbean.", source: "Port Royale" },
  { quote: "Piracy is a business.", source: "Port Royale" },
  { quote: "Galeonen für den Sieg.", source: "Port Royale" },
  // 29. Emergency 4: Global Crusaders (2006)
  { quote: "Einsatz für den Rettungswagen.", source: "Emergency 4: Global Crusaders" },
  { quote: "Achtung, Großbrand!", source: "Emergency 4: Global Crusaders" },
  { quote: "Modding in Emergency 4.", source: "Emergency 4: Global Crusaders" },
  // 30. Dungeons 3 (2017)
  { quote: "The Ultimate Evil has returned.", source: "Dungeons 3" },
  { quote: "Mighty Thalya.", source: "Dungeons 3" },
  { quote: "Kevans voice is legendary.", source: "Dungeons 3" },
  // 31. Enshrouded (2024)
  { quote: "Beware the shroud.", source: "Enshrouded" },
  { quote: "A new spark in the mist.", source: "Enshrouded" },
  { quote: "Voxel building taken to the next level.", source: "Enshrouded" },
  // 32. Pioneers of Pagonia (2023)
  { quote: "Back to the Wuseli-Roots.", source: "Pioneers of Pagonia" },
  { quote: "Volker Wertich's magic.", source: "Pioneers of Pagonia" },
  { quote: "Die Bäcker backen.", source: "Pioneers of Pagonia" },
  // 33. Moorhuhn Jagd (1999)
  { quote: "Reload!", source: "Moorhuhn Jagd" },
  { quote: "90 seconds to shoot them all.", source: "Moorhuhn Jagd" },
  { quote: "Das Moorhuhn geht um.", source: "Moorhuhn Jagd" },
  // 34. Sven Bømwøllen (2002)
  { quote: "Sven is busy.", source: "Sven Bømwøllen" },
  { quote: "Watch out for the shepherd dog.", source: "Sven Bømwøllen" },
  { quote: "Liebe liegt in der Luft.", source: "Sven Bømwøllen" },
  // 35. Blobby Volley (2000)
  { quote: "Eingabe, Eingabe.", source: "Blobby Volley" },
  { quote: "Jumping blobs.", source: "Blobby Volley" },
  { quote: "LAN party classic.", source: "Blobby Volley" },
  // 36. Anstoss 3 (2000)
  { quote: "Ein runder Ball, 90 Minuten.", source: "Anstoss 3" },
  { quote: "Auf gehts Jungs!", source: "Anstoss 3" },
  { quote: "Der Trainer ist heiß.", source: "Anstoss 3" },
  // 37. Bundesliga Manager Professional (1991)
  { quote: "Werner Lorant gefällt das.", source: "Bundesliga Manager Professional" },
  { quote: "Abstiegskampf.", source: "Bundesliga Manager Professional" },
  { quote: "Kaufen, verkaufen, trainieren.", source: "Bundesliga Manager Professional" },
  // 38. Albion (1995)
  { quote: "A spaceship crash on a lush world.", source: "Albion" },
  { quote: "Tom Driscoll's awakening.", source: "Albion" },
  { quote: "Magic vs Technology.", source: "Albion" },
  // 39. Aquanox (2001)
  { quote: "Emerald 'Dead Eye' Flint.", source: "Aquanox" },
  { quote: "Welcome to Aqua.", source: "Aquanox" },
  { quote: "Neocron's underwater cousin.", source: "Aquanox" },
  // 40. Sudden Strike (2000)
  { quote: "Panzer rollen.", source: "Sudden Strike" },
  { quote: "Strategie in Echtzeit.", source: "Sudden Strike" },
  { quote: "Kein Basisbau, nur Krieg.", source: "Sudden Strike" },
  // 41. Age of Empires II: The Age of Kings (1999)
  { quote: "14", source: "Age of Empires II: The Age of Kings" },
  { quote: "WOLOLO!", source: "Age of Empires II: The Age of Kings" },
  { quote: "Das Holzfällerlager.", source: "Age of Empires II: The Age of Kings" },
  // 42. Age of Empires IV (2021)
  { quote: "Schh...", source: "Age of Empires IV" },
  { quote: "Oida!", source: "Age of Empires IV" },
  { quote: "Die Engländer kommen.", source: "Age of Empires IV" },
  // 43. Stronghold Crusader (2002)
  { quote: "Die Leute verlassen die Burg.", source: "Stronghold Crusader" },
  { quote: "Wir benötigen mehr Holz.", source: "Stronghold Crusader" },
  { quote: "You are the greatest lord.", source: "Stronghold Crusader" },
  // 44. Command & Conquer: Red Alert 2 (2000)
  { quote: "Kirov reporting.", source: "Command & Conquer: Red Alert 2" },
  { quote: "Conscript reporting.", source: "Command & Conquer: Red Alert 2" },
  { quote: "Warning, chronosphere activated.", source: "Command & Conquer: Red Alert 2" },
  // 45. Command & Conquer: Generals (2003)
  { quote: "AK-47s for everyone!", source: "Command & Conquer: Generals" },
  { quote: "I will build anywhere.", source: "Command & Conquer: Generals" },
  { quote: "China will grow larger.", source: "Command & Conquer: Generals" },
  // 46. Warcraft III: Reign of Chaos (2002)
  { quote: "Arbeit, Arbeit.", source: "Warcraft III: Reign of Chaos" },
  { quote: "Frostmourne hungers.", source: "Warcraft III: Reign of Chaos" },
  { quote: "Das ist nicht gut.", source: "Warcraft III: Reign of Chaos" },
  // 47. Heroes of Might and Magic III (1999)
  { quote: "Astrologers proclaim the month of the Wood.", source: "Heroes of Might and Magic III" },
  { quote: "More skeletons.", source: "Heroes of Might and Magic III" },
  { quote: "Capitol built.", source: "Heroes of Might and Magic III" },
  // 48. TrackMania Nations Forever (2008)
  { quote: "Press Up to go fast.", source: "TrackMania Nations Forever" },
  { quote: "Nadeo blocks.", source: "TrackMania Nations Forever" },
  { quote: "The stadium calls.", source: "TrackMania Nations Forever" },
  // 49. Diablo III (2012)
  { quote: "Do you guys not have phones?", source: "Diablo III" },
  { quote: "Error 37.", source: "Diablo III" },
  { quote: "Ah, fresh meat!", source: "Diablo III" },
  // 50. The Elder Scrolls III: Morrowind (2002)
  { quote: "Outlander.", source: "The Elder Scrolls III: Morrowind" },
  { quote: "You N'wah!", source: "The Elder Scrolls III: Morrowind" },
  { quote: "Cliff racer noises.", source: "The Elder Scrolls III: Morrowind" },
  // 51. RollerCoaster Tycoon 2 (2002)
  { quote: "Achterbahn 1 is broken.", source: "RollerCoaster Tycoon 2" },
  { quote: "The ride never ends.", source: "RollerCoaster Tycoon 2" },
  { quote: "I want to get off Mr. Bones Wild Ride.", source: "RollerCoaster Tycoon 2" },
  // 52. Theme Hospital (1997)
  { quote: "Patients are asked not to die in the corridors.", source: "Theme Hospital" },
  { quote: "Doctor required in inflation clinic.", source: "Theme Hospital" },
  { quote: "Krankenhaus Simulator.", source: "Theme Hospital" },
  // 53. Zoo Tycoon (2001)
  { quote: "The T-Rex got out.", source: "Zoo Tycoon" },
  { quote: "Zookeeper is cleaning.", source: "Zoo Tycoon" },
  { quote: "Poo everywhere.", source: "Zoo Tycoon" },
  // 54. Dungeon Keeper 2 (1999)
  { quote: "It is payday.", source: "Dungeon Keeper 2" },
  { quote: "Your minions are angry.", source: "Dungeon Keeper 2" },
  { quote: "A horn of plenty.", source: "Dungeon Keeper 2" },
  // 55. S.T.A.L.K.E.R.: Shadow of Chernobyl (2007)
  { quote: "Cheeki breeki iv damke!", source: "S.T.A.L.K.E.R.: Shadow of Chernobyl" },
  { quote: "Get out of here, Stalker.", source: "S.T.A.L.K.E.R.: Shadow of Chernobyl" },
  { quote: "Anomalies detected.", source: "S.T.A.L.K.E.R.: Shadow of Chernobyl" },
  // 56. Metro 2033 (2010)
  { quote: "Artyom!", source: "Metro 2033" },
  { quote: "Bullets are money.", source: "Metro 2033" },
  { quote: "Don't trust the dark ones.", source: "Metro 2033" },
  // 57. Kingdom Come: Deliverance (2018)
  { quote: "Jesus Christ be praised!", source: "Kingdom Come: Deliverance" },
  { quote: "Henry's come to see us!", source: "Kingdom Come: Deliverance" },
  { quote: "Kurva!", source: "Kingdom Come: Deliverance" },
  // 58. Mafia: The City of Lost Heaven (2002)
  { quote: "Mr. Salieri sends his regards.", source: "Mafia: The City of Lost Heaven" },
  { quote: "The race mission.", source: "Mafia: The City of Lost Heaven" },
  { quote: "Tommy Angelo's fate.", source: "Mafia: The City of Lost Heaven" },
  // 59. Total War: Medieval II (2006)
  { quote: "For Christendom!", source: "Total War: Medieval II" },
  { quote: "Milan has betrayed you.", source: "Total War: Medieval II" },
  { quote: "Dread vs Chivalry.", source: "Total War: Medieval II" },
  // 60. Total War: Rome (2004)
  { quote: "Triarii!", source: "Total War: Rome" },
  { quote: "Rome demands endless conquest.", source: "Total War: Rome" },
  { quote: "Elephants running amok.", source: "Total War: Rome" },
  // 61. Counter-Strike: Global Offensive (2012)
  { quote: "Rush B blyat.", source: "Counter-Strike: Global Offensive" },
  { quote: "Drop AVP pls.", source: "Counter-Strike: Global Offensive" },
  { quote: "Bomb has been defused.", source: "Counter-Strike: Global Offensive" },
  // 62. Battlefield 1942 (2002)
  { quote: "Wake Island.", source: "Battlefield 1942" },
  { quote: "I need a medic!", source: "Battlefield 1942" },
  { quote: "Bazooka vs Tank.", source: "Battlefield 1942" },
  // 63. Battlefield 2 (2005)
  { quote: "Enemy boat spotted.", source: "Battlefield 2" },
  { quote: "Strike at Karkand.", source: "Battlefield 2" },
  { quote: "C4 on the buggy.", source: "Battlefield 2" },
  // 64. Battlefield 3 (2011)
  { quote: "Operation Metro meatgrinder.", source: "Battlefield 3" },
  { quote: "Sun destruction.", source: "Battlefield 3" },
  { quote: "Blue tint.", source: "Battlefield 3" },
  // 65. Unreal Tournament (1999)
  { quote: "M-m-m-monster kill!", source: "Unreal Tournament" },
  { quote: "Facing Worlds.", source: "Unreal Tournament" },
  { quote: "Flak cannon in your face.", source: "Unreal Tournament" },
  // 66. Quake III Arena (1999)
  { quote: "Impressive.", source: "Quake III Arena" },
  { quote: "Quad damage!", source: "Quake III Arena" },
  { quote: "Rocket jump!", source: "Quake III Arena" },
  // 67. Need for Speed: Underground 2 (2004)
  { quote: "Riders on the storm...", source: "Need for Speed: Underground 2" },
  { quote: "Pimp my ride.", source: "Need for Speed: Underground 2" },
  { quote: "Neon underglow.", source: "Need for Speed: Underground 2" },
  // 68. Need for Speed: Most Wanted (2005)
  { quote: "Nine-Tenths of the law.", source: "Need for Speed: Most Wanted" },
  { quote: "Sgt. Cross is on your tail.", source: "Need for Speed: Most Wanted" },
  { quote: "BMW M3 GTR.", source: "Need for Speed: Most Wanted" },
  // 69. Burnout 3: Takedown (2004)
  { quote: "We are the lazy generation.", source: "Burnout 3: Takedown" },
  { quote: "Signature Takedown.", source: "Burnout 3: Takedown" },
  { quote: "Road rage.", source: "Burnout 3: Takedown" },
  // 70. FlatOut 2 (2006)
  { quote: "Ragdoll physics.", source: "FlatOut 2" },
  { quote: "Water canal race.", source: "FlatOut 2" },
  { quote: "Maximum destruction.", source: "FlatOut 2" },
  // 71. Farming Simulator 22 (2021)
  { quote: "Trecker fahrn.", source: "Farming Simulator 22" },
  { quote: "A good harvest.", source: "Farming Simulator 22" },
  { quote: "Modding my tractor.", source: "Farming Simulator 22" },
  // 72. Farming Simulator 19 (2018)
  { quote: "Hektarweise.", source: "Farming Simulator 19" },
  { quote: "Die Ernte ruft.", source: "Farming Simulator 19" },
  { quote: "Güllerunde.", source: "Farming Simulator 19" },
  // 73. Euro Truck Simulator 2 (2012)
  { quote: "Just cruising through Germany.", source: "Euro Truck Simulator 2" },
  { quote: "Radio on, miles to go.", source: "Euro Truck Simulator 2" },
  { quote: "I missed the exit!", source: "Euro Truck Simulator 2" },
  // 74. Microsoft Flight Simulator (2020)
  { quote: "Frankfurt to Munich.", source: "Microsoft Flight Simulator" },
  { quote: "Butter the bread.", source: "Microsoft Flight Simulator" },
  { quote: "My house is down there.", source: "Microsoft Flight Simulator" },
  // 75. Satisfactory (2024)
  { quote: "Spaghetti factory.", source: "Satisfactory" },
  { quote: "FICSIT does not waste.", source: "Satisfactory" },
  { quote: "A new conveyor belt.", source: "Satisfactory" },
  // 76. Factorio (2020)
  { quote: "The factory must grow.", source: "Factorio" },
  { quote: "Biters incoming.", source: "Factorio" },
  { quote: "Inserter chains.", source: "Factorio" },
  // 77. Cities: Skylines (2015)
  { quote: "Traffic jams everywhere.", source: "Cities: Skylines" },
  { quote: "Meteor strike inbound.", source: "Cities: Skylines" },
  { quote: "Roundabouts fix everything.", source: "Cities: Skylines" },
  // 78. SimCity 4 (2003)
  { quote: "Funding for roads slashed.", source: "SimCity 4" },
  { quote: "Aliens attack!", source: "SimCity 4" },
  { quote: "Rush Hour expansion.", source: "SimCity 4" },
  // 79. Railway Empire (2018)
  { quote: "Choo choo!", source: "Railway Empire" },
  { quote: "Laying the tracks.", source: "Railway Empire" },
  { quote: "Steam engines rule.", source: "Railway Empire" },
  // 80. Construction Simulator (2022)
  { quote: "Baggerfahren.", source: "Construction Simulator" },
  { quote: "Ein Loch graben.", source: "Construction Simulator" },
  { quote: "Concrete delivery.", source: "Construction Simulator" },
  // 81. Bus Simulator 21 (2021)
  { quote: "Bitte zurückbleiben.", source: "Bus Simulator 21" },
  { quote: "Fahrscheinkontrolle.", source: "Bus Simulator 21" },
  { quote: "Mind the gap.", source: "Bus Simulator 21" },
  // 82. OMSI 2: The Bus Simulator (2013)
  { quote: "Rathaus Spandau.", source: "OMSI 2: The Bus Simulator" },
  { quote: "Einmal Kurzstrecke bitte.", source: "OMSI 2: The Bus Simulator" },
  { quote: "Die Heizung ist kaputt.", source: "OMSI 2: The Bus Simulator" },
  // 83. Train Sim World 4 (2023)
  { quote: "Sifa, Sifa.", source: "Train Sim World 4" },
  { quote: "PZB Zwangsbremsung.", source: "Train Sim World 4" },
  { quote: "Next stop: Hauptbahnhof.", source: "Train Sim World 4" },
  // 84. My Summer Car (2016)
  { quote: "Perkele!", source: "My Summer Car" },
  { quote: "Satsuma building.", source: "My Summer Car" },
  { quote: "Drinking beer and building a car.", source: "My Summer Car" },
  // 85. Fernbus Simulator (2016)
  { quote: "Autobahn cruising.", source: "Fernbus Simulator" },
  { quote: "FlixBus vibes.", source: "Fernbus Simulator" },
  { quote: "Please store your luggage.", source: "Fernbus Simulator" },
  // 86. FIFA 13 (2012)
  { quote: "Ibarbo, Doumbia, Gervinho.", source: "FIFA 13" },
  { quote: "Sweaty goals.", source: "FIFA 13" },
  { quote: "Scripting!", source: "FIFA 13" },
  // 87. EA Sports FC 24 (2023)
  { quote: "Cutback goals.", source: "EA Sports FC 24" },
  { quote: "FUT packs.", source: "EA Sports FC 24" },
  { quote: "E-Sports ready.", source: "EA Sports FC 24" },
  // 88. Pro Evolution Soccer 6 (2006)
  { quote: "Adriano 99 shot power.", source: "Pro Evolution Soccer 6" },
  { quote: "Master League.", source: "Pro Evolution Soccer 6" },
  { quote: "Castolo and Minanda.", source: "Pro Evolution Soccer 6" },
  // 89. World of Tanks (2010)
  { quote: "We didn't even scratch them!", source: "World of Tanks" },
  { quote: "Ricochet!", source: "World of Tanks" },
  { quote: "Arty is unfair.", source: "World of Tanks" },
  // 90. Guild Wars 2 (2012)
  { quote: "By Ogden's hammer, what savings!", source: "Guild Wars 2" },
  { quote: "Lion's Arch under attack.", source: "Guild Wars 2" },
  { quote: "More charr.", source: "Guild Wars 2" },
  // 91. Metin2 (2004)
  { quote: "VZK G.", source: "Metin2" },
  { quote: "Gibtst du mal yang?", source: "Metin2" },
  { quote: "Schmied hat mein Schwert zerstört.", source: "Metin2" },
  // 92. Darkorbit (2006)
  { quote: "Uri sammeln.", source: "Darkorbit" },
  { quote: "Goliath ship.", source: "Darkorbit" },
  { quote: "FE (Full Elite).", source: "Darkorbit" },
  // 93. OGame (2002)
  { quote: "Fleet saved.", source: "OGame" },
  { quote: "Todesstern incoming.", source: "OGame" },
  { quote: "Ressourcen sammeln.", source: "OGame" },
  // 94. Tribal Wars [Die Stämme] (2003)
  { quote: "AGs losschicken.", source: "Tribal Wars" },
  { quote: "Wall wurde auf Stufe 0 gebombt.", source: "Tribal Wars" },
  { quote: "Incomings!", source: "Tribal Wars" },
  // 95. Forge of Empires (2012)
  { quote: "FP tauschen.", source: "Forge of Empires" },
  { quote: "GEX stufe 4.", source: "Forge of Empires" },
  { quote: "Taverne besuchen.", source: "Forge of Empires" },
  // 96. Left 4 Dead 2 (2009)
  { quote: "Ellis, shut up!", source: "Left 4 Dead 2" },
  { quote: "Spitter!", source: "Left 4 Dead 2" },
  { quote: "Adrenaline shot.", source: "Left 4 Dead 2" },
  // 97. Cyberpunk 2077 (2020)
  { quote: "Wake the fuck up, Samurai.", source: "Cyberpunk 2077" },
  { quote: "Edgerunners.", source: "Cyberpunk 2077" },
  { quote: "T-pose while driving.", source: "Cyberpunk 2077" },
  // 98. Palworld (2024)
  { quote: "Pal spheres.", source: "Palworld" },
  { quote: "Depresso.", source: "Palworld" },
  { quote: "Ethical treatment of Pals? What is that?", source: "Palworld" },
  // 99. Helldivers 2 (2024)
  { quote: "Have a cup of Liber-tea!", source: "Helldivers 2" },
  { quote: "For Super Earth!", source: "Helldivers 2" },
  { quote: "Calling in an Eagle!", source: "Helldivers 2" },
  // 100. Valheim (2021)
  { quote: "The bees are happy.", source: "Valheim" },
  { quote: "Odin is watching.", source: "Valheim" },
  { quote: "Tree falling mechanics.", source: "Valheim" }
];

const filePath = './src/lib/flavorTexts.ts';
let content = fs.readFileSync(filePath, 'utf8');
const match = content.match(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = (\{[\s\S]*?\});\n\nexport function/);
const obj = eval('(' + match[1] + ')');

let gameArr = obj['Game'] || [];

for (const quoteObj of GAMING_QUOTES) {
  const exists = gameArr.some((entry: any) => {
    if (typeof entry === 'string') return entry === quoteObj.quote;
    return entry.quote === quoteObj.quote;
  });
  
  if (!exists) {
    gameArr.push(quoteObj);
  }
}

obj['Game'] = gameArr;

const exportString = "export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry[]> = " + JSON.stringify(obj, null, 2) + ";";
content = content.replace(/export const MEDIA_FLAVOR_TEXTS: Record<string, FlavorTextEntry\[\]> = \{[\s\S]*?\};\n/, exportString + '\n');
fs.writeFileSync(filePath, content);
console.log("Successfully written Germany's favorite games!");
