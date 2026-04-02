import { useState, useRef, useEffect, useMemo } from "react";

const EMOJI_CATEGORIES = [
  {
    name: "People",
    emojis: [
      // Faces
      "😀","😂","😍","😎","🤔","😱","😴","🤯","🥳","😤","🥺","🤩","😰","😈",
      "🥴","🤑","😏","🧐","😬","🫠","🤠","😭","😡","🤫","🫡","🥶","🤧","😷",
      // People & roles
      "👶","👧","👨","👩","👴","👵","🧙","👮","🕵️","🧑‍🍳","🧑‍🚒","🤷",
      "🦸","🦹","🧟","🧛","🧝","🎅","🧑‍🎤","🧑‍💻","🧑‍🔬","🧑‍🎨","🧑‍🏫",
      "🤴","🫅","🧜","🧞","🧚","🧏","🧑‍⚕️","🧑‍🌾","🧑‍🔧","🧑‍✈️","🧑‍🚀",
      // Fantasy / abstract
      "💀","👻","🤖","👑","💪","🦾","👋","🤝","🫂","🫶",
      // Body & senses
      "👀","🧠","❤️","💔","💍","🫀",
      "🦶","👣","🦵","🦴","👃","👂","🦷","🤲","🙌","👏",
    ],
  },
  {
    name: "Activities",
    emojis: [
      // Movement
      "🏃","💃","🕺","🧍","🧎","🧘",
      // Snow & water sports
      "⛷️","🏂","🏊","🤽","🚴","🛹","🛼","🪂","🤺","🏇","🏄","🤿","🛷","⛸️",
      // Gym / combat
      "🤸","🧗","🏋️","🤼","🤾","🥊","🥋","🏹","🎣","🪃",
      // Ball sports
      "⚽","🏀","🏈","⚾","🎾","🏐","🏒","🏓","🏸","⛳","🎳","🏌️","🎽",
      // Arts & performance
      "🎭","🎨","🎬","🎤","🎸","🎹","🥁","🎺","🎻","🪗","🪘","🪇",
      // Games
      "🎮","🕹️","🃏","♟️","🎲","🧩","🎯","🪀","🪁",
      // Events & celebrations
      "🎪","🎠","🎡","🎢","🤹","🧨","🪅","🎆","🎇","🛍️","🛌",
      // Sleeping / resting
      "🥱","🛀","🧖","🚵",
    ],
  },
  {
    name: "Animals",
    emojis: [
      // Mammals – pets & wild
      "🐶","🐱","🐭","🐸","🐵","🦁","🐯","🐻","🐼","🐨","🦊","🐺","🦝",
      "🦄","🐴","🐑","🐐","🦌","🐇","🐮","🐷","🦙","🦘","🦡","🦫","🦬",
      // Birds
      "🐧","🐦","🦅","🦚","🦜","🦩","🐓","🦆","🦉","🦇","🦃","🦢","🕊️","🦤",
      // Reptiles
      "🐍","🐢","🦎","🐊","🦖","🦕","🐲","🐉",
      // Sea life
      "🐟","🦈","🐬","🐳","🦞","🦀","🐙","🦑","🐠","🐡","🦭","🦐",
      // Insects & bugs
      "🦋","🐛","🐝","🐞","🦟","🪲","🪳","🦗","🕷️","🦂",
      // Large land animals
      "🐘","🦒","🦓","🦏","🐪","🦛","🦔","🐿️","🦥","🦦","🐾","🦣",
    ],
  },
  {
    name: "Food",
    emojis: [
      // Fruits
      "🍎","🍋","🍌","🍉","🍇","🍓","🫐","🍑","🥝","🥑",
      "🍊","🍒","🍐","🌰","🫒","🍈","🍏",
      // Vegetables
      "🥕","🌽","🧅","🧄","🥦","🥬","🥔","🫑","🌶️","🥒",
      // Fast food & street food
      "🍕","🍔","🌮","🌭","🥞","🧇","🥓","🍟","🌯","🥙","🧆","🥚","🧀",
      "🥪","🫔","🫓","🥜","🧈",
      // World food
      "🍣","🍜","🍝","🍲","🍛","🍱","🥘","🍗","🍖","🥩",
      "🍤","🥮","🍢","🥟","🍙","🍚","🍘","🍥","🥯","🫕",
      // Bread & salad
      "🥐","🥖","🥗","🍞","🥣",
      // Sweets & desserts
      "🍰","🎂","🧁","🍩","🍪","🍫","🍦","🍿","🍧","🍭","🍬","🍡","🧃",
      // Drinks
      "🫖","☕","🍵","🧋","🍷","🍺","🍸","🍹","🥃","🥤","🧂","🥛","🍶","🧊",
      "🧉","🍾","🫗",
    ],
  },
  {
    name: "Travel",
    emojis: [
      // Road vehicles
      "🚗","🏎️","🚕","🚌","🚜","🛻","🚑","🚒","🚓","🏍️","🚐","🛺","🚙",
      // Rail & water & air
      "🚂","🚢","🛳️","✈️","🛫","🚀","🛸","🚁","⛵","🚲","🛵","🚤","🚠","🛩️",
      // Infrastructure
      "🛤️","⛽","🚏","🛞","🛣️",
      // Buildings & landmarks
      "🏠","🏨","🏰","🏯","🗽","🗼","🕌","⛩️","🏟️","🏗️","🏛️","⛪","🕍","🛕",
      "🏬","🏦","🏥","🏫","🏪","🗺️",
      // Outdoors & geography
      "🏖️","🏕️","🌍","🧭","🧳","🏜️","🏞️","🌐",
      "⛰️","🌋","🏔️","🏝️","🌅","🌃","🌆","🌉","🏙️",
    ],
  },
  {
    name: "Nature",
    emojis: [
      // Sky & weather
      "☀️","🌞","🌙","🌜","⭐","🌟","💫","☄️","🌈","⚡","🔥","💧","🌊",
      "❄️","⛄","🌬️","🌫️","🌧️","⛈️","🌪️","☁️","⛅","🌤️","🌡️","🌀","🌂",
      // Plants & flowers
      "🌸","🌺","🌻","🌹","🌷","🍀","🍂","🍃","🌲","🌵","🌴",
      "🪨","🪵","🌾","🪸","🌿","🪴","🌱","🍁","🪷","🫧","🪺","🪻","🌏","🌎",
      // Space & minerals
      "💎","🌑","🌕","🪐","🌠","🌌","🔭","🛰️","🌖",
    ],
  },
  {
    name: "Objects",
    emojis: [
      // Tech
      "📱","💻","🖥️","⌨️","📷","📻","📡","🔋","📺","📠","🖨️","💾","📟",
      // Security & tools
      "🔑","🔒","🧲","💡","🔧","🔨","⚙️","🧰","🪛","🔦","🔐","🗝️",
      // Magic & mystery
      "🔮","🪄","💣","⚗️","🏺","🧿","🪬","🎴","🀄",
      // Finance & shopping
      "💰","💳","🛒","🎁","🎈","💸","🏧","💵",
      // Trophies & study
      "🏆","🥇","📚","✏️","📝","✂️","🏅","🥈","🥉","📖","📜","🗃️",
      // Home
      "🛁","🪞","🪥","🚪","🛋️","🛗","🪑","🧺","🧹","🪣","🗑️","🪠",
      // Toys & festive
      "🧸","🪆","🎃","🎄","🪜","🪩","🎑","🎟️","🎫","🎐","🎋",
      // Emergency & comms
      "🚨","🔔","⏰","📞","🎥","🔊","📯","🔕","🎷",
      // Medical & science
      "🩺","💊","🩹","🧬","🧪","🔬","🩻","🧫",
      // Weapons & adventure
      "⚔️","🛡️","🗡️","🪤","⚖️","🪖","⛏️","🔱",
      // Clothing
      "👒","🎩","👓","🪮","💄","👟","👠","👜","🎒","🧣","🧤","🧥",
    ],
  },
  {
    name: "Symbols",
    emojis: [
      // Arrows & direction
      "⬆️","⬇️","➡️","⬅️","↩️","🔄","↗️","↘️","↙️","↖️","🔃",
      // Status
      "✅","❌","❓","❗","💯","🆒","🆙","🆘","🆕","‼️","⁉️","🔞","🈵",
      // Colours & shapes
      "🔴","🟠","🟡","🟢","🔵","🟣","🔷","🔶","⬛","⬜","🟥","🟦","🟨",
      // Flags
      "🏴","🏳️","🏴‍☠️","🚩","🏁","🎌","🏳️‍🌈",
      // Warning & actions
      "⚠️","🚫","♻️","➕","➖","✖️","➗","♾️","🔰","⭕","🆗",
      // Effects & energy
      "💤","💢","💥","💦","💨","🔅","✨","💠","🔆","🔀","🔸",
      // Sound & music
      "🎵","🎶","🔉","🔇","🔈","🎙️","📣","📢",
      // Hand gestures (not in People)
      "👆","☝️","👇","👉","👈","🙏","✌️","🤞","🤙","👍","👎","🖕","✋","🤚",
      // Speech & time
      "💬","💭","🕐","🕛","⏱️","⏳","⌛","🗓️","📅",
      // Numbers & math
      "1️⃣","2️⃣","3️⃣","🔟","🔡","🔢",
    ],
  },
];

// Emoji name/keyword map for search. One string per emoji with space-separated keywords.
const EMOJI_NAMES = {
  // People – faces
  "😀":"grinning face happy smile","😂":"face tears joy laughing crying","😍":"heart eyes love adore",
  "😎":"cool sunglasses confident","🤔":"thinking pondering hmm","😱":"screaming fear shock scared",
  "😴":"sleeping tired zzz snooze","🤯":"mind blown exploding head shocked","🥳":"party face celebrate birthday",
  "😤":"huffing angry annoyed steam","🥺":"pleading puppy eyes sad","🤩":"star struck excited starstruck",
  "😰":"anxious sweat nervous worried","😈":"devil smiling evil mischief","🥴":"woozy dizzy drunk tipsy",
  "🤑":"money mouth rich greedy","😏":"smirking smug sly","🧐":"monocle detective curious inspect",
  "😬":"grimace awkward nervous","🫠":"melting face melting weird","🤠":"cowboy hat western",
  "😭":"crying sob tears sad weeping","😡":"angry red mad rage","🤫":"shushing quiet secret silence",
  "🫡":"saluting respect military","🥶":"cold frozen shivering ice","🤧":"sneezing sick ill cold",
  "😷":"mask sick medical virus",
  // People – roles
  "👶":"baby infant child small","👧":"girl young female","👨":"man male person",
  "👩":"woman female person","👴":"old man elderly grandfather","👵":"old woman elderly grandmother",
  "🧙":"wizard mage magic spell","👮":"police officer cop law","🕵️":"detective spy investigator",
  "🧑‍🍳":"chef cook kitchen food","🧑‍🚒":"firefighter fire rescue","🤷":"shrug dunno whatever",
  "🦸":"superhero hero cape power","🦹":"supervillain villain evil","🧟":"zombie undead horror",
  "🧛":"vampire dracula bat blood","🧝":"elf fantasy lord rings","🎅":"santa claus christmas winter",
  "🧑‍🎤":"musician rock star singer","🧑‍💻":"coder programmer developer tech",
  "🧑‍🔬":"scientist lab research","🧑‍🎨":"artist painter creative","🧑‍🏫":"teacher professor school",
  "🤴":"prince royalty crown","🫅":"person with crown royalty","🧜":"mermaid sea ocean fantasy",
  "🧞":"genie magic wish lamp","🧚":"fairy wings magic","🧏":"deaf sign language",
  "🧑‍⚕️":"doctor nurse health medical","🧑‍🌾":"farmer agriculture crops","🧑‍🔧":"mechanic tools repair",
  "🧑‍✈️":"pilot flight airplane","🧑‍🚀":"astronaut space rocket",
  // People – abstract / body
  "💀":"skull death dead skeleton","👻":"ghost spooky haunted","🤖":"robot machine AI android",
  "👑":"crown royal king queen","💪":"muscle strong flex","🦾":"robot arm cyborg mechanical arm",
  "👋":"wave hello goodbye","🤝":"handshake deal agreement","🫂":"hug embrace comfort",
  "🫶":"heart hands love care","👀":"eyes looking watching","🧠":"brain smart think intelligent",
  "❤️":"heart love red","💔":"broken heart sad heartbreak","💍":"ring wedding engagement",
  "🫀":"anatomical heart organ","🦶":"foot kick","👣":"footprints walking trail",
  "🦵":"leg kick knee","🦴":"bone skeleton dog","👃":"nose smell sniff","👂":"ear listen hearing",
  "🦷":"tooth dentist bite","🤲":"hands prayer open","🙌":"celebrate clap hands up","👏":"clapping applause",
  // Activities – movement
  "🏃":"running sprint jogging","💃":"dancing woman salsa","🕺":"dancing man disco",
  "🧍":"standing person","🧎":"kneeling person pray","🧘":"meditation yoga zen calm",
  // Activities – sports
  "⛷️":"skiing snow mountain winter sport","🏂":"snowboard winter sport",
  "🏊":"swimming pool water sport","🤽":"water polo swimming","🚴":"cycling bicycle sport",
  "🛹":"skateboard skate trick","🛼":"roller skates skating","🪂":"parachute skydiving",
  "🤺":"fencing sword duel","🏇":"horse racing jockey","🏄":"surfing wave beach","🤿":"diving scuba mask",
  "🛷":"sled sledding winter","⛸️":"ice skating rink winter","🤸":"gymnastics cartwheel flip",
  "🧗":"rock climbing wall bouldering","🏋️":"weightlifting gym strong","🤼":"wrestling grapple",
  "🤾":"handball throw ball","🥊":"boxing gloves fight punch","🥋":"martial arts karate judo",
  "🏹":"archery bow arrow","🎣":"fishing rod lake","🪃":"boomerang throw return",
  "⚽":"soccer football kick","🏀":"basketball hoop dunk","🏈":"american football touchdown",
  "⚾":"baseball bat diamond","🎾":"tennis racket court","🏐":"volleyball spike net",
  "🏒":"hockey ice stick puck","🏓":"ping pong table tennis","🏸":"badminton shuttle",
  "⛳":"golf hole par tee","🎳":"bowling pins ball","🏌️":"golf swing course","🎽":"sports jersey shirt athletic",
  "🥱":"yawning tired sleepy bored","🛀":"bath bathtub soak relax","🚵":"mountain biking trail outdoor",
  // Activities – arts and performance
  "🎭":"theatre drama masks performance","🎨":"art painting palette","🎬":"movie camera film director",
  "🎤":"microphone sing karaoke","🎸":"guitar electric rock music","🎹":"piano keys keyboard music",
  "🥁":"drums drumming beat rhythm","🎺":"trumpet jazz brass music","🎻":"violin fiddle strings",
  "🪗":"accordion music folk","🪘":"drum bongo percussion","🪇":"maracas shaking music",
  // Activities – games and events
  "🎮":"video game controller gaming","🕹️":"joystick arcade game","🃏":"playing card joker deck",
  "♟️":"chess strategy pawn","🎲":"dice roll game chance","🧩":"puzzle jigsaw pieces",
  "🎯":"target bullseye dart aim","🪀":"yo-yo toy spin","🪁":"slingshot launch",
  "🎪":"circus tent performance","🎠":"carousel merry go round","🎡":"ferris wheel fair amusement",
  "🎢":"roller coaster ride thrill","🤹":"juggling circus clown","🧨":"firecracker explosion bang",
  "🪅":"pinata party smash","🎆":"fireworks celebration","🎇":"sparkler new year","🛍️":"shopping bags",
  // Animals – mammals
  "🐶":"dog puppy pet bark","🐱":"cat kitten meow purr","🐭":"mouse rat rodent",
  "🐸":"frog green pond jump","🐵":"monkey ape banana","🦁":"lion mane king jungle",
  "🐯":"tiger stripes big cat","🐻":"bear brown grizzly","🐼":"panda black white bamboo",
  "🐨":"koala australia marsupial","🦊":"fox clever orange tail","🐺":"wolf howl pack moon",
  "🦝":"raccoon trash mask","🦄":"unicorn magic rainbow horn","🐴":"horse ride gallop",
  "🐑":"sheep wool lamb","🐐":"goat mountain billy","🦌":"deer antlers bambi",
  "🐇":"rabbit bunny hop easter","🐮":"cow moo farm dairy","🐷":"pig oink bacon farm",
  "🦙":"llama peru wool","🦘":"kangaroo australia pouch jump","🦡":"badger stripe woodland",
  "🦫":"beaver dam wood water","🦬":"bison buffalo plains",
  // Animals – birds
  "🐧":"penguin antarctica cold tuxedo","🐦":"bird tweet wing fly","🦅":"eagle majestic national bird",
  "🦚":"peacock feathers colorful proud","🦜":"parrot tropical talk color",
  "🦩":"flamingo pink leg balance","🐓":"chicken rooster farm cock",
  "🦆":"duck quack pond water","🦉":"owl wise night wisdom","🦇":"bat cave nocturnal halloween",
  "🦃":"turkey thanksgiving gobble","🦢":"swan grace elegant lake",
  "🕊️":"dove peace white bird","🦤":"dodo extinct bird island",
  // Animals – reptiles and sea
  "🐍":"snake slither venom reptile","🐢":"turtle slow shell","🦎":"lizard gecko scales",
  "🐊":"crocodile alligator swamp jaw","🦖":"t-rex dinosaur jurassic trex",
  "🦕":"brontosaurus diplodocus dinosaur long neck","🐲":"dragon fire fantasy wings",
  "🐉":"chinese dragon fire fantasy","🦐":"shrimp prawn seafood small",
  "🐟":"fish swim ocean sea","🦈":"shark jaws ocean predator attack","🐬":"dolphin smart ocean",
  "🐳":"whale big ocean blue spout","🦞":"lobster red seafood","🦀":"crab claws sideways red",
  "🐙":"octopus tentacles ink sea","🦑":"squid calamari ink ocean","🐠":"tropical fish colorful reef",
  "🐡":"blowfish puffer fish spiky","🦭":"seal fur beach ocean",
  // Animals – insects
  "🦋":"butterfly wings colorful metamorphosis","🐛":"caterpillar worm crawl larva",
  "🐝":"bee honey buzz yellow black","🐞":"ladybug red spots luck","🦟":"mosquito bite buzz",
  "🪲":"beetle bug insect","🪳":"cockroach pest roach","🦗":"cricket chirp jump insect",
  "🕷️":"spider web eight legs","🦂":"scorpion sting desert venomous",
  // Animals – large
  "🐘":"elephant trunk big memory","🦒":"giraffe tall neck spots",
  "🦓":"zebra stripes africa","🦏":"rhino horn thick skin","🐪":"camel hump desert",
  "🦛":"hippo water heavy large","🦔":"hedgehog spines prickly","🐿️":"squirrel acorn tree nuts",
  "🦥":"sloth slow tree lazy","🦦":"otter river playful","🐾":"paw print animal track","🦣":"mammoth tusks extinct",
  // Food
  "🍎":"apple red fruit","🍋":"lemon yellow sour citrus","🍌":"banana yellow tropical",
  "🍉":"watermelon summer green red","🍇":"grapes vine wine purple","🍓":"strawberry red sweet",
  "🫐":"blueberry purple small","🍑":"peach soft fuzzy","🥝":"kiwi green tropical","🥑":"avocado guacamole toast",
  "🍊":"orange citrus round","🍒":"cherry red pair stem","🍐":"pear green fruit",
  "🌰":"chestnut nut tree autumn","🫒":"olive oil branch mediterranean","🍈":"melon cantaloupe","🍏":"green apple",
  "🥕":"carrot orange vegetable","🌽":"corn maize summer","🧅":"onion tear cry vegetable",
  "🧄":"garlic smell vampire","🥦":"broccoli green vegetable","🥬":"lettuce green salad",
  "🥔":"potato irish fries","🫑":"bell pepper red green","🌶️":"chili pepper hot spicy","🥒":"cucumber green vegetable pickle",
  "🍕":"pizza italian cheese slice","🍔":"hamburger burger patty","🌮":"taco mexican shell",
  "🌭":"hot dog sausage mustard","🥞":"pancakes stack maple syrup","🧇":"waffle grid breakfast",
  "🥓":"bacon strips breakfast","🍟":"french fries chips fast food","🌯":"wrap burrito tortilla",
  "🥙":"pita wrap stuffed","🧆":"falafel middle eastern","🥚":"egg breakfast cook","🧀":"cheese wheel dairy",
  "🥪":"sandwich bread lunch","🫔":"wrapped tortilla","🥨":"pretzel salty bread twist","🫓":"flatbread pita naan","🥜":"peanut nut legume",
  "🍣":"sushi roll japanese rice","🍜":"ramen noodles soup bowl","🍝":"spaghetti pasta italian",
  "🍲":"pot stew soup cooking","🍛":"curry rice indian","🍱":"bento box japanese lunch",
  "🥘":"paella rice seafood stew","🍗":"chicken leg drumstick","🍖":"meat bone BBQ","🥩":"steak meat red",
  "🍤":"fried shrimp seafood","🥮":"mooncake chinese pastry","🍢":"skewer oden food","🥟":"dumpling gyoza",
  "🍙":"rice ball japanese onigiri","🍚":"rice bowl white","🍘":"rice cracker japanese",
  "🍥":"fish cake spiral","🥯":"bagel bread ring sesame","🫕":"fondue pot dip",
  "🥐":"croissant french pastry flaky","🥖":"baguette french bread","🥗":"salad green healthy",
  "🍞":"bread loaf bake","🥣":"bowl cereal breakfast porridge",
  "🍰":"cake slice dessert birthday","🎂":"birthday cake candles celebrate","🧁":"cupcake frosting small",
  "🍩":"donut ring glaze hole","🍪":"cookie chocolate chip bake","🍫":"chocolate bar sweet candy",
  "🍦":"ice cream soft serve cone","🍿":"popcorn movie cinema","🍧":"shaved ice dessert",
  "🍭":"lollipop candy stick","🍬":"candy sweet wrapper","🍡":"dango japanese sweet",
  "🫖":"teapot brew kettle","☕":"coffee hot cup morning","🍵":"tea green cup warm","🧋":"boba tea bubble milk tea",
  "🍷":"wine red glass grape","🍺":"beer mug pint foam","🍸":"cocktail martini glass",
  "🍹":"tropical drink umbrella cocktail","🥃":"whiskey glass scotch tumbler","🥤":"soda cup straw drink",
  "🧂":"salt shaker seasoning flavour","🥛":"milk white glass dairy","🍶":"sake japanese rice wine","🧊":"ice cube cold",
  "🧉":"mate drink straw gourd","🍾":"champagne celebration bottle pop","🫗":"pouring drink",
  // Travel – vehicles
  "🚗":"car drive automobile","🏎️":"race car formula speed","🚕":"taxi yellow cab",
  "🚌":"bus public transport","🚜":"tractor farm field","🛻":"pickup truck off road",
  "🚑":"ambulance emergency hospital","🚒":"fire truck engine ladder","🚓":"police car siren",
  "🏍️":"motorbike motorcycle ride","🚐":"van minibus","🛺":"auto rickshaw tuk-tuk","🚙":"SUV jeep four wheel",
  "🚂":"train steam locomotive rail","🚢":"ship cruise ocean","🛳️":"ferry boat water",
  "✈️":"airplane flight travel sky","🛫":"takeoff plane airport","🚀":"rocket space launch",
  "🛸":"UFO alien flying saucer","🚁":"helicopter rotor fly","⛵":"sailboat sailing wind sea",
  "🚲":"bicycle pedal cycle","🛵":"scooter moped city","🚤":"speedboat water fast","🚠":"cable car mountain",
  "🛩️":"small plane private jet","🛞":"wheel tire car round","🧭":"compass navigation direction explore",
  // Travel – places
  "🏠":"house home building","🏨":"hotel building stay","🏰":"castle medieval royalty",
  "🏯":"japanese castle japan","🗽":"statue of liberty new york","🗼":"eiffel tower paris france",
  "🕌":"mosque islam prayer","⛩️":"torii gate japan shrine","🏟️":"stadium arena sport",
  "🏗️":"construction building crane","🏛️":"columns museum government","⛪":"church cross chapel",
  "🕍":"synagogue jewish star","🛕":"hindu temple india",
  "🏬":"department store shop mall","🏦":"bank money finance","🏥":"hospital medical health",
  "🏫":"school education class","🏪":"convenience store market","🗺️":"map world navigation",
  "🏖️":"beach sand ocean vacation","🏕️":"camping tent outdoor","🌍":"earth europe africa world",
  "🏜️":"desert hot dry sand","🏞️":"national park landscape nature","🌐":"globe world international",
  "⛰️":"mountain peak highland","🌋":"volcano lava eruption","🏔️":"snow mountain alpine",
  "🏝️":"island tropical paradise","🌅":"sunrise horizon dawn","🌃":"night city stars",
  "🌆":"city buildings skyline sunset","🌉":"bridge night city lights","🏙️":"cityscape urban buildings",
  // Nature – sky and weather
  "☀️":"sun sunny bright hot","🌞":"sun face happy","🌙":"moon night crescent",
  "🌜":"moon face night","⭐":"star night sky","🌟":"glowing star sparkle",
  "💫":"dizzy star spin","☄️":"comet meteor space","🌈":"rainbow colors sky",
  "⚡":"lightning thunder storm electricity","🔥":"fire hot flame burn","💧":"water drop rain",
  "🌊":"wave ocean sea surf","❄️":"snowflake cold winter","⛄":"snowman winter cold build",
  "🌬️":"wind blow cold breeze","🌫️":"fog mist cloud visibility","🌧️":"rain cloud wet storm",
  "⛈️":"thunderstorm lightning rain","🌪️":"tornado twister storm","☁️":"cloud cloudy sky",
  "⛅":"partly cloudy sun","🌤️":"mostly sunny cloud","🌡️":"thermometer temperature hot cold","🌀":"cyclone spiral typhoon hurricane","🌂":"umbrella rain protection",
  // Nature – plants
  "🌸":"cherry blossom spring pink flower","🌺":"hibiscus tropical flower red",
  "🌻":"sunflower yellow big sun","🌹":"rose red love romantic",
  "🌷":"tulip pink spring flower","🍀":"four leaf clover luck green",
  "🍂":"autumn fall leaf season","🍃":"leaves green nature","🌲":"tree pine evergreen",
  "🌵":"cactus desert prickly","🌴":"palm tree tropical beach",
  "🪨":"rock stone boulder","🪵":"wood log timber lumber","🌾":"wheat grain field crop",
  "🪸":"coral reef ocean sea","🌿":"herb plant green nature","🪴":"potted plant indoor",
  "🌱":"seedling sprout growing","🍁":"maple leaf autumn canada","🪷":"lotus flower pink water","🫧":"bubble soap",
  // Nature – space
  "💎":"diamond gem precious stone","🌑":"new moon dark night","🌕":"full moon bright night",
  "🪐":"saturn rings planet","🌠":"shooting star wish meteor","🌌":"galaxy milky way universe",
  "🔭":"telescope astronomy space","🛰️":"satellite orbit space","🌖":"waning moon",
  // Objects – tech
  "📱":"smartphone phone mobile","💻":"laptop computer notebook","🖥️":"desktop monitor screen",
  "⌨️":"keyboard typing computer","📷":"camera photo picture","📻":"radio broadcast music",
  "📡":"satellite dish signal","🔋":"battery charge power","📺":"television TV screen watch",
  "📠":"fax machine old office","🖨️":"printer document","💾":"floppy disk save old","📟":"pager beeper device",
  // Objects – tools and security
  "🔑":"key lock open","🔒":"locked secure closed","🧲":"magnet attract pull","💡":"lightbulb idea bright",
  "🔧":"wrench repair tool","🔨":"hammer hit build","⚙️":"gear cog settings","🧰":"toolbox kit fix",
  "🪛":"screwdriver tool fix","🔦":"flashlight torch dark","🔐":"locked key secure","🗝️":"old key antique lock",
  // Objects – magic and mystery
  "🔮":"crystal ball magic fortune predict","🪄":"magic wand wizard spell",
  "💣":"bomb explosion danger","⚗️":"alembic science potion lab","🏺":"amphora ancient pottery",
  "🧿":"evil eye nazar amulet","🪬":"hamsa hand protection","🎴":"flower playing card Japanese","🀄":"mahjong tile game",
  // Objects – finance and shopping
  "💰":"money bag rich wealthy","💳":"credit card payment","🛒":"shopping cart buy store",
  "🎁":"gift present wrapped","🎈":"balloon party celebrate","💸":"flying money cash spend",
  "🏧":"ATM machine cash withdraw","💵":"dollar bill cash money",
  // Objects – trophies and study
  "🏆":"trophy win champion gold","🥇":"gold medal first place","📚":"books reading study",
  "✏️":"pencil write draw","📝":"memo note write","✂️":"scissors cut craft",
  "🏅":"medal sports award","🥈":"silver medal second","🥉":"bronze medal third","📖":"open book reading",
  "📜":"scroll ancient document","🗃️":"card index file organize",
  // Objects – home
  "🛏️":"bed sleep rest bedroom","🛁":"bathtub bath soak","🪞":"mirror reflection vanity",
  "🪥":"toothbrush dental hygiene","🚪":"door entrance exit","🛋️":"couch sofa relax",
  "🛗":"elevator lift building","🪑":"chair seat sit","🧺":"basket laundry carry",
  "🧹":"broom sweep clean witch","🪣":"bucket water carry","🗑️":"trash bin garbage waste","🪠":"plunger toilet fix drain",
  // Objects – toys and festive
  "🧸":"teddy bear soft toy","🪆":"matryoshka russian nesting doll","🎃":"pumpkin halloween jack-o-lantern",
  "🎄":"christmas tree holiday","🪜":"ladder climb step",
  "🪩":"disco ball dance party mirror",
  "🎑":"moon viewing ceremony japanese autumn","🎟️":"admission ticket event entry","🎫":"ticket movie concert",
  "🎐":"wind chime japanese hanging","🎋":"tanabata tree bamboo wish japanese",
  // Objects – emergency and comms
  "🚨":"siren alarm emergency police","🔔":"bell ring alert notify",
  "⏰":"alarm clock wake morning","📞":"telephone call old phone","🎥":"video camera film record",
  "🔊":"speaker loud volume","📯":"horn bugle announce","🔕":"muted no sound","🎷":"saxophone jazz music",
  // Objects – medical and science
  "🩺":"stethoscope doctor medical","💊":"pill medicine tablet",
  "🩹":"bandage wound heal","🧬":"DNA genetics science","🧪":"test tube experiment lab",
  "🔬":"microscope science zoom","🩻":"x-ray bones medical","🧫":"petri dish culture lab",
  // Objects – weapons and adventure
  "⚔️":"crossed swords fight battle","🛡️":"shield protect defense","🗡️":"dagger knife stab",
  "🪤":"mousetrap trap catch snare","⚖️":"scales justice balance law","🪖":"military helmet soldier",
  "⛏️":"pickaxe mine dig","🔱":"trident neptune sea",
  // Objects – clothing
  "👒":"hat straw summer","🎩":"top hat formal magic","👓":"glasses spectacles vision reading",
  "🪮":"comb grooming pet hair","💄":"lipstick makeup beauty kiss","👟":"sneakers shoes athletic",
  "👠":"high heels formal shoes","👜":"purse handbag fashion","🎒":"backpack school travel",
  "🧣":"scarf neck warm winter","🧤":"gloves hands winter cold","🧥":"coat jacket warm",
  // Symbols
  "⬆️":"up arrow north direction","⬇️":"down arrow south direction","➡️":"right arrow east direction",
  "⬅️":"left arrow west direction","↩️":"return back undo","🔄":"refresh repeat cycle",
  "↗️":"up right diagonal direction","↘️":"down right direction","↙️":"down left direction",
  "↖️":"up left direction","🔃":"reload sync refresh",
  "✅":"check mark yes correct done","❌":"cross no wrong cancel","❓":"question mark unknown ask",
  "❗":"exclamation alert important","💯":"hundred percent perfect score","🆒":"cool badge",
  "🆙":"up badge level","🆘":"SOS help emergency","🆕":"new badge fresh","🆗":"ok button approved","‼️":"double exclamation urgent",
  "⁉️":"question exclamation confused","🔞":"eighteen plus adult no minors","🈵":"full sign japanese",
  "🔴":"red circle color","🟠":"orange circle color","🟡":"yellow circle color",
  "🟢":"green circle color","🔵":"blue circle color","🟣":"purple circle color",
  "🔷":"blue diamond shape","🔶":"orange diamond shape","⬛":"black square shape",
  "⬜":"white square shape","🟥":"red square color","🟦":"blue square color","🟨":"yellow square color",
  "🏴":"black flag pirate","🏳️":"white flag surrender peace","🏴‍☠️":"pirate flag skull crossbones",
  "🚩":"red flag warning","🏁":"checkered flag race finish","🎌":"crossed flags japan","🏳️‍🌈":"rainbow flag pride",
  "⚠️":"warning caution danger","🚫":"no prohibited banned","♻️":"recycle green environment",
  "➕":"plus add more","➖":"minus subtract less","✖️":"multiply times cross","➗":"divide math",
  "♾️":"infinity endless loop","🔰":"beginner badge green yellow",
  "💤":"sleeping zzz snore rest","💢":"anger symbol mad","💥":"collision explosion boom",
  "💦":"water splashing wet drops","💨":"wind dash fast blow","🔅":"dim low brightness screen",
  "✨":"sparkles magic stars glitter","💠":"diamond blue shape","🔆":"bright high brightness screen",
  "🔀":"shuffle random mix","🔸":"small orange diamond shape",
  "🎵":"music note song","🎶":"notes music melody","🔉":"speaker volume sound",
  "🔇":"muted silent no sound","🔈":"low volume quiet","🎙️":"studio mic recording",
  "📣":"megaphone announcement loud","📢":"loudspeaker broadcast",
  "👆":"pointing up above","☝️":"one finger pointing up","👇":"pointing down below",
  "👉":"pointing right next","👈":"pointing left back","🙏":"prayer please thank hands",
  "✌️":"peace victory two fingers","🤞":"crossed fingers hope luck","🤙":"call me hang loose shaka",
  "👍":"thumbs up yes good","👎":"thumbs down no bad","🖕":"middle finger rude","✋":"stop hand raise",
  "🤚":"raised hand stop back",
  "💬":"speech bubble talk chat","💭":"thought bubble thinking","🕐":"clock one hour time",
  "🕛":"clock twelve noon midnight","⏱️":"stopwatch time seconds fast","⏳":"hourglass sand time running",
  "⌛":"hourglass done time expired","🗓️":"calendar date schedule","📅":"calendar day event",
  "1️⃣":"number one first","2️⃣":"number two second","3️⃣":"number three third",
  "🔟":"number ten","🔡":"lowercase letters input abc","🔢":"numbers input 1234",
};

export default function EmojiGame({ game, room, me, send }) {
  const [emojiInput, setEmojiInput] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [pickerCategory, setPickerCategory] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const guessFeedRef = useRef(null);
  const autoSubmittedRef = useRef(false);

  const isStoryteller = me.id === game?.storytellerId;
  const isHost = room?.hostId === me.id;

  useEffect(() => {
    guessFeedRef.current?.scrollTo({ top: guessFeedRef.current.scrollHeight, behavior: "smooth" });
  }, [game?.guesses?.length]);

  // Auto-submit the storyteller's partial emoji input just before the server timer expires.
  useEffect(() => {
    if (game?.status === "composing" && game?.timer === 1 && isStoryteller && emojiInput.length > 0 && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      send({ type: "gameAction", action: { kind: "submitEmojis", emojis: emojiInput } });
      setEmojiInput("");
    }
    if (game?.status !== "composing") {
      autoSubmittedRef.current = false;
    }
  }, [game?.timer, game?.status]);

  // Reset search when switching rounds / phases
  useEffect(() => {
    setSearchQuery("");
  }, [game?.round]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return EMOJI_CATEGORIES.flatMap((cat) => cat.emojis).filter((e) => EMOJI_NAMES[e]?.includes(q));
  }, [searchQuery]);

  if (!game) return null;
  const storytellerName = room?.players.find((p) => p.id === game.storytellerId)?.name || "Someone";
  const roundWinnerName = game.roundWinnerId
    ? room?.players.find((p) => p.id === game.roundWinnerId)?.name
    : null;

  const handleSubmitEmojis = () => {
    if (emojiInput.trim().length === 0) return;
    send({ type: "gameAction", action: { kind: "submitEmojis", emojis: emojiInput } });
    setEmojiInput("");
  };

  const handlePickEmoji = (emoji) => {
    if (emojiInput.length >= 30) return;
    setEmojiInput((prev) => prev + emoji);
  };

  const handleGuess = () => {
    if (guessInput.trim().length === 0) return;
    send({ type: "gameAction", action: { kind: "guess", text: guessInput } });
    setGuessInput("");
  };

  const playerName = (id) => room?.players.find((p) => p.id === id)?.name || "?";
  const canSkip = isHost && (game.status === "composing" || game.status === "guessing");

  return (
    <main className="game-stage">
      <div className="game-header">
        <span>Round {game.round}</span>
        {game.timer != null && (
          <span className={`voting-timer${game.timer <= 15 ? " timer-urgent" : ""}`}>{game.timer}s</span>
        )}
      </div>

      {game.status === "composing" && isStoryteller && (
        <div className="panel">
          <div className="status">
            Describe with emojis only: <strong>{game.prompt?.text}</strong>
            {" "}({game.promptCategory})
          </div>

          <div className="emoji-preview">{emojiInput || "Tap emojis below..."}</div>

          <div className="emoji-picker">
            <div className="emoji-search-row">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search emojis…"
                style={{ fontSize: "16px", flex: 1 }}
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} style={{ marginLeft: "4px" }}>✕</button>
              )}
            </div>
            {searchResults === null ? (
              <>
                <div className="emoji-tabs">
                  {EMOJI_CATEGORIES.map((cat, i) => (
                    <button
                      key={cat.name}
                      type="button"
                      className={`emoji-tab ${pickerCategory === i ? "emoji-tab-active" : ""}`}
                      onClick={() => setPickerCategory(i)}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
                <div className="emoji-grid">
                  {EMOJI_CATEGORIES[pickerCategory].emojis.map((emoji) => (
                    <button key={emoji} type="button" className="emoji-btn" onClick={() => handlePickEmoji(emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </>
            ) : searchResults.length > 0 ? (
              <div className="emoji-grid">
                {searchResults.map((emoji) => (
                  <button key={emoji} type="button" className="emoji-btn" onClick={() => handlePickEmoji(emoji)}>
                    {emoji}
                  </button>
                ))}
              </div>
            ) : (
              <div className="status" style={{ padding: "1rem", opacity: 0.6 }}>No emojis found</div>
            )}
          </div>

          <div className="actions">
            {emojiInput.length > 0 && (
              <button type="button" onClick={() => setEmojiInput((prev) => [...prev].slice(0, -1).join(""))}>
                Backspace
              </button>
            )}
            {emojiInput.length > 0 && (
              <button type="button" onClick={() => setEmojiInput("")}>Clear</button>
            )}
            <button type="button" onClick={handleSubmitEmojis} disabled={emojiInput.trim().length === 0}>
              Send Emojis
            </button>
          </div>
        </div>
      )}

      {game.status === "composing" && !isStoryteller && (
        <div className="panel">
          <div className="status">{storytellerName} is picking emojis ({game.promptCategory})...</div>
        </div>
      )}

      {game.status === "guessing" && (
        <div className="panel">
          <div className="emoji-display">{game.emojis}</div>
          {!isStoryteller && game.triesLeft > 0 && (
            <>
              <div className="status" style={{ fontSize: "0.85em", opacity: 0.75 }}>
                {game.triesLeft} / {game.guessLimit} {game.triesLeft === 1 ? "try" : "tries"} left
              </div>
              <div className="guess-row">
                <input
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  placeholder="Type your guess..."
                  maxLength={200}
                  onKeyDown={(e) => e.key === "Enter" && handleGuess()}
                />
                <button type="button" onClick={handleGuess}>Guess</button>
              </div>
            </>
          )}
          {!isStoryteller && game.triesLeft === 0 && (
            <div className="status">No tries left</div>
          )}
          {isStoryteller && (
            <div className="status">Players are guessing...</div>
          )}
          <div className="guess-feed" ref={guessFeedRef}>
            {game.guesses.map((g, i) => (
              <div key={i} className={`guess-item ${g.correct ? "guess-correct" : ""}`}>
                <strong>{playerName(g.playerId)}:</strong> {g.text}
                {g.correct && " ✓"}
              </div>
            ))}
          </div>
        </div>
      )}

      {game.status === "reveal" && (
        <div className="panel">
          <div className="emoji-display">{game.emojis || "⏰"}</div>
          <div className="status">The answer was: <strong>{game.answer}</strong></div>
          {roundWinnerName && (
            <div className="status round-winner">Round winner: {roundWinnerName}</div>
          )}
        </div>
      )}

      {canSkip && (
        <div className="actions">
          <button type="button" className="skip-btn" onClick={() => send({ type: "skipPhase" })}>
            Skip
          </button>
        </div>
      )}

      <p className="game-instructions">
        Storyteller picks emojis to describe a secret prompt · Others type their best guess · Faster correct answers earn more points
      </p>

      <Scoreboard game={game} room={room} />
    </main>
  );
}

function Scoreboard({ game, room }) {
  if (!game?.scores || !room) return null;
  const sorted = room.players
    .map((p) => ({
      ...p,
      score: game.scores[p.id] || 0,
      roundWins: room.roundWins?.[p.id] || 0,
    }))
    .sort((a, b) => b.roundWins - a.roundWins || b.score - a.score);

  return (
    <div className="panel">
      <div className="players">
        {sorted.map((p) => (
          <div key={p.id} className="player">
            <span className="swatch" style={{ background: p.color }} />
            <span>{p.name}</span>
            <span>{p.score} pts</span>
            <span>{p.roundWins} {p.roundWins === 1 ? "round" : "rounds"} won</span>
          </div>
        ))}
      </div>
    </div>
  );
}
