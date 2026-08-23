/**
 * The plan, as data. Editing this file and re-running `npm run db:seed`
 * is how you change habits — nothing else reads a hardcoded list.
 */

/**
 * The five daily pushes, and the local time each one fires.
 * A habit's `slot` decides which push is the first to mention it; the wrap-up
 * always lists whatever is still unticked, so nothing can fall through.
 */
export const SLOTS = {
  morning: '07:10',  // the list for the day
  lunch:   '12:15',  // fires BEFORE lunch — ordering at 12:15 is the whole point
  midday:  '13:20',  // the post-meal walk
  draw:    '21:00',  // the drawing block, the highest-value habit
  wrap:    '00:20',  // three lines, and anything still open
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
  /** Weekly habits are scored once per week, not once per day. */
  weekly?: boolean
  /** 0 = Sun … 6 = Sat. Omit for every day. */
  days?: number[]
}

export const HABITS: Habit[] = [
  // ---- Phase 1 · the clock ---------------------------------------------
  { id: 'wake',   phase: 1, time: '7:15',    slot: 'morning', points: 5, spine: true,
    label: 'Up, feet on the floor', sub: 'Inside 60 seconds. Phone stays face-down.' },
  { id: 'out',    phase: 1, time: '7:20',    slot: 'morning', points: 5, spine: true,
    label: 'Outside, 15 minutes',   sub: 'Daylight and walking. No phone, no earphones.' },
  { id: 'lights', phase: 1, time: '1:00',    slot: 'wrap',    points: 5, spine: true,
    label: 'Lights out',            sub: 'At 1:00, not "when tired".' },

  // ---- Phase 2 · the body ----------------------------------------------
  { id: 'move',   phase: 2, time: '7:40',    slot: 'morning', points: 4, spine: true,
    label: 'Move, 25 minutes',      sub: 'Mon/Wed/Fri aerobic. Tue/Thu strength.' },
  { id: 'bfast',  phase: 2, time: '8:20',    slot: 'morning', points: 2, spine: false,
    label: 'Protein breakfast',     sub: 'Eggs, curd, paneer. Kills the 2pm crash.' },
  { id: 'lunch',  phase: 2, time: '12:45',   slot: 'lunch',   points: 2, spine: false,
    label: 'Lunch at 12:45',        sub: 'Protein and veg first, rice last.' },
  { id: 'pwalk',  phase: 2, time: '1:20',    slot: 'midday',  points: 2, spine: false,
    label: 'Walk after lunch',      sub: '10 minutes. Best single fix for the slump.' },

  // ---- Phase 3 · the mind ----------------------------------------------
  { id: 'aloud',  phase: 3, time: '9:00',    slot: 'morning', points: 2, spine: false,
    label: 'Read aloud, 10 min',    sub: 'Standing, louder than feels natural.' },
  { id: 'read',   phase: 3, time: '9:15',    slot: 'morning', points: 3, spine: false,
    label: 'Read, 15 minutes',      sub: 'Paper book. Phone in another room.' },
  { id: 'deep',   phase: 3, time: '10:00',   slot: 'lunch',   points: 4, spine: false,
    label: 'Deep block, 90 min',    sub: 'One hard problem. No Slack, door shut.' },
  { id: 'draw',   phase: 3, time: '9:00 pm', slot: 'draw',    points: 4, spine: true,
    label: 'Draw, 45 minutes',      sub: 'No outcome, nothing to post. Screens off.' },
  { id: 'log',    phase: 3, time: '12:30',   slot: 'wrap',    points: 2, spine: false,
    label: 'Three lines',           sub: 'What happened. What you felt, and where. One thing tomorrow.' },

  // ---- Phase 4 · the world ---------------------------------------------
  { id: 'rung',   phase: 4, time: '7:00 pm', slot: 'draw',    points: 5, spine: false,
    days: [2, 4],
    label: 'Social rung',           sub: 'Current rung on the ladder. Tue and Thu.' },
  { id: 'place',  phase: 4, time: 'Sat',     slot: 'draw',    points: 3, spine: false,
    weekly: true,
    label: 'One new place',         sub: 'Somewhere in the city you have never been.' },
  { id: 'home',   phase: 4, time: 'Sun',     slot: 'lunch',   points: 3, spine: false,
    weekly: true,
    label: 'Call home',             sub: 'Parents, siblings. Voice, not text.' },
]

export const REWARDS = [
  { id: 'evening',  cost: 150,  name: 'One evening, zero rules',    note: 'No schedule, no ticks, no bot.' },
  { id: 'food',     cost: 250,  name: 'Order whatever you want',    note: 'Dinner with no protein-first anything.' },
  { id: 'inks',     cost: 400,  name: 'New sketchbook and inks',    note: 'The good ones, not the ones you make do with.' },
  { id: 'dayoff',   cost: 600,  name: 'A whole day off',            note: 'No office, no obligations, phone on silent.' },
  { id: 'game',     cost: 900,  name: 'A game you have been eyeing',note: 'Full price, no waiting for a sale.' },
  { id: 'weekend',  cost: 2000, name: 'Weekend out of Ahmedabad',   note: 'Two nights somewhere new. The big one.' },
]

/**
 * Phases unlock on elapsed time, never on performance. This is deliberate:
 * the failure mode being guarded against is starting everything at once,
 * and "I had a great week so I'll add five habits" is exactly that failure
 * wearing a reward hat.
 */
export function phaseForWeek(weekIndex: number): 1 | 2 | 3 | 4 {
  if (weekIndex < 2) return 1
  if (weekIndex < 4) return 2
  if (weekIndex < 6) return 3
  return 4
}

/** A week counts if you bank at least this share of the points available. */
export const WEEK_TARGET = 0.8

/** XP needed per level. XP only ever goes up. */
export const XP_PER_LEVEL = 100
