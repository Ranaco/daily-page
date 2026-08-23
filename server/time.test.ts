/** Run with: npx tsx server/time.test.ts */
import { addDays, dayOfWeek, logicalDay, weekDays, weekIndex, weekStart } from './time.js'
import { cellFor } from './store.js'

let fails = 0
function is(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`)
}

// --- the 4am boundary, in IST ------------------------------------------
// 01:00 IST on the 12th = 19:30 UTC on the 11th, and belongs to the 11th.
is('1:00am IST belongs to the previous day',
  logicalDay(new Date('2026-08-11T19:30:00Z')), '2026-08-11')

// 03:59 IST on the 12th is still the 11th.
is('3:59am IST is still the previous day',
  logicalDay(new Date('2026-08-11T22:29:00Z')), '2026-08-11')

// 04:01 IST on the 12th has rolled over.
is('4:01am IST is a new day',
  logicalDay(new Date('2026-08-11T22:31:00Z')), '2026-08-12')

// Midday is unremarkable.
is('midday IST is that day',
  logicalDay(new Date('2026-08-12T07:00:00Z')), '2026-08-12')

// --- weeks --------------------------------------------------------------
is('week starts Monday', weekStart('2026-08-13'), '2026-08-10')          // Thu -> Mon
is('Sunday belongs to the week that began Monday', weekStart('2026-08-16'), '2026-08-10')
is('Monday is its own week start', weekStart('2026-08-10'), '2026-08-10')
is('seven days', weekDays('2026-08-10').length, 7)
is('last day is Sunday', dayOfWeek(weekDays('2026-08-10')[6]!), 0)
is('week index counts whole weeks elapsed', weekIndex('2026-08-12', '2026-08-26'), 2)
is('same week is index 0', weekIndex('2026-08-10', '2026-08-16'), 0)
is('fourteen days is index 2', weekIndex('2026-08-10', '2026-08-24'), 2)

// The regression that shipped: starting on a Sunday used to snap the start
// back to the previous Monday, so the very next day counted as week 2.
is('a Sunday start still gets a full first week',
  weekIndex('2026-08-23', '2026-08-24'), 0)
is('day six of a Sunday start is still week 1',
  weekIndex('2026-08-23', '2026-08-29'), 0)
is('day seven rolls over',
  weekIndex('2026-08-23', '2026-08-30'), 1)
is('start day itself is week 1', weekIndex('2026-08-24', '2026-08-24'), 0)

// --- never miss twice ---------------------------------------------------
const ticks = new Map<string, Set<string>>([
  ['2026-08-10', new Set(['out'])],   // Mon: done
  ['2026-08-11', new Set()],          // Tue: missed, but Mon was done -> forgiven
  ['2026-08-12', new Set()],          // Wed: missed again -> a real miss
  ['2026-08-13', new Set(['out'])],   // Thu: done
])
const today = '2026-08-14'
is('done stays done',            cellFor('out', '2026-08-10', today, ticks), 'done')
is('first miss is forgiven',     cellFor('out', '2026-08-11', today, ticks), 'forgiven')
is('second miss counts',         cellFor('out', '2026-08-12', today, ticks), 'miss')
is('back on it',                 cellFor('out', '2026-08-13', today, ticks), 'done')
is('tomorrow is not a miss',     cellFor('out', '2026-08-15', today, ticks), 'future')

// --- date arithmetic across a month edge --------------------------------
is('rolls into September', addDays('2026-08-31', 1), '2026-09-01')
is('rolls back into August', addDays('2026-09-01', -1), '2026-08-31')

console.log(fails ? `\n${fails} failing` : '\nall passing')
process.exit(fails ? 1 : 0)
