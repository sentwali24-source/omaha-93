import { clockText } from '../../core/math.js';

// KNOR 89.3 "North O Talk" and the DJ station IDs, read with speechSynthesis when the browser has
// it (it silently does nothing otherwise). Headlines come from docs/research/period-1993.json:
// the Great Flood of 1993, the CWS at Rosenblatt, Ak-Sar-Ben, the zoo's new Lied Jungle, Logan
// Fontenelle coming down. No real people are named.

export const HEADLINES = [
  'Flood watch. The Missouri River at Omaha is running higher than it has since 1952, and the Corps of Engineers is watching every levee.',
  'Sandbag volunteers are still needed along the riverfront. If you can lift, you can help.',
  'Rain again today. Since the first of June it has rained on more days than not. Nobody in North O remembers a summer this wet.',
  'Upstream and down, levees are failing and farm towns are fighting the water. Fifty-two Nebraska counties are federal disaster areas this year.',
  'Over in Des Moines, the flood swamped the water works. The whole city is going without tap water.',
  'Down in Kansas City, the Missouri crested at a record forty-eight point nine feet.',
  'Sports. L S U won the College World Series at Rosenblatt Stadium, shutting out Wichita State eight to nothing in the final.',
  'The Omaha Royals are home at Rosenblatt this week. Bleacher seats are cheap and the hot dogs are hot.',
  'Out at Ak-Sar-Ben the horses are still running, but the crowds are thinner now that the casinos are opening in Missouri.',
  'The Lied Jungle at the Henry Doorly Zoo, the biggest indoor rainforest in the world, is packing in the summer crowds.',
  'Demolition continues at the Logan Fontenelle homes. Neighbors say they want a real say in what gets built next.',
  'The Chicago Bulls have won their third straight championship. Three-peat, baby.',
  'The dinosaur movie is still sold out on weekends. Catch a matinee for about three bucks.',
  'The minimum wage is still four twenty-five an hour. Gas is holding at about a dollar ten a gallon.',
];

export const COMMUNITY = [
  'Keep the peace this summer. Squash the beef and come out to the three-on-three tournament at Kountze Park, Saturday at noon.',
  'Summer job sign-ups are open at the community center on North Twenty-Fourth Street. Bring your folks and a pen.',
  'Stay out of floodwater. It only takes a few inches of moving water to knock you off your feet.',
  'Got a pager but no phone at home? The payphones on Twenty-Fourth and Lake take quarters. Call your mama.',
  'Record swap this Sunday on North Twenty-Fourth. Bring your tapes, bring your wax.',
  'Remember: the library is open late on Thursdays. Air conditioning is free.',
];

export const DJ = {
  khot: ['K-HOT, one oh one point seven. Omaha\'s home for hip hop and R and B.', 'You\'re rolling with K-HOT. Keep it locked.', 'K-HOT one oh one seven. The West Coast sound, right here in the O.'],
  kbnc: ['K-B-N-C, ninety-four one. The Bounce.', 'The Bounce. Straight from the boom box to your block.', 'Ninety-four one, The Bounce. Real hip hop, all day.'],
  kqst: ['Quiet Storm, one oh five five. Slow it down, Omaha.', 'Late night, low lights. K-Q-S-T.', 'This one goes out to everybody riding with somebody special.'],
  kxnb: ['K-X-N-B ninety-eight five. Nebraska\'s hottest country.', 'More twang for your buck. K-X-N-B.', 'Put your boots on, Omaha. It\'s K-X-N-B.'],
  knor: ['K-N-O-R, eighty-nine three. North O Talk. Community radio for the Near North Side.'],
};

const SKY = {
  clear: 'clear skies',
  overcast: 'gray, cloudy skies',
  rain: 'a steady rain',
  thunderstorm: 'thunderstorms in the area',
};

/** A live weather and time check built from the game state. */
export function weatherReport(game) {
  const env = game.environment;
  const hour = game.clock?.hour ?? 12;
  const w = env?.weather || 'clear';
  const dayWarm = Math.sin(((hour - 8) / 24) * Math.PI * 2) * 0.5 + 0.5;
  const temp = Math.round(66 + 16 * dayWarm - (w === 'rain' || w === 'thunderstorm' ? 6 : 0));
  const more = w === 'clear' ? 'Enjoy it while it lasts, more rain is on the way.' : 'And yes, more rain in the forecast. Of course.';
  return `It's ${clockText(hour)}. Right now at Eppley it's ${temp} degrees with ${SKY[w] || SKY.clear}. ${more}`;
}

/** Thin speechSynthesis wrapper: never throws, never blocks, cancels cleanly. */
export class Speaker {
  constructor() {
    this.synth = typeof window !== 'undefined' && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function' ? window.speechSynthesis : null;
    this.voice = null;
    this._timers = [];
    this.volume = 1;
    if (this.synth) {
      try {
        this._pickVoice();
        this.synth.addEventListener?.('voiceschanged', () => this._pickVoice());
      } catch {
        /* ignore */
      }
    }
  }

  get available() {
    return !!this.synth;
  }

  _pickVoice() {
    const voices = this.synth.getVoices?.() || [];
    this.voice = voices.find((v) => /en-US/i.test(v.lang) && /Google|Microsoft|Alex|Aaron|Fred/i.test(v.name)) || voices.find((v) => /^en/i.test(v.lang)) || null;
  }

  /** Speak after `delay` seconds. Returns an estimated duration (s). */
  say(text, { delay = 0, rate = 1, pitch = 1 } = {}) {
    const est = text.split(/\s+/).length * 0.37 / rate + 0.5;
    if (!this.synth) return est;
    const id = setTimeout(() => {
      try {
        const u = new window.SpeechSynthesisUtterance(text);
        if (this.voice) u.voice = this.voice;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = Math.max(0, Math.min(1, this.volume));
        this.synth.speak(u);
      } catch {
        /* speech is optional */
      }
    }, Math.max(0, delay * 1000));
    this._timers.push(id);
    return est;
  }

  cancel() {
    for (const id of this._timers) clearTimeout(id);
    this._timers.length = 0;
    try {
      this.synth?.cancel();
    } catch {
      /* ignore */
    }
  }
}
