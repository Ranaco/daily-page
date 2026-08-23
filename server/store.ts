import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { db, schema } from './db/client.js'
import { HABITS, REWARDS, WEEK_TARGET, XP_PER_LEVEL, phaseForWeek } from './config.js'
import { addDays, dayOfWeek, logicalDay, weekDays, weekIndex, weekStart } from './time.js'

const { habits, checkins, claims, notes, settings } = schema

export type CellState = 'done' | 'forgiven' | 'miss' | 'future' | 'locked'

export type HabitRow = {
  id: string; phase: number; time: string; slot: string
  label: string; sub: string; points: number
  spine: boolean; weekly: boolean; days: number[] | null
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

export async function currentPhase(day = logicalDay()): Promise<1 | 2 | 3 | 4> {
  const forced = await getSetting('phase_override')
  if (forced) return Number(forced) as 1 | 2 | 3 | 4
  return phaseForWeek(weekIndex(await startedOn(), day))
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
    return { done: false, delta: -existing.points, habit: h }
  }
  await db().insert(checkins).values({ habitId, day, points: h.points })
  return { done: true, delta: h.points, habit: h }
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

// ------------------------------------------------------------- whole state

export async function getState(today = logicalDay()) {
  const [all, phase, started, xp, spent] = await Promise.all([
    allHabits(), currentPhase(today), startedOn(), lifetimePoints(), spentPoints(),
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

  const available = grid
    .filter((g) => !g.locked)
    .reduce((n, g) => n + g.cells.filter((c) => c !== 'locked' && c !== 'future').length * g.habit.points, 0)
  const banked = grid.reduce((n, g) => n + g.earned, 0)

  const claimed = await db().select().from(claims)
  const claimedIds = new Set(claimed.map((c) => c.rewardId))
  const bank = xp - spent

  return {
    today,
    weekStart: wkStart,
    days,
    phase,
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
    rewards: REWARDS.map((r) => ({ ...r, claimed: claimedIds.has(r.id), affordable: bank >= r.cost })),
  }
}

export type AppState = Awaited<ReturnType<typeof getState>>

// ------------------------------------------------------------------ claims

export async function claimReward(rewardId: string) {
  const reward = REWARDS.find((r) => r.id === rewardId)
  if (!reward) throw new Error('unknown reward')
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

export { HABITS, REWARDS, inArray }
