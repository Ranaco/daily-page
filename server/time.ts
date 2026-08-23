/**
 * All dates in this app are "logical days" in APP_TZ.
 *
 * A logical day starts at 04:00 local, not midnight. That is the whole point:
 * lights-out at 1:00am belongs to the day that just ended, and the evening
 * wrap-up message fires after midnight but is asking about yesterday.
 */

const TZ = process.env.APP_TZ || 'Asia/Kolkata'
const DAY_STARTS_AT_HOUR = 4

/** Wall-clock parts in APP_TZ for a given instant. */
export function parts(at: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(at)) map[p.type] = p.value
  return {
    year: Number(map.year), month: Number(map.month), day: Number(map.day),
    hour: Number(map.hour === '24' ? '0' : map.hour), minute: Number(map.minute),
  }
}

/** ISO date (YYYY-MM-DD) of the logical day containing `at`. */
export function logicalDay(at: Date = new Date()): string {
  const p = parts(at)
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day))
  if (p.hour < DAY_STARTS_AT_HOUR) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 0 = Sun … 6 = Sat */
export function dayOfWeek(iso: string): number {
  return new Date(iso + 'T00:00:00Z').getUTCDay()
}

/** Monday-anchored week start for a logical day. */
export function weekStart(iso: string): string {
  const dow = dayOfWeek(iso)
  return addDays(iso, dow === 0 ? -6 : 1 - dow)
}

export function weekDays(startIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startIso, i))
}

/**
 * Whole weeks elapsed since the plan started. Week 0 is the first week.
 *
 * Counted in ACTUAL DAYS from the start date, not between Monday boundaries.
 * The boundary version back-dated the plan: starting on a Sunday snapped the
 * start to the Monday six days earlier, so the next 4am rollover jumped
 * straight to week 2 and unlocked a phase that had never been lived.
 * The grid still runs Monday-to-Sunday; only the phase clock is decoupled.
 */
export function weekIndex(startedOn: string, today: string): number {
  const a = new Date(startedOn + 'T00:00:00Z').getTime()
  const b = new Date(today + 'T00:00:00Z').getTime()
  return Math.max(0, Math.floor((b - a) / 86400000 / 7))
}

export function prettyDay(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}
