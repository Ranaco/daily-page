import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { db, schema } from './db/client.js'
import {
  ALL_TOPICS, HABITS, MODES, REWARDS, SHELF_LOCK_ON_MISS, STALE_TICK_HOURS,
  PHASE_GATE, WEEK_TARGET, XP_PER_LEVEL, phaseForWeek,
} from './config.js'
import {
  holdsLeft, ladderRung, modeSpread, pickTopic, projectModeLeft, shelfLocks, shouldAdvance,
} from './plan.js'
import { addDays, dayOfWeek, logicalDay, weekDays, weekIndex, weekStart } from './time.js'

const { habits, checkins, claims, notes, settings, topics, modes, entries } = schema

export type CellState = 'done' | 'forgiven' | 'miss' | 'future' | 'locked'

export type HabitRow = {
  id: string; phase: number; time: string; slot: string
  label: string; sub: string; points: number
  spine: boolean; weekly: boolean; days: number[] | null
  needsProof: boolean
  active: boolean; sort: number
}

// ---------------------------------------------------------------- settings

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db().select().from(settings).where(eq(settings.key, key)).limit(1)
  return row?.value ?? null
}

export async function setSetting(key: string, value: string) {
  await db().insert(settings).values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
}

/**
 * The day the plan started. Created on first read so nothing needs a manual step.
 *
 * Stores the ACTUAL day, not that week's Monday — snapping to Monday silently
 * back-dates the plan by up to six days and burns phase 1 before it begins.
 */
export async function startedOn(): Promise<string> {
  const existing = await getSetting('started_on')
  if (existing) return existing
  const today = logicalDay()
  await setSetting('started_on', today)
  return today
}

/**
 * The current phase is now STORED, not derived from the calendar — progression
 * is earned at each week rollover (see advancePhase). The date-based clock is
 * only the seed for the very first read, so an existing run keeps the phase it
 * had rather than snapping back to 1.
 */
export async function currentPhase(day = logicalDay()): Promise<1 | 2 | 3 | 4> {
  const forced = await getSetting('phase_override')
  if (forced) return Number(forced) as 1 | 2 | 3 | 4

  const stored = await getSetting('phase')
  if (stored) return Number(stored) as 1 | 2 | 3 | 4

  const seeded = phaseForWeek(weekIndex(await startedOn(), day))
  await setSetting('phase', String(seeded))
  await setSetting('weeks_in_phase', '0')
  return seeded
}

/** Weeks of this phase already closed. 0 for a phase that has not closed one. */
export async function weeksInPhase(): Promise<number> {
  return Number((await getSetting('weeks_in_phase')) ?? '0')
}

/**
 * Called once per week rollover, from the morning cron. Returns what happened
 * so the bot can say it.
 *
 * The phase hold is the whole consequence of an under-gate week, and it is
 * deliberately the only one that bites immediately — the shelf lock below does
 * not start mattering until there is something on the shelf worth withholding.
 */
export async function advancePhase(closingPct: number) {
  const phase = await currentPhase()
  const closed = (await weeksInPhase()) + 1
  const verdict = shouldAdvance(closingPct, closed)

  if (!verdict.advance) {
    await setSetting('weeks_in_phase', String(closed))
    return { ...verdict, phase, from: phase, weeksInPhase: closed, holds: holdsLeft(closed) }
  }

  const next = Math.min(4, phase + 1) as 1 | 2 | 3 | 4
  await setSetting('phase', String(next))
  await setSetting('weeks_in_phase', '0')
  return { ...verdict, phase: next, from: phase, weeksInPhase: 0, holds: holdsLeft(0) }
}

// ------------------------------------------------------------- shelf lock

/**
 * An under-target week locks the shelf for the next one. Stored as the last day
 * it stays locked, so it expires on its own and no job has to unlock it.
 */
export async function lockShelfFor(wkStart: string) {
  if (!SHELF_LOCK_ON_MISS) return
  await setSetting('shelf_locked_until', addDays(wkStart, 6))
}

export async function shelfLockedUntil(today: string): Promise<string | null> {
  const until = await getSetting('shelf_locked_until')
  if (!until || until < today) return null
  return until
}

// ------------------------------------------------------------------ habits

export async function allHabits(): Promise<HabitRow[]> {
  const rows = await db().select().from(habits).orderBy(habits.sort)
  return rows.map((r) => ({ ...r, days: r.days ? (JSON.parse(r.days) as number[]) : null }))
}

/** Habits that are unlocked, active, and scheduled for this weekday. */
export function scheduledOn(rows: HabitRow[], day: string, phase: number): HabitRow[] {
  const dow = dayOfWeek(day)
  return rows.filter((h) =>
    h.active && h.phase <= phase && !h.weekly && (!h.days || h.days.includes(dow)))
}

export function weeklyHabits(rows: HabitRow[], phase: number): HabitRow[] {
  return rows.filter((h) => h.active && h.phase <= phase && h.weekly)
}

// ---------------------------------------------------------------- check-ins

async function ticksBetween(from: string, to: string) {
  return db().select().from(checkins)
    .where(and(gte(checkins.day, from), lte(checkins.day, to)))
}

export async function ticksOn(day: string): Promise<Set<string>> {
  const rows = await db().select().from(checkins).where(eq(checkins.day, day))
  return new Set(rows.map((r) => r.habitId))
}

/**
 * Tick or untick. Returns the new state plus the points delta.
 * Unticking removes the points again — this is a single-user system and the
 * only thing keeping it honest is you, so it may as well be reversible.
 */
export async function toggle(habitId: string, day: string) {
  const [h] = await db().select().from(habits).where(eq(habits.id, habitId)).limit(1)
  if (!h) throw new Error(`unknown habit: ${habitId}`)

  const [existing] = await db().select().from(checkins)
    .where(and(eq(checkins.habitId, habitId), eq(checkins.day, day))).limit(1)

  if (existing) {
    await db().delete(checkins).where(eq(checkins.id, existing.id))
    return { done: false, delta: -existing.points, habit: h, blocked: false }
  }

  // Only ticking ON is gated. Un-ticking must always work, or a bad attachment
  // traps the habit in a state there is no way back out of.
  if (h.needsProof && (await entryCount(habitId, day)) === 0) {
    return { done: false, delta: 0, habit: h, blocked: true }
  }

  await db().insert(checkins).values({ habitId, day, points: h.points })
  return { done: true, delta: h.points, habit: h, blocked: false }
}

/**
 * Tick a habit without un-ticking it if it is already done.
 *
 * Saving a journal entry ticks `log`, and that must never toggle: writing a
 * second entry on a day you already logged would otherwise silently remove the
 * points. `unique(habit_id, day)` makes the insert idempotent at the database,
 * so the conflict clause is the whole implementation.
 */
export async function tickOnce(habitId: string, day: string) {
  const [h] = await db().select().from(habits).where(eq(habits.id, habitId)).limit(1)
  if (!h || !h.active) return { ticked: false }
  const before = await db().select().from(checkins)
    .where(and(eq(checkins.habitId, habitId), eq(checkins.day, day))).limit(1)
  if (before.length) return { ticked: false }
  await db().insert(checkins).values({ habitId, day, points: h.points })
    .onConflictDoNothing()
  return { ticked: true, points: h.points }
}

// ----------------------------------------------------------------- journal

export type NewEntry = {
  day: string
  habitId?: string | null
  kind: string
  caption?: string | null
  fileId?: string | null
  uniqueId?: string | null
  mime?: string | null
  bytes?: number | null
  width?: number | null
  height?: number | null
  duration?: number | null
  meta?: Record<string, unknown> | null
}

export async function addEntry(e: NewEntry) {
  const [row] = await db().insert(entries).values({
    day: e.day,
    habitId: e.habitId ?? null,
    kind: e.kind,
    caption: e.caption ?? null,
    fileId: e.fileId ?? null,
    uniqueId: e.uniqueId ?? null,
    mime: e.mime ?? null,
    bytes: e.bytes ?? null,
    width: e.width ?? null,
    height: e.height ?? null,
    duration: e.duration ?? null,
    meta: e.meta ? JSON.stringify(e.meta) : null,
  }).returning()
  return row!
}

/** Artifacts attached to a habit on a day. Drives the proof gate. */
export async function entryCount(habitId: string, day: string): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(entries)
    .where(and(eq(entries.habitId, habitId), eq(entries.day, day)))
  return row?.n ?? 0
}

export async function attachEntry(id: number, habitId: string | null) {
  const [row] = await db().update(entries).set({ habitId })
    .where(eq(entries.id, id)).returning()
  return row ?? null
}

export async function deleteEntry(id: number) {
  await db().delete(entries).where(eq(entries.id, id))
}

export async function entryById(id: number) {
  const [row] = await db().select().from(entries).where(eq(entries.id, id)).limit(1)
  return row ?? null
}

export async function entriesOn(day: string) {
  return db().select().from(entries).where(eq(entries.day, day)).orderBy(entries.id)
}

/**
 * One calendar month of the journal, newest first.
 *
 * A month, not an offset page: the set is bounded and knowable at first paint,
 * so the scrollbar stays honest and the surface ends. Nothing here lazy-loads.
 */
export async function journalMonth(month: string) {
  const from = `${month}-01`
  const to = monthEnd(month)
  const rows = await db().select().from(entries)
    .where(and(gte(entries.day, from), lte(entries.day, to)))
    .orderBy(desc(entries.day), desc(entries.id))

  const labels = new Map((await allHabits()).map((h) => [h.id, h.label]))
  const days = new Map<string, unknown[]>()
  for (const r of rows) {
    if (!days.has(r.day)) days.set(r.day, [])
    days.get(r.day)!.push({
      ...r,
      habitLabel: r.habitId ? labels.get(r.habitId) ?? r.habitId : null,
      meta: r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : null,
    })
  }
  return {
    month,
    total: rows.length,
    days: [...days.entries()].map(([day, items]) => ({ day, items })),
  }
}

function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m!, 0))
  return d.toISOString().slice(0, 10)
}

/** Months that actually hold entries, newest first. The archive index. */
export async function journalMonths(): Promise<string[]> {
  const rows = await db()
    .select({ m: sql<string>`to_char(${entries.day}, 'YYYY-MM')` })
    .from(entries)
    .groupBy(sql`to_char(${entries.day}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${entries.day}, 'YYYY-MM') desc`)
  return rows.map((r) => r.m)
}

// ----------------------------------------------------------------- scoring

/** Lifetime points ever earned. Never decreases except by unticking. */
export async function lifetimePoints(): Promise<number> {
  const [row] = await db()
    .select({ total: sql<number>`coalesce(sum(${checkins.points}), 0)::int` })
    .from(checkins)
  return row?.total ?? 0
}

export async function spentPoints(): Promise<number> {
  const [row] = await db()
    .select({ total: sql<number>`coalesce(sum(${claims.cost}), 0)::int` })
    .from(claims)
  return row?.total ?? 0
}

export function levelFor(xp: number) {
  return { level: Math.floor(xp / XP_PER_LEVEL) + 1, into: xp % XP_PER_LEVEL, per: XP_PER_LEVEL }
}

// ------------------------------------------------------- never miss twice

/**
 * A miss is forgiven when it is the first one in a run — that is, the habit
 * was done the day before. Two in a row is the only thing the bot reacts to,
 * and it reacts by offering to make the habit smaller.
 */
export function cellFor(
  habitId: string, day: string, today: string,
  ticks: Map<string, Set<string>>,
): CellState {
  if (day > today) return 'future'
  if (ticks.get(day)?.has(habitId)) return 'done'
  const yesterday = ticks.get(addDays(day, -1))
  if (yesterday?.has(habitId)) return 'forgiven'
  return 'miss'
}

/** Habits missed both yesterday and the day before. */
export async function missedTwice(today: string): Promise<HabitRow[]> {
  const y = addDays(today, -1)
  const yy = addDays(today, -2)
  const rows = await ticksBetween(yy, y)
  const doneOn = (d: string) => new Set(rows.filter((r) => r.day === d).map((r) => r.habitId))
  const dy = doneOn(y), dyy = doneOn(yy)
  const phase = await currentPhase(today)
  const all = await allHabits()
  return scheduledOn(all, y, phase).filter((h) => !dy.has(h.id) && !dyy.has(h.id))
}

/**
 * Weekly habits, scored.
 *
 * They were previously left out of the week percentage entirely, which made the
 * Saturday talk — six points, the single highest-value habit — worth nothing
 * toward the score. Harmless while the score was decoration; not harmless now
 * that it gates the next phase.
 *
 * Available on the weekday named in `days` and only once it has elapsed, so an
 * unstarted Saturday does not depress Tuesday. Banked if ticked anywhere in the
 * week, since "once this week" is what weekly means.
 */
export function weeklyScore(
  all: HabitRow[], phase: number, days: string[], today: string,
  ticks: Map<string, Set<string>>,
): { available: number; banked: number } {
  let available = 0, banked = 0
  for (const h of all) {
    if (!h.active || !h.weekly || h.phase > phase) continue
    const due = days.filter((d) => d <= today && (!h.days || h.days.includes(dayOfWeek(d))))
    if (!due.length) continue
    available += h.points
    if (days.some((d) => ticks.get(d)?.has(h.id))) banked += h.points
  }
  return { available, banked }
}

// ------------------------------------------------------------- whole state

export async function getState(today = logicalDay()) {
  const [all, phase, started, xp, spent] = await Promise.all([
    allHabits(), currentPhase(today), startedOn(), lifetimePoints(), spentPoints(),
  ])
  const wk = weekStart(today)
  const [topic, mode, weekModes, staleHours, rung, inPhase, shelfLock] = await Promise.all([
    weekTopic(wk), modeFor(today), modesInWeek(wk), tickAgeHours(), currentRung(today),
    weeksInPhase(), shelfLockedUntil(today),
  ])

  const wkStart = weekStart(today)
  const days = weekDays(wkStart)
  const rows = await ticksBetween(addDays(wkStart, -1), days[6]!)

  const ticks = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!ticks.has(r.day)) ticks.set(r.day, new Set())
    ticks.get(r.day)!.add(r.habitId)
  }

  const todaysHabits = scheduledOn(all, today, phase)
  const doneToday = ticks.get(today) ?? new Set()

  const grid = all
    .filter((h) => h.active && !h.weekly)
    .map((h) => {
      const locked = h.phase > phase
      const cells = days.map((d): CellState => {
        if (locked) return 'locked'
        if (h.days && !h.days.includes(dayOfWeek(d))) return 'future'
        return cellFor(h.id, d, today, ticks)
      })
      const earned = cells.reduce((n, c) => (c === 'done' ? n + h.points : n), 0)
      return { habit: h, locked, cells, earned }
    })

  const wkly = weeklyScore(all, phase, days, today, ticks)
  const available = grid
    .filter((g) => !g.locked)
    .reduce((n, g) => n + g.cells.filter((c) => c !== 'locked' && c !== 'future').length * g.habit.points, 0)
    + wkly.available
  const banked = grid.reduce((n, g) => n + g.earned, 0) + wkly.banked

  const claimed = await db().select().from(claims)
  const claimedIds = new Set(claimed.map((c) => c.rewardId))
  const bank = xp - spent

  return {
    today,
    weekStart: wkStart,
    days,
    phase,
    topic,
    mode,
    modes: modeSpread(weekModes, MODES.map((m) => m.id)),
    projectLeft: projectModeLeft(weekModes),
    rung,
    weeksInPhase: inPhase,
    holdsLeft: holdsLeft(inPhase + 1),
    phaseGate: PHASE_GATE,
    shelfLockedUntil: shelfLock,
    staleHours,
    staleAfter: STALE_TICK_HOURS,
    startedOn: started,
    weekIndex: weekIndex(started, today),
    xp,
    bank,
    ...levelFor(xp),
    tasks: todaysHabits.map((h) => ({ ...h, done: doneToday.has(h.id) })),
    weekly: weeklyHabits(all, phase).map((h) => ({
      ...h,
      done: days.some((d) => ticks.get(d)?.has(h.id)),
    })),
    grid,
    week: {
      banked,
      available,
      target: Math.round(available * WEEK_TARGET),
      pct: available ? Math.round((banked / available) * 100) : 0,
      counts: available ? banked / available >= WEEK_TARGET : false,
    },
    rewards: REWARDS.map((r) => ({
      ...r,
      claimed: claimedIds.has(r.id),
      affordable: bank >= r.cost && !shelfLock,
    })),
  }
}

export type AppState = Awaited<ReturnType<typeof getState>>

// ------------------------------------------------------------------ claims

export async function claimReward(rewardId: string, today = logicalDay()) {
  const reward = REWARDS.find((r) => r.id === rewardId)
  if (!reward) throw new Error('unknown reward')

  const locked = await shelfLockedUntil(today)
  if (locked) return { ok: false as const, locked }

  const bank = (await lifetimePoints()) - (await spentPoints())
  if (bank < reward.cost) return { ok: false as const, short: reward.cost - bank }

  await db().insert(claims).values({ rewardId: reward.id, name: reward.name, cost: reward.cost })
  return { ok: true as const, reward }
}

// ------------------------------------------------------------------- notes

export async function saveNote(day: string, text: string) {
  const [happened = '', felt = '', tomorrow = ''] = text.split('\n').map((s) => s.trim())
  await db().insert(notes).values({ day, happened, felt, tomorrow })
    .onConflictDoUpdate({ target: notes.day, set: { happened, felt, tomorrow } })
}

// -------------------------------------------------------------- habit edit

export async function shrinkHabit(id: string, label: string, sub: string, points: number) {
  await db().update(habits).set({ label, sub, points }).where(eq(habits.id, id))
}

export async function pauseHabit(id: string) {
  await db().update(habits).set({ active: false }).where(eq(habits.id, id))
}

export async function habitsBySlot(slot: string, day: string) {
  const phase = await currentPhase(day)
  const all = await allHabits()
  return scheduledOn(all, day, phase).filter((h) => h.slot === slot)
}

// ------------------------------------------------------------------- mood

/**
 * The number is saved separately from the lines, and after them. Asking for
 * four things in one message means a skipped mood loses the whole note.
 */
export async function saveMood(day: string, mood: number) {
  await db().insert(notes).values({ day, mood })
    .onConflictDoUpdate({ target: notes.day, set: { mood } })
}

export async function moodsSince(from: string): Promise<{ day: string; mood: number }[]> {
  const rows = await db().select().from(notes).where(gte(notes.day, from))
  return rows.filter((r) => r.mood != null).map((r) => ({ day: r.day, mood: r.mood! }))
}

// ----------------------------------------------------------------- topics

/** Idempotent: inserts any topic from config that is not already in the table. */
export async function seedTopics(): Promise<number> {
  const existing = new Set((await db().select({ id: topics.id }).from(topics)).map((r) => r.id))
  const missing = ALL_TOPICS.filter((t) => !existing.has(t.id))
  for (let i = 0; i < missing.length; i += 200) {
    await db().insert(topics).values(missing.slice(i, i + 200)).onConflictDoNothing()
  }
  return missing.length
}

export type TopicRow = { id: string; domain: string; text: string }

/**
 * This week's topic, assigned on first ask and then fixed. The assignment is
 * recorded in settings as well as on the row so that asking twice in one week
 * returns the same topic — there are no re-rolls, and an accidental second read
 * must not become one.
 */
export async function weekTopic(wkStart: string, assign = false): Promise<TopicRow | null> {
  const key = `topic:${wkStart}`
  const existingId = await getSetting(key)
  if (existingId) {
    const [row] = await db().select().from(topics).where(eq(topics.id, existingId)).limit(1)
    if (row) return { id: row.id, domain: row.domain, text: row.text }
  }
  if (!assign) return null

  const pool = await db().select().from(topics)
  if (!pool.length) return null
  const used = new Set(pool.filter((r) => r.usedOn).map((r) => r.id))
  const chosen = pickTopic(pool.map((r) => ({ id: r.id, domain: r.domain, text: r.text })), used)
  if (!chosen) return null

  await db().update(topics).set({ usedOn: wkStart }).where(eq(topics.id, chosen.id))
  await setSetting(key, chosen.id)
  return chosen
}

/** Stage of the Saturday talk: 0 not started, 1 reading, 2 writing, 3 recorded. */
export async function talkStage(wkStart: string): Promise<number> {
  return Number((await getSetting(`talk_stage:${wkStart}`)) ?? '0')
}

export async function setTalkStage(wkStart: string, stage: number) {
  await setSetting(`talk_stage:${wkStart}`, String(stage))
}

// ------------------------------------------------------------------ modes

export async function setMode(day: string, mode: string) {
  await db().insert(modes).values({ day, mode })
    .onConflictDoUpdate({ target: modes.day, set: { mode } })
}

export async function modeFor(day: string): Promise<string | null> {
  const [row] = await db().select().from(modes).where(eq(modes.day, day)).limit(1)
  return row?.mode ?? null
}

export async function modesInWeek(wkStart: string): Promise<string[]> {
  const rows = await db().select().from(modes)
    .where(and(gte(modes.day, wkStart), lte(modes.day, addDays(wkStart, 6))))
  return rows.map((r) => r.mode)
}

// ------------------------------------------------------------- week valve

/**
 * Scores for the last `n` CLOSED weeks, oldest first.
 *
 * Only closed weeks: judging a week still in progress would trip the valve
 * every Tuesday, when half the points have not been available yet.
 */
export async function closedWeekPcts(today: string, n: number): Promise<number[]> {
  const started = await startedOn()
  const out: number[] = []
  for (let i = n; i >= 1; i--) {
    // Last day of the i-th week back: Sunday before this week's Monday, minus weeks.
    const end = addDays(weekStart(today), -1 - (i - 1) * 7)
    if (weekStart(end) < weekStart(started)) continue
    out.push(await weekPct(end))
  }
  return out
}

/** Banked share of available points for the week containing `day`. */
async function weekPct(day: string): Promise<number> {
  const [all, phase] = await Promise.all([allHabits(), currentPhase(day)])
  const wkStart = weekStart(day)
  const days = weekDays(wkStart)
  const rows = await ticksBetween(addDays(wkStart, -1), days[6]!)

  const ticks = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!ticks.has(r.day)) ticks.set(r.day, new Set())
    ticks.get(r.day)!.add(r.habitId)
  }

  let banked = 0, available = 0
  for (const h of all) {
    if (!h.active || h.weekly || h.phase > phase) continue
    for (const d of days) {
      if (d > day) continue
      if (h.days && !h.days.includes(dayOfWeek(d))) continue
      available += h.points
      if (ticks.get(d)?.has(h.id)) banked += h.points
    }
  }
  const wkly = weeklyScore(all, phase, days, day, ticks)
  available += wkly.available
  banked += wkly.banked
  return available ? Math.round((banked / available) * 100) : 100
}

// ----------------------------------------------------------------- ladder

/**
 * Every past attempt at the social rung, oldest first: true if it was ticked.
 * Derived from check-ins rather than stored, so it cannot drift out of step
 * with what actually happened.
 */
export async function ladderResults(today: string): Promise<boolean[]> {
  const [row] = await db().select().from(habits).where(eq(habits.id, 'rung')).limit(1)
  if (!row) return []
  const days: number[] = row.days ? JSON.parse(row.days) : [2, 4]
  const started = await startedOn()
  const done = new Set((await db().select().from(checkins)
    .where(eq(checkins.habitId, 'rung'))).map((r) => r.day))

  const out: boolean[] = []
  for (let d = started; d < today; d = addDays(d, 1)) {
    if (!days.includes(dayOfWeek(d))) continue
    out.push(done.has(d))
  }
  return out
}

export async function currentRung(today: string): Promise<number> {
  return ladderRung(await ladderResults(today))
}

// ------------------------------------------------------------- heartbeat

/**
 * The scheduler is a third party (cron-job.org) with no alarm of its own. If it
 * silently stops, the bot goes quiet and silence reads as your own lapse rather
 * than as an outage. Every tick stamps this; the website warns when it is old.
 */
export async function markTick() {
  await setSetting('last_tick', new Date().toISOString())
}

export async function tickAgeHours(): Promise<number | null> {
  const raw = await getSetting('last_tick')
  if (!raw) return null
  const age = (Date.now() - new Date(raw).getTime()) / 3600000
  return Math.round(age * 10) / 10
}

export { HABITS, MODES, REWARDS, STALE_TICK_HOURS, inArray }
