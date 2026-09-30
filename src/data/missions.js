// Mission content: the story chain, side-job flavor text, pager codes and names.
//
// All characters are fictional. No firearms, no drugs: jobs are tagging, fist fights, cars,
// rides, messages, mixtapes and police chases. Text tokens are filled in by Missions:
//   {name} player  {og} the set's OG  {greet} cuz/blood  {set} {short} {side}
//   {rival} {rivalShort} {rivalZone}  {hoodZone}  {contested}
//   {target} {dest} {place} {garage} {street} {zone} {count} {homie} {item} {time}

// The OG who pages the player, one per set.
export const OGS = {
  psc: { name: 'Big Tone', number: '555-0142' },
  ngc: { name: 'Unc Ray', number: '555-0177' },
  rlc: { name: 'Sarge', number: '555-0109' },
  lvb: { name: 'Pops', number: '555-0163' },
  nfp: { name: 'Big Lou', number: '555-0121' },
  wbb: { name: 'Slim', number: '555-0188' },
};

// Numeric pager codes of the era (docs/research/period-1993.json: everydayTech1993).
export const PAGER_CODES = {
  urgent: '911', // call now
  info: '411', // what's up / got info
  love: '143', // I love you
  hello: '07734', // "hello" upside down
};

export const HOMIE_NAMES = ['Peanut', 'June Bug', 'Lil Man', 'Tiny', 'Boo', 'Ray-Ray', 'Man-Man', 'Pooh', 'Dante', 'Smiley'];

// Things that get delivered. Never anything illegal.
export const DELIVERY_ITEMS = [
  { item: 'a fresh mixtape', to: 'the DJ', contact: 'DJ Slick', line: "Aw, this the one with the slow jams on side B? Good looking out." },
  { item: "bail money for Peanut's mama", to: "Peanut's mama", contact: 'Miss Lorraine', line: 'Bless you, baby. Tell them boys I said thank you.' },
  { item: 'a stack of block party flyers', to: 'the church', contact: 'Deacon Hayes', line: 'Saturday at noon. Tell everybody, and tell them to bring a dish.' },
  { item: 'a letter from the pen', to: "Keisha's grandma", contact: 'Grandma Pearl', line: "Lord, he wrote! I'm gonna read this twice." },
  { item: 'a borrowed boombox', to: 'Cousin Dee', contact: 'Cousin Dee', line: "Finally! Took y'all long enough. It still got batteries?" },
];

// Short flavor pages with no mission attached (1993 pagers mostly showed numbers).
export const FLAVOR_PAGES = [
  { from: 'Mama', code: '143', number: '555-0100', text: 'Come home for dinner. Wash your hands.' },
  { from: 'Keisha', code: '07734', number: '555-0156', text: 'Call me back when you get this.' },
  { from: 'Cousin Dee', code: '411', number: '555-0133', text: 'Block party Saturday. Bring the tapes.' },
];

// Story chain: shared by every set, text filled in with the player's and the rival's names.
// template = mission logic (systems/gameplay/missionTemplates.js); rank = minimum rank index.
export const STORY = [
  {
    id: 'story1',
    pitch: 'Come see {og} at the hood.',
    order: 1,
    rank: 0,
    template: 'meet',
    title: 'Back on the Block',
    code: PAGER_CODES.urgent,
    reward: { cash: 40, rep: 25 },
    brief: [
      ['og', "{name}! Where you been, {greet}? Word is you back from your auntie's in Kansas City."],
      ['og', 'Come holla at me at the hood. We got business.'],
    ],
    objective: 'Meet {og} at the hood',
    outro: [
      ['og', "Look at you. Summer of '93 and you finally old enough to rep the set."],
      ['og', 'The {short} been holding down {hoodZone} since before you could ride a bike. Nobody gives us nothing.'],
      ['og', "Keep that pager on your hip. When it buzzes, find a payphone. That's how we move."],
    ],
  },
  {
    id: 'story2',
    pitch: 'The city buffed our walls. Put the {short} back up.',
    order: 2,
    rank: 0,
    template: 'tag_run',
    params: { zone: 'hood', count: 2, buff: true },
    title: 'Put It on the Wall',
    code: PAGER_CODES.info,
    reward: { cash: 60, rep: 40 },
    brief: [
      ['og', 'The city came through and buffed our walls on the block. Gray paint everywhere.'],
      ['og', 'Grab a can and put the {short} back up. Two walls. Let them know who we are.'],
    ],
    objective: 'Tag the buffed walls in {zone}',
    outro: [['og', "That's what I'm talking about. Every wall is a flag, {greet}."]],
  },
  {
    id: 'story3',
    pitch: 'The body shop needs a car. Boost one.',
    order: 3,
    rank: 0,
    template: 'wheels',
    params: { models: ['lowrider', 'coupe'] },
    title: 'Boost Some Wheels',
    code: PAGER_CODES.urgent,
    reward: { cash: 150, rep: 50 },
    brief: [
      ['og', "Can't be walking everywhere like a buster. The body shop needs a car."],
      ['og', "There's a {target} parked around {street}. Boost it and bring it to {garage}. Don't scratch it."],
    ],
    objective: 'Boost the {target}',
    outro: [['og', "They said it's clean. Here's your cut. Buy yourself some new laces."]],
  },
  {
    id: 'story4',
    pitch: 'Round up two homies and bring them home.',
    order: 4,
    rank: 1,
    template: 'recruit',
    params: { count: 2 },
    title: 'Deep in the Set',
    code: PAGER_CODES.info,
    reward: { cash: 80, rep: 60 },
    brief: [
      ['og', "Can't nobody hold a block alone. Go round up two of the homies."],
      ['og', 'Tell them to roll with you, then bring them back to the hood.'],
    ],
    objective: 'Recruit {count} homies',
    outro: [['og', "That's family right there. Y'all watch each other's backs."]],
  },
  {
    id: 'story5',
    pitch: 'Run a message down to the Old Market.',
    order: 5,
    rank: 1,
    template: 'delivery',
    params: { dest: 'oldmarket', pickup: 'hood', item: 'a sealed envelope', contact: 'Mr. Hollis', timer: 1.6 },
    title: 'Word Downtown',
    code: PAGER_CODES.urgent,
    reward: { cash: 120, rep: 70 },
    brief: [
      ['og', "I got a message for a friend of ours down in the Old Market. Can't say it on the phone."],
      ['og', 'Grab the envelope at the hood and run it down to {dest}. Straight there, no detours.'],
    ],
    objective: 'Take the envelope to {dest}',
    outro: [
      ['contact', "Tell {og} the block party is on. Both sides of North O are invited. It's time."],
      ['og', "Good. Some things are bigger than the block, {greet}. Don't tell nobody I said that."],
    ],
  },
  {
    id: 'story6',
    pitch: "The {rivalShort} took Lil Man's jacket. Go see them.",
    order: 6,
    rank: 2,
    template: 'beef',
    params: { zone: 'rival', count: 3 },
    title: 'First Beef',
    code: PAGER_CODES.urgent,
    reward: { cash: 120, rep: 90 },
    brief: [
      ['og', '{rivalShort} caught Lil Man slipping by the store and took his Starter jacket.'],
      ['og', 'Roll through {zone}, put hands on three of them, and get out before Five-O shows up.'],
    ],
    objective: 'Run up on the {rivalShort} in {zone}',
    outro: [['og', 'Word travels fast. They know your name over there now. Stay sharp.']],
  },
  {
    id: 'story7',
    pitch: 'The police got your description. Shake them.',
    order: 7,
    rank: 2,
    template: 'lose_heat',
    params: { heat: 3 },
    title: 'Five-O Everywhere',
    code: PAGER_CODES.urgent,
    reward: { cash: 100, rep: 90 },
    brief: [
      ['og', 'Somebody dropped your name to the police. Your description is on every scanner in the city.'],
      ['og', "They coming hard. Shake them: alleys, side streets, a fresh paint job at a body shop. Just don't get caught."],
    ],
    objective: 'Lose the police',
    outro: [['og', 'Smooth. Lay low for a minute and let it cool off.']],
  },
  {
    id: 'story8',
    pitch: 'Take the open blocks before the {rivalShort} do.',
    order: 8,
    rank: 3,
    template: 'takeover',
    params: { zone: 'contested', count: 3, rivals: 2 },
    title: 'Contested',
    code: PAGER_CODES.urgent,
    reward: { cash: 200, rep: 120 },
    brief: [
      ['og', "{zone} ain't nobody's. Yet. The {rivalShort} been eyeing it all summer."],
      ['og', 'Get over there and put our name on every wall you can find. Take it before they do.'],
    ],
    objective: 'Take {zone}',
    outro: [['og', "{zone} is {short} now. That's real estate, {greet}."]],
  },
  {
    id: 'story9',
    pitch: 'The {rivalShort} rolled into the hood. Run them off.',
    order: 9,
    rank: 3,
    template: 'defend',
    params: { count: 3, tags: 2 },
    title: 'Hold the Hood',
    code: PAGER_CODES.urgent,
    reward: { cash: 200, rep: 130 },
    brief: [
      ['og', '911! {rivalShort} rolled deep into {hoodZone}. They crossing out our walls right now!'],
      ['og', 'Get to the hood. Run them off and cover up their mess.'],
    ],
    objective: 'Defend {hoodZone}',
    outro: [['og', "They'll think twice before they come through here again."]],
  },
  {
    id: 'story10',
    pitch: 'One last run, in the storm.',
    order: 10,
    rank: 4,
    template: 'takeover',
    params: { zone: 'rivalHome', count: 4, rivals: 3, storm: true },
    title: "Summer of '93",
    code: PAGER_CODES.urgent,
    reward: { cash: 500, rep: 250 },
    brief: [
      ['og', 'Big storm rolling in off the river tonight. Rain like this, the {rivalShort} stay inside.'],
      ['og', 'This is it. {zone}. Every wall. When the sun comes up, all of North O gonna know the {short} name.'],
    ],
    objective: 'Take {zone} in the storm',
    outro: [['og', "Look around, {name}. Summer of '93. They gonna talk about this one for years."]],
    ending: {
      title: "SUMMER OF '93",
      sub: 'The {short} run {zone}. The streets remember.',
      lines: [
        ['og', "But hear me: the block is only as strong as the people on it. The kids, the church ladies, the shop owners."],
        ['og', "Go check on your moms. The city's yours. Keep it that way."],
      ],
    },
  },
];

// Side-job flavor per template (instantiated with live world targets by Missions).
export const JOBS = {
  tag_run: {
    pitch: 'The {rivalShort} been talking reckless on the walls. Go cross them out.',
    titles: ['Bomb the Block', 'Cross-Out Payback', 'Paint the Town'],
    brief: [
      ['og', '{rivalShort} been talking reckless on the walls in {zone}.'],
      ['og', 'Go hit {count} of their spots. In and out.'],
    ],
    objective: 'Tag {count} walls in {zone}',
    reward: { cash: 50, rep: 30 },
    timer: 240,
  },
  wheels: {
    pitch: 'The body shop got an order for a car. Go boost it.',
    titles: ['Chop Shop Special', 'Body Shop Order', 'Candy Paint'],
    brief: [
      ['og', '{garage} got an order for a {target}.'],
      ['og', "There's one parked around {street}. Bring it in one piece."],
    ],
    objective: 'Boost the {target}',
    reward: { cash: 120, rep: 30 },
  },
  beef: {
    pitch: 'The {rivalShort} posted up talking about the {short}. Handle it.',
    titles: ['Run Up on Them', 'Settle It', 'Respect the Name'],
    brief: [
      ['og', '{rivalShort} posted up in {zone} talking about the {short}.'],
      ['og', 'Go handle it. Three of them. Then get out of there.'],
    ],
    objective: 'Run up on the {rivalShort} in {zone}',
    reward: { cash: 90, rep: 45 },
  },
  escort: {
    pitch: '{homie} needs a ride across town, fast.',
    titles: ['Taxi Service', 'Ride for {homie}', 'Late for Grandma'],
    brief: [
      ['og', '{homie} needs a ride to {dest}. He is waiting at {place}.'],
      ['og', 'Get a car. You got {time} before he misses it.'],
    ],
    objective: 'Pick up {homie} at {place}',
    reward: { cash: 80, rep: 30 },
  },
  recruit: {
    pitch: 'We need numbers at the hood tonight. Bring two homies.',
    titles: ['Numbers Game', 'Roll Call'],
    brief: [
      ['og', 'We need numbers at the hood tonight.'],
      ['og', 'Round up {count} homies and bring them through.'],
    ],
    objective: 'Recruit {count} homies',
    reward: { cash: 60, rep: 35 },
  },
  lose_heat: {
    pitch: 'Five-O asking about you by name. Shake them.',
    titles: ['Hot Potato', 'Scanner Chatter'],
    brief: [
      ['og', 'Five-O rolling on the set asking about you by name.'],
      ['og', 'They about to spot you. Shake them and I got something for you.'],
    ],
    objective: 'Lose the police',
    reward: { cash: 70, rep: 40 },
    timer: 180,
  },
  delivery: {
    pitch: 'Something needs to get across town. Quick.',
    titles: ['Special Delivery', 'Run It Over', 'On the Way'],
    brief: [
      ['og', 'Need {item} run over to {dest}.'],
      ['og', 'Pick it up at {place}. Clock is ticking.'],
    ],
    objective: 'Pick up {item} at {place}',
    reward: { cash: 70, rep: 30 },
  },
};

// Order the side jobs rotate through when the OG pages with work.
export const JOB_TEMPLATES = ['tag_run', 'wheels', 'delivery', 'beef', 'escort', 'recruit', 'lose_heat'];
