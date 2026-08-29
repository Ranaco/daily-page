/**
 * The plan, as data. Editing this file and re-running the seed is how you
 * change habits — nothing else reads a hardcoded list.
 */

/**
 * The daily pushes, and the local time each one fires.
 *
 * A habit's `slot` decides which push is the first to mention it; the wrap-up
 * always lists whatever is still unticked, so nothing can fall through.
 *
 * `morning` sits at 09:15 deliberately. Phase 1 does NOT move your wake time —
 * the first week takes nothing away, it only gives an hour back. When phase 2
 * lands and `wake` moves to 07:30, move the morning cron with it.
 */
export const SLOTS = {
  morning: '09:15',  // the block, and the day's list
  lunch:   '12:15',  // fires BEFORE lunch — ordering at 12:15 is the whole point
  midday:  '13:20',  // the post-meal walk
  draw:    '21:00',  // the drawing block
  wrap:    '00:20',  // three lines, the mood number, and anything still open
} as const

export type Slot = keyof typeof SLOTS

export type Habit = {
  id: string
  phase: 1 | 2 | 3 | 4
  /** Display time. Also decides which push mentions it first. */
  time: string
  slot: Slot
  label: string
  sub: string
  points: number
  spine: boolean
  /**
   * Scored once per week rather than once per day. A weekly habit still needs
   * `days`: that is the day it becomes AVAILABLE in the week's denominator, so
   * a Saturday habit does not drag Tuesday's percentage down.
   */
  weekly?: boolean
  /** 0 = Sun … 6 = Sat. Omit for every day. */
  days?: number[]
  /**
   * Cannot be ticked until something is attached to it in the journal.
   *
   * For the talk this is the difference between a record and a claim. It is the
   * habit most easily reduced to a tick — nobody sees the video, and "I mostly
   * did it" is always available — and it is also the one whose artifacts are
   * worth the most in six months, when the question is whether the speaking
   * actually changed. Proof is what stops it decaying into a checkbox.
   */
  needsProof?: boolean
}

/**
 * PHASE ORDER IS DELIBERATE AND WAS REVERSED ON PURPOSE.
 *
 * The first version opened with the clock — wake earlier, sleep earlier, get
 * outside — and put drawing three weeks out. That is how someone with spare
 * discipline would build it. The discipline here is already fully committed to
 * work; there is none spare. Curiosity is the tank that still has fuel in it.
 *
 * So phase 1 gives and takes nothing: an hour that belongs to you, a book, and
 * the drawing block. The clock only moves in phase 2, once there is a reason to
 * be awake earlier and once the 00:30–02:00 doomscroll tail has lost its job.
 *
 * Phase 1 also carries `log`, because the three lines are the measuring
 * instrument. Starting them in week 3 means no baseline to compare against.
 */
export const HABITS: Habit[] = [
  // ---- Phase 1 · what you miss -----------------------------------------
  { id: 'mine',   phase: 1, time: '9:15',     slot: 'morning', points: 6, spine: true,
    label: 'The first hour',        sub: 'Yours. Writing, learning, or the project. Before work opens.' },
  { id: 'read',   phase: 1, time: '10:20',    slot: 'morning', points: 3, spine: false,
    label: 'Read, 15 minutes',      sub: 'Paper book. Phone in another room.' },
  { id: 'draw',   phase: 1, time: '9:00 pm',  slot: 'draw',    points: 4, spine: true,
    label: 'Draw, 45 minutes',      sub: 'One dated sketchbook, in order. Nothing posted, nothing torn out.' },
  { id: 'log',    phase: 1, time: '12:30',    slot: 'wrap',    points: 2, spine: false,
    label: 'Three lines',           sub: 'What happened. What you felt, and where. One thing tomorrow.' },

  // ---- Phase 2 · the clock, and her ------------------------------------
  { id: 'wake',   phase: 2, time: '7:30',     slot: 'morning', points: 5, spine: true,
    label: 'Up, feet on the floor', sub: 'Inside 60 seconds. Phone stays face-down.' },
  { id: 'out',    phase: 2, time: '7:40',     slot: 'morning', points: 4, spine: true,
    label: 'Outside, 15 minutes',   sub: 'Daylight and walking. No phone, no earphones.' },
  { id: 'call',   phase: 2, time: '11:30 pm', slot: 'wrap',    points: 5, spine: true,
    label: 'Call Aastha',           sub: '23:30 here is 21:00 there. The hour nothing else wants.' },
  { id: 'lights', phase: 2, time: '12:30',    slot: 'wrap',    points: 5, spine: true,
    label: 'Lights out',            sub: 'At 00:30, not "when tired". Seven hours is the floor.' },

  // ---- Phase 3 · the body, and the voice -------------------------------
  { id: 'move',   phase: 3, time: '8:00',     slot: 'morning', points: 4, spine: true,
    label: 'Move, 25 minutes',      sub: 'Mon/Wed/Fri aerobic. Tue/Thu strength.' },
  { id: 'bfast',  phase: 3, time: '8:40',     slot: 'morning', points: 2, spine: false,
    label: 'Protein breakfast',     sub: 'Eggs, curd, paneer. Kills the 2pm crash.' },
  { id: 'aloud',  phase: 3, time: '10:40',    slot: 'morning', points: 2, spine: false,
    label: 'Read aloud, 10 min',    sub: 'Standing, louder than feels natural. Reps for Saturday.' },
  { id: 'lunch',  phase: 3, time: '12:45',    slot: 'lunch',   points: 2, spine: false,
    label: 'Lunch at 12:45',        sub: 'Protein and veg first, rice last.' },
  { id: 'pwalk',  phase: 3, time: '1:20',     slot: 'midday',  points: 2, spine: false,
    label: 'Walk after lunch',      sub: '10 minutes. Best single fix for the slump.' },
  { id: 'talk',   phase: 3, time: 'Sat',      slot: 'morning', points: 6, spine: false,
    weekly: true, days: [6], needsProof: true,
    label: 'The Saturday talk',     sub: '10 min reading, 5 min writing by hand, then say it to camera.' },

  // ---- Phase 4 · the world ---------------------------------------------
  { id: 'rung',   phase: 4, time: '7:00 pm',  slot: 'draw',    points: 5, spine: false,
    days: [2, 4],
    label: 'Social rung',           sub: 'The current rung. /ladder to see it. Tue and Thu.' },
  { id: 'place',  phase: 4, time: 'Sat',      slot: 'morning', points: 3, spine: false,
    weekly: true, days: [6],
    label: 'One new place',         sub: 'Somewhere in the city you have never been.' },
  { id: 'home',   phase: 4, time: 'Sun',      slot: 'lunch',   points: 3, spine: false,
    weekly: true, days: [0],
    label: 'Call home',             sub: 'Parents, siblings. Voice, not text.' },
  { id: 'review', phase: 4, time: 'Sun',      slot: 'draw',    points: 3, spine: false,
    weekly: true, days: [0],
    label: 'The Sunday hour',       sub: 'Read the grid and the notes. Change one thing. Then stop.' },
]

// -------------------------------------------------------- the first hour

/**
 * The morning block has a declared mode, chosen at the morning push and logged.
 * A fixed rota gets resented by week two; free choice at 09:15 while depleted
 * defaults to whichever mode is easiest. Declaring it costs one tap and makes
 * the distribution visible at the end of the week.
 */
export type Mode = { id: string; label: string; prompt: string }

export const MODES: Mode[] = [
  { id: 'write', label: '✍ Writing',
    prompt: 'A page of prose. Not a journal entry, not documentation — a page about anything, written to be read by nobody. Longhand or typed, your call.' },
  { id: 'learn', label: '📖 Learning',
    prompt: 'One thing you do not know, followed far enough to explain it. Not the Saturday topic — pick this one yourself.' },
  { id: 'project', label: '🔧 Project',
    prompt: 'The personal project. No deadline, no user, no architecture document — if it has invariants it is work, and work does not get this hour.' },
]

/**
 * Personal-project mornings are capped. The failure mode is specific and
 * predictable: "personal project" becomes work with a different repo name,
 * done for free, at 09:15, and it eats the block whole.
 */
export const PROJECT_MODE_CAP = 2

// ----------------------------------------------------- the Saturday talk

/**
 * Three stages, and the order is the whole design:
 *   read (screen on)  →  write (screen off, from memory)  →  speak (from notes)
 *
 * Stage 2 is the one that does the work. Transcribing while reading feels
 * productive and trains nothing; reconstructing from memory is the recall test.
 *
 * Rules that live in the message rather than in code, because nothing can
 * enforce them and nothing needs to: no AI, at any stage. Websites are fine.
 * The struggle is the point — it is the exact thing that got automated out of
 * the rest of the week.
 */
export const TALK = {
  readMinutes: 10,
  writeMinutes: 5,
  speakMinutes: 2,
  notebook: 'the topic notebook — dated, in order, nothing torn out',
} as const

/**
 * The topic pool. A topic is used once and then never again until the pool is
 * exhausted, and there are no re-rolls — the failure mode is rolling until you
 * land on something adjacent to what you already know, at which point the whole
 * habit becomes a comfort exercise.
 */
export const TOPICS: Record<string, string[]> = {
  space: [
    'Why Venus spins backwards',
    'What a pulsar actually is',
    'Why we have never been back to the Moon',
    'How the Voyager probes still phone home',
    'What happens at the edge of the heliosphere',
    'Why Saturn has rings and Jupiter barely does',
    'The Fermi paradox, and the best objection to it',
    'How a gravity assist steals speed from a planet',
    'What dark matter evidence actually looks like',
    'Why Mars lost its atmosphere',
  ],
  bodies: [
    'What actually happens during an orgasm',
    'Why the clitoris was left out of anatomy textbooks until recently',
    'How hormonal contraception works, mechanically',
    'Why human sperm competition is unusual among primates',
    'What the refractory period is for',
    'How HIV became survivable',
    'Why menstrual cycles synchronise, or do not',
    'The history of the vibrator as a medical device',
    'What intersex means biologically',
    'Why humans are among the few animals that have sex for pleasure',
  ],
  food: [
    'Why bread needs gluten and cake does not',
    'What umami is, chemically',
    'How fish sauce is made and why it is not rotten',
    'Why Maillard browning is not caramelisation',
    'The economics of the global banana monoculture',
    'How coffee decaffeination works',
    'Why Indian food uses asafoetida',
    'What ageing does to beef',
    'How MSG got its reputation and whether it deserved it',
    'Why fermentation preserves instead of spoiling',
  ],
  history: [
    'How the Bengal famine of 1943 happened',
    'What the Bronze Age collapse was',
    'Why the Ottoman Empire declined so slowly',
    'The Partition of India in the words of people who walked it',
    'How Genghis Khan organised an army',
    'What the Haitian Revolution changed',
    'Why the Roman concrete recipe was lost',
    'The Great Emu War',
    'How the Silk Road actually functioned as a trade network',
    'What happened at Jallianwala Bagh and what followed',
  ],
  money: [
    'What a central bank actually does when it prints money',
    'How index funds took over investing',
    'Why hyperinflation ends the way it does',
    'What happened in 2008, in one clean explanation',
    'How insurance companies price risk',
    'Why the Indian rupee is not fully convertible',
    'What short selling is and why it is legal',
    'How UPI made India cashless faster than anyone predicted',
    'What a sovereign default looks like from inside the country',
    'Why gold, of all things',
  ],
  mind: [
    'What actually happens when you form a memory',
    'Why sleep deprivation looks like depression',
    'How EMDR is supposed to work, and the case against it',
    'What the replication crisis broke in psychology',
    'Why grief has physical symptoms',
    'How anaesthesia turns consciousness off',
    'What alexithymia is',
    'Why habits form in the basal ganglia and not the cortex',
    'The Stanford prison experiment, and why it fell apart',
    'What burnout does to the body, measurably',
  ],
  earth: [
    'How plate tectonics was proven',
    'Why the Sahara was green 8,000 years ago',
    'What causes the Indian monsoon',
    'How lightning actually forms',
    'Why the ocean has layers that do not mix',
    'What happened at Lake Nyos in 1986',
    'How a river changes course, and what that did to Bihar',
    'Why deserts form where they do',
    'What the Great Oxygenation Event was',
    'How groundwater depletion is measured from orbit',
  ],
  life: [
    'How octopus cognition works without a central brain',
    'Why trees share nutrients through fungal networks',
    'What tardigrades survive and how',
    'How migratory birds navigate',
    'Why cancer is many diseases and not one',
    'What CRISPR actually cuts',
    'How antibiotics stopped working',
    'Why mitochondria have their own DNA',
    'What eusociality is and how it evolved separately',
    'How viruses shaped the human genome',
  ],
  art: [
    'What perspective did to European painting',
    'Why Japanese woodblock printing changed Impressionism',
    'How pigments were made before synthetics',
    'What the Bauhaus was actually arguing for',
    'Why Indian miniature painting has no vanishing point',
    'How comics developed a grammar of panels',
    'What makes a typeface readable',
    'Why brutalism is hated and defended',
    'How animation cel work was done before computers',
    'What Warli painting is, and who paints it now',
  ],
  music: [
    'Why the octave sounds like the same note',
    'What a raga is, structurally',
    'How auto-tune works and what it replaced',
    'Why the blues scale sounds sad',
    'What equal temperament gave up',
    'How the 808 drum machine changed popular music',
    'Why some people cannot hold a tune',
    'What a sampler did to copyright law',
    'How Gregorian chant was notated before staves',
    'Why bass frequencies travel further',
  ],
  language: [
    'How writing was invented, more than once',
    'Why English spelling is broken',
    'What happened to Sanskrit as a spoken language',
    'How sign languages develop grammar independently',
    'Why some languages have no words for numbers',
    'What Devanagari inherited from Brahmi',
    'How a creole forms',
    'Why Basque is related to nothing',
    'What linguistic tone actually is',
    'How Hindi and Urdu split',
  ],
  law: [
    'What habeas corpus protects',
    'How the Indian Constitution was drafted, and by whom',
    'Why jury trials were abolished in India',
    'What the right to repair fight is about',
    'How extradition treaties work',
    'What a patent troll does',
    'Why defamation law differs so much between countries',
    'How the Nuremberg trials invented a category of crime',
    'What the Aadhaar judgment actually decided',
    'How international waters are governed',
  ],
  physics: [
    'What entropy really means, without the metaphors',
    'Why nothing can go faster than light',
    'How a transistor switches',
    'What superconductivity is for',
    'Why quantum tunnelling lets the Sun burn',
    'How MRI machines see inside you',
    'What the double-slit experiment shows and does not show',
    'Why glass is not a liquid',
    'How lasers produce one colour',
    'What the second law has to do with time',
  ],
  people: [
    'Srinivasa Ramanujan, and what he did without proofs',
    'Ada Lovelace and the first program',
    'Hedy Lamarr and frequency hopping',
    'B. R. Ambedkar as an economist',
    'Ignaz Semmelweis and why nobody believed him',
    'Grace Hopper and the case for compilers',
    'Mary Anning and the fossils she was not credited for',
    'Fritz Haber, who fed and gassed the world',
    'Savitribai Phule and the first schools',
    'Norman Borlaug and the Green Revolution in Punjab',
  ],
  world: [
    'Why Singapore is not a democracy in the usual sense',
    'What the Belt and Road actually built',
    'How Petrozavodsk ended up where it is, and who founded it',
    'Why Bihar was the richest region in ancient India',
    'What happened to the Aral Sea',
    'How Dubai works, economically',
    'Why Switzerland has so many referendums',
    'What sanctions do to an ordinary household',
    'How Ahmedabad grew around its mills',
    'Why the Russian Far East is nearly empty',
  ],
}

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

export type Topic = { id: string; domain: string; text: string }

export const ALL_TOPICS: Topic[] = Object.entries(TOPICS).flatMap(([domain, list]) =>
  list.map((text) => ({ id: slugify(text), domain, text })))

// ------------------------------------------------------- the social ladder

/**
 * `rung` used to read "Current rung on the ladder" with no ladder anywhere in
 * the repo — the highest-friction habit in the plan pointing at a document that
 * did not exist. Rung 1 is deliberately small enough to be embarrassing; that
 * is what makes it happen.
 *
 * Three clears move you up. Two misses move you down one. The bot tracks it.
 */
export const LADDER: string[] = [
  'Order at a counter instead of on an app. Say the order out loud.',
  'Ask one shop person one real question — what they recommend, and why.',
  'Sit in a café for thirty minutes. No laptop, no earphones. Just sit.',
  'Small talk with one stranger: the barista, the guard, the man at the stall. Two exchanges minimum.',
  'Say one unprompted thing in a work call that is not about the work.',
  'Go to a public thing alone — a screening, a talk, a gig, a match.',
  'Have one conversation with someone new that lasts past the first exit ramp.',
  'Make a plan with someone who is not Madhav, Vatsal, Kunal, or your brother — and keep it.',
]

export const LADDER_UP_AFTER = 3
export const LADDER_DOWN_AFTER = 2

// --------------------------------------------------------------- rewards

/**
 * The shelf only holds things you would otherwise defer indefinitely.
 *
 * An earlier version listed "one evening, zero rules" and "order whatever you
 * want" — both of which you can simply take, which teaches the points are
 * decoration. If a reward is available without the points, it is not a reward.
 */
export const REWARDS = [
  { id: 'inks',    cost: 400,  name: 'The good sketchbook and inks',  note: 'The ones you actually want, not the ones you make do with.' },
  { id: 'course',  cost: 700,  name: 'A real drawing course',         note: 'With exercises and a curriculum. Learning was on the list, not just quiet.' },
  { id: 'game',    cost: 900,  name: 'A game you have been eyeing',   note: 'Full price, no waiting for a sale.' },
  { id: 'dayoff',  cost: 1200, name: 'A whole day off',               note: 'No office, no obligations, phone on silent. Claim it and then actually take it.' },
  { id: 'weekend', cost: 2000, name: 'Weekend out of Ahmedabad',      note: 'Two nights somewhere new.' },
  { id: 'visit',   cost: 6000, name: 'The flight to Petrozavodsk',    note: 'The big one. Delete this line if it is the wrong big one.' },
]

/**
 * The fallback phase clock: one week per phase. Used only to seed the stored
 * phase on first read — after that, progression is earned (see PHASE_GATE).
 *
 * Phases must never unlock EARLY on performance: "I had a great week so I'll
 * add five habits" is starting everything at once wearing a reward hat. Being
 * held BACK is the opposite move, and is what the gate below does.
 */
export function phaseForWeek(weekIndex: number): 1 | 2 | 3 | 4 {
  if (weekIndex < 1) return 1
  if (weekIndex < 2) return 2
  if (weekIndex < 3) return 3
  return 4
}

/** A week counts if you bank at least this share of the points available. */
export const WEEK_TARGET = 0.8

/**
 * The share needed to open the next phase. Deliberately BELOW WEEK_TARGET.
 *
 * At 80% the slack is 1.4 days of total collapse per week, in every phase:
 *
 *   phase 1  105 pts/wk   slack@80% = 21 (1.4 days)   slack@70% = 31 (2.1 days)
 *   phase 2  238 pts/wk   slack@80% = 47 (1.4 days)   slack@70% = 71 (2.1 days)
 *   phase 3  328 pts/wk   slack@80% = 65 (1.4 days)   slack@70% = 98 (2.1 days)
 *   phase 4  347 pts/wk   slack@80% = 69 (1.5 days)   slack@70% = 104 (2.3 days)
 *
 * Gating at 80% keys progression to a single wrecked weekend — which is, right
 * now, the most broken part of the week. Two lines doing two different jobs:
 * 80% is whether the week counted, 70% is whether the next phase opens.
 */
export const PHASE_GATE = 0.7

/**
 * Weeks in one phase before it opens regardless. The gate can hold you back
 * twice; it cannot strand you.
 *
 * Without this, the habits aimed at the actual complaint — the ladder, new
 * places, the talk, calling home — sit in phases 3 and 4 and become the least
 * reachable things in the plan. And a repeated phase means the same handful of
 * habits for a month, which is the monotony this is meant to break.
 */
export const PHASE_MAX_WEEKS = 3

/**
 * An under-target week locks the reward shelf for the following week.
 *
 * The phase hold is the consequence that bites immediately; this is the one
 * that starts mattering later, once the phases have all opened and there is
 * nothing left to withhold. Nothing here scolds — messages.ts forbids
 * expressing disappointment, and that rule stands. Costs, not shame.
 */
export const SHELF_LOCK_ON_MISS = true

/**
 * Consecutive under-target weeks before the bot offers to shrink the load.
 *
 * missedTwice() only sees a SPECIFIC habit missed on two consecutive days, so
 * it is blind to the likeliest failure here: fifteen habits, 65% every week,
 * scattered differently each time, no habit ever missed twice. The valve never
 * fires, nothing is ever offered, and the plan rots politely.
 */
export const WEEK_VALVE_AFTER = 2

/** XP needed per level. XP only ever goes up. */
export const XP_PER_LEVEL = 100

/** The website warns if no cron has fired in this long — see /api/state. */
export const STALE_TICK_HOURS = 26
