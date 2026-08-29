import { ALL_TOPICS, MODES } from './config.js'
import {
  ladderRung, modeSpread, pickTopic, projectModeLeft, rungText,
  underTargetRun, valveCandidates, weekValveTripped,
} from './plan.js'

let failed = 0
function is(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

// ---------------------------------------------------------------- topics

const pool = [
  { id: 'a', domain: 'x', text: 'A' },
  { id: 'b', domain: 'x', text: 'B' },
  { id: 'c', domain: 'x', text: 'C' },
]

is('picks from unused only', pickTopic(pool, new Set(['a', 'b']), () => 0)?.id, 'c')
is('deterministic with rand 0', pickTopic(pool, new Set(), () => 0)?.id, 'a')
is('rand near 1 picks the last', pickTopic(pool, new Set(), () => 0.999)?.id, 'c')
is('exhausted pool starts over', pickTopic(pool, new Set(['a', 'b', 'c']), () => 0)?.id, 'a')
is('empty pool returns null', pickTopic([], new Set(), () => 0), null)
is('the real pool has no duplicate ids',
  ALL_TOPICS.length, new Set(ALL_TOPICS.map((t) => t.id)).size)
is('the real pool is big enough for a year', ALL_TOPICS.length >= 52, true)

// ------------------------------------------------------------ week valve

is('no closed weeks is no run', underTargetRun([]), 0)
is('one good week', underTargetRun([90]), 0)
is('one bad week', underTargetRun([70]), 1)
is('run counts from the most recent backwards', underTargetRun([50, 50, 90]), 0)
is('two bad weeks after a good one', underTargetRun([90, 60, 70]), 2)
is('80 exactly is not under target', underTargetRun([80]), 0)
is('valve needs two', weekValveTripped([70]), false)
is('valve trips on two', weekValveTripped([70, 60]), true)
is('valve resets on a good week', weekValveTripped([60, 60, 85]), false)

// -------------------------------------------------------------- candidates

const habits = [
  { id: 'spine', points: 1, spine: true,  weekly: false, active: true,  phase: 1 },
  { id: 'cheap', points: 2, spine: false, weekly: false, active: true,  phase: 1 },
  { id: 'mid',   points: 3, spine: false, weekly: false, active: true,  phase: 1 },
  { id: 'dear',  points: 6, spine: false, weekly: false, active: true,  phase: 1 },
  { id: 'week',  points: 2, spine: false, weekly: true,  active: true,  phase: 1 },
  { id: 'off',   points: 2, spine: false, weekly: false, active: false, phase: 1 },
  { id: 'locked',points: 2, spine: false, weekly: false, active: true,  phase: 4 },
]
is('cheapest non-spine first',
  valveCandidates(habits, 1).map((h) => h.id), ['cheap', 'mid', 'dear'])
is('never offers a spine habit',
  valveCandidates(habits, 1).some((h) => h.spine), false)
is('ignores locked phases',
  valveCandidates(habits, 1).some((h) => h.id === 'locked'), false)
is('respects the limit', valveCandidates(habits, 1, 1).map((h) => h.id), ['cheap'])

// ------------------------------------------------------------------ modes

is('project cap starts at two', projectModeLeft([]), 2)
is('one project used', projectModeLeft(['project', 'write']), 1)
is('cap cannot go negative', projectModeLeft(['project', 'project', 'project']), 0)
is('spread counts unused modes as zero',
  modeSpread(['write', 'write'], MODES.map((m) => m.id)),
  { write: 2, learn: 0, project: 0 })

// ----------------------------------------------------------------- ladder

is('starts at rung one', ladderRung([]), 1)
is('two clears is not enough', ladderRung([true, true]), 1)
is('three clears move up', ladderRung([true, true, true]), 2)
is('a miss resets the clear count', ladderRung([true, true, false, true]), 1)
is('two misses drop a rung', ladderRung([true, true, true, false, false]), 1)
is('rung one is the floor', ladderRung([false, false, false, false]), 1)
is('six clears move up twice', ladderRung(Array(6).fill(true)), 3)
is('rung text is never empty', rungText(1).length > 0, true)
is('rung text clamps past the end', rungText(99), rungText(8))

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
