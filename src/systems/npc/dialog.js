import { SIDES } from '../../data/sets.js';

// Era dialog (summer 1993) for NPCs, shown as subtitles with game.hud.dialog(speaker, text,
// { color }) when the speaker is near the player. Slang from docs/research/period-1993.json:
// word, straight up, trippin', kickin' it, bounce, it's all good, mark, buster, set, claim,
// representin'... No slurs. Crips say "cuz" and "what's crackin'"; Bloods say "blood",
// "what's poppin'" and swap C for B ("bool").

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const COLORS = {
  civ: '#efe6cf',
  cop: '#9ecbff',
  dispatch: '#7fe0ff',
};

export const CIV = {
  ambient: [
    'Hot one today, huh?',
    "Radio says the river's gonna crest again this week.",
    'You catch the Royals game at Rosenblatt?',
    "Been sandbaggin' down by the river all week.",
    'Rain again? Lord.',
    "Huskers are goin' all the way this year. Watch.",
    'My bus is late. Again.',
    'Twenty-nine cents for a stamp. Can you believe that?',
    'Gas went up to a dollar nine.',
    "You hear that new Dre tape? It's all that.",
    "Gotta find a payphone, my pager keeps goin' off.",
    "It's all good, baby.",
    'Keep your head up out here.',
    'Word.',
    "Street Fighter at the corner store, fifty cents a play. That's wack.",
    "Mm-mm. Humid as I don't know what.",
    'Mosquitoes are eatin\' me alive since the flood.',
  ],
  elder: [
    'You young folks be careful out here.',
    "I remember when 24th Street was jumpin' every night.",
    'Dreamland had the finest bands in the country, you hear me?',
    'Mm-hm. Pull your pants up, baby.',
    "Lord, this rain don't quit.",
  ],
  church: ['Bless you, baby.', "Choir practice at seven, don't be late.", 'You come to service Sunday, you hear?', 'Have a blessed day.'],
  mail: ["Mornin'! Nothin' but bills today.", 'Rain or shine, baby. Rain or shine.', 'Watch that dog on Binney, he bites.'],
  jogger: ['On your left!', "*huff* ... *huff* ...", 'Three more miles...'],
  worker: ['Double shift again...', 'Long day. Long, long day.', "Boss got me haulin' sandbags now."],
  office: ['Late for a meeting downtown.', 'Gotta get these papers to the courthouse by five.', "Fax machine's down again."],
  nurse: ['Twelve-hour shift. I need my bed.', "Y'all be safe out here. I see enough in the ER."],
  bump: ['Excuse you!', 'Watch it, now!', 'Hey, easy!', "You need glasses or somethin'?", "Boy, watch where you goin'.", 'Pardon me?!', 'Dang, my bad... wait, YOUR bad!'],
  bumpElder: ['Mind your manners, young man.', 'Lord, slow down.', "In my day folks said 'excuse me'."],
  flee: ['Somebody call the police!', 'Lord have mercy!', 'Not again...', "Y'all are crazy!", "I ain't seen nothin'!", 'Run!', 'Oh my God!', "I'm out of here!"],
  car: ['Slow down, fool!', 'Watch the road!', 'This a sidewalk!', 'You tryin\' to kill somebody?!'],
  call: ["I'm callin' the police!", "That's it, I'm callin' the cops."],
  phone: (street) => `Police? There's trouble at ${street}! Hurry!`,
  jacked: ['My car! He took my car!', 'Somebody stop him! That\'s my ride!'],
  chatter: ['Girl, stop.', 'For real?', 'Straight up?', "No, you didn't.", 'Mm-hm.', 'Word?', 'Get outta here!', 'That\'s what I said!'],
};

/** Gang lines. side = 'crips' | 'bloods'; set = SETS entry; name = player's name. */
export function greetOwn(side, set, name, og = false) {
  const g = SIDES[side]?.greet || 'homie';
  if (og) {
    return pick([
      `Young ${name}. Keep your head up out here.`,
      `Stay up, ${name}. Handle your business.`,
      `${name}! ${set.short} proud of you, ${g}.`,
      `Listen to your OG, ${name}: stay out the way of them squad cars.`,
    ]);
  }
  if (side === 'bloods') {
    return pick([`What's poppin', ${name}?`, `${set.short}! What's poppin', blood?`, `There go ${name}! It's all bool.`, `${set.name}, all day, blood.`, `Ay, ${set.short} in the house!`]);
  }
  return pick([`What's crackin', ${name}?`, `${set.short}! What's crackin', cuz?`, `There go my homie ${name}!`, `${set.name}, all day, cuz.`, `Ay, ${set.short} in the house!`]);
}

export function nodAlly(side) {
  return side === 'bloods'
    ? pick(["What's poppin'.", 'Blood.', "It's all bool, blood.", 'Stay up, blood.'])
    : pick(["What's crackin'.", 'Cuz.', 'Stay up, cuz.', "It's all good, cuz."]);
}

export function rivalWarn(set) {
  return pick(['What set you claim?', 'Where you from, fool?', `You lost? This ${set.short} hood.`, "You slippin' in the wrong hood, homie.", 'Ay! Who you with?', 'Wrong colors on this block, homie.']);
}

export function rivalAttack(set) {
  return pick(["It's on!", 'Get him!', 'You done messed up now!', `${set.short}! Get 'em!`, "You ain't leavin' this block!"]);
}

export function rivalSignReply() {
  return pick(["Oh, you wanna throw it up in HERE?!", 'You throwin\' that up on OUR block?!', "Say that again, I dare you!"]);
}

export const RIVAL_LEAVE = ["Yeah, keep walkin'!", "That's what I thought.", "Don't come back through here!", 'Bounce, mark!'];
export const RIVAL_WIN = ['Stay outta our hood!', "That's what you get!", 'Busters.'];

export function ownHit(side) {
  return side === 'bloods' ? pick(['Blood, you trippin\'?!', 'Chill! We family, blood!']) : pick(["Cuz, you trippin'?!", 'Chill! We family, cuz!']);
}

export function allyHit() {
  return pick(["You trippin'?!", 'Oh, it\'s like that?', "You done lost your mind!"]);
}

export const HOMIE = {
  recruit: (side) => (side === 'bloods' ? pick(['I got you, blood. Let\'s roll.', 'Say less. Let\'s ride, blood.']) : pick(["Let's roll, cuz.", "Say less. Let's ride, cuz."])),
  full: ["Nah, you already rollin' deep.", 'You got enough homies with you.'],
  wait: ["Aight, we'll post up right here.", "We holdin' it down.", 'We ain\'t goin\' nowhere.'],
  follow: ["Let's ride!", 'Right behind you.', 'On your six.'],
  dismiss: ["Aight, I'm out. Hit me on the pager.", 'One love. Holla at me.', 'Peace. Stay up.'],
  fight: ['I got your back!', 'Handle yours!', "Get 'em!", 'Nobody touches my homie!'],
  hit: ['Ay, watch it!', "Whoa, it's me!", 'Easy, easy!'],
  car: ["Shotgun!", 'Turn that radio up.', 'Where we headed?'],
};

export function beefArrive(set) {
  return pick([`${set.short} in here! Where they at?`, `This ${set.short} turf now!`, "We came to see what's up!"]);
}

export const COP = {
  freeze: ['Omaha Police! Freeze!', 'Stop right there!', "Hands where I can see 'em!", "Don't you run from me!", 'Police! Get on the ground!'],
  arrest: ["You're under arrest.", 'Hands behind your back. Now.', 'You have the right to remain silent.'],
  fight: ["Don't make this harder than it is!", 'Stop resisting!', 'Get down!'],
  investigate: ['Dispatch, show me en route.', "Anybody see what happened here?", "Let's take a look around."],
  patrol: ['Evening.', 'Stay out of trouble, now.', 'Move along.', 'Keep it moving.'],
  hit: ['Officer down! I need backup!', "That's assault on an officer!"],
};

export function dispatchLine(kind, street, dir) {
  switch (kind) {
    case 'assault':
      return `All units, assault reported near ${street}.`;
    case 'carjack':
      return `All units, vehicle theft in progress near ${street}.`;
    case 'pursuit':
      return `Units in pursuit, suspect ${dir} on ${street}.`;
    case 'foot':
      return `Suspect on foot near ${street}. Units converge.`;
    case 'roadblock':
      return `Setting up a roadblock on ${street}.`;
    case 'lost':
      return 'All units, suspect lost. Resume patrol.';
    case 'assaultCop':
      return `Officer needs assistance near ${street}!`;
    default:
      return `Units respond, disturbance near ${street}.`;
  }
}

// ------------------------------------------------------------------ speaker

let lastAt = -1e9;
let lastPriority = 0;

/**
 * Show an NPC line as a subtitle when the speaker is within `range` of the player.
 * Global throttle keeps the HUD readable: low priority lines wait for a quiet moment,
 * priority ≥ 2 (warnings, arrests) always go through.
 */
export function say(game, actor, text, { color, range = 18, priority = 1, speaker = null, duration } = {}) {
  if (!text || !game.hud?.dialog) return false;
  const p = game.player;
  if (!p) return false;
  const now = game.time.elapsed;
  if (actor) {
    const dx = actor.position.x - p.position.x;
    const dz = actor.position.z - p.position.z;
    if (dx * dx + dz * dz > range * range) return false;
    const b = actor.brain;
    if (b && b.saidAt !== undefined && now - b.saidAt < 3.5 && priority < 2) return false;
    if (b) b.saidAt = now;
  }
  const gap = now - lastAt;
  if (priority < 2 && gap < (lastPriority >= 2 ? 2.4 : 1.6)) return false;
  lastAt = now;
  lastPriority = priority;
  const name = speaker || actor?.name || '';
  try {
    game.hud.dialog(name, text, { color: color || COLORS.civ, duration: duration || Math.min(4.5, 1.8 + text.length * 0.045) });
  } catch {
    /* HUD not ready */
  }
  return true;
}

export { pick };
