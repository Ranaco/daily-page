/**
 * The pure decision logic. No database, no Telegram, no clock — everything in
 * here is a function of its arguments, which is why it is the part with tests.
 */

import {
  LADDER, LADDER_DOWN_AFTER, LADDER_UP_AFTER, PHASE_GATE, PHASE_MAX_WEEKS,
  PROJECT_MODE_CAP, WEEK_TARGET, WEEK_VALVE_AFTER,
} from './config.js'
import type { Topic } from './config.js'

/**
 * Pick the next topic. Unused ones first; if the pool is exhausted, start over
 * with the whole pool rather than refusing — eight weeks of this outlasts a
 * hundred and fifty topics eventually.
 *
 * `rand` is injected so the choice is testable. There is no re-roll anywhere in
 * the system, deliberately.
 */
export function pickTopic(
  pool: Topic[], usedIds: Set<string>, rand: () => number = Math.random,
): Topic | null {
  if (!pool.length) return null
  const fresh = pool.filter((t) => !usedIds.has(t.id))
  const from = fresh.length ? fresh : pool
  return from[Math.floor(rand() * from.length)] ?? null
}

/**
 * Weeks, oldest first, that came in under target. Only closed weeks are passed
 * in — judging a week that is still running would fire the valve every Tuesday.
 */
export function underTargetRun(pcts: number[]): number {
  let run = 0
  for (let i = pcts.length - 1; i >= 0; i--) {
    if (pcts[i]! >= WEEK_TARGET * 100) break
    run++
  }
  return run
}

export function weekValveTripped(pcts: number[]): boolean {
  return underTargetRun(pcts) >= WEEK_VALVE_AFTER
}

/**
 * What the week valve offers to drop: the cheapest non-spine habits first.
 *
 * Spine habits are never offered — they are the ones the whole plan is built
 * around, and a week where the spine is the problem is a week to shrink the
 * spine by hand, not by button. Weekly habits are excluded too; missing a
 * Saturday is not a load problem.
 */
export function valveCandidates<T extends { points: number; spine: boolean; weekly: boolean; active: boolean; phase: number }>(
  habits: T[], phase: number, limit = 3,
): T[] {
  return habits
    .filter((h) => h.active && !h.spine && !h.weekly && h.phase <= phase)
    .sort((a, b) => a.points - b.points)
    .slice(0, limit)
}

/**
 * Whether the closing week opens the next phase, and why.
 *
 * `earned` — the week cleared PHASE_GATE.
 * `elapsed` — held back the maximum number of times; it opens anyway.
 * `held` — under the gate, with holds left.
 *
 * `weeksInPhase` counts the week that just closed, so it is 1 on the first
 * rollover after a phase opens.
 */
export type Advance = { advance: boolean; reason: 'earned' | 'elapsed' | 'held' }

export function shouldAdvance(pct: number, weeksInPhase: number): Advance {
  if (pct >= PHASE_GATE * 100) return { advance: true, reason: 'earned' }
  if (weeksInPhase >= PHASE_MAX_WEEKS) return { advance: true, reason: 'elapsed' }
  return { advance: false, reason: 'held' }
}

/** Holds left in this phase before it opens regardless. */
export function holdsLeft(weeksInPhase: number): number {
  return Math.max(0, PHASE_MAX_WEEKS - weeksInPhase)
}

/**
 * Whether the closing week locks the shelf for the next one. Uses WEEK_TARGET,
 * not PHASE_GATE — a week can open the next phase and still not have counted.
 */
export function shelfLocks(pct: number): boolean {
  return pct < WEEK_TARGET * 100
}

/**
 * Whether the project mode is still available this week. Counts declared modes
 * in the current week only; the cap exists because "personal project" is the
 * mode most likely to quietly become unpaid work.
 */
export function projectModeLeft(modesThisWeek: string[]): number {
  const used = modesThisWeek.filter((m) => m === 'project').length
  return Math.max(0, PROJECT_MODE_CAP - used)
}

/** Modes declared this week, counted. Unused modes are worth seeing as zeroes. */
export function modeSpread(modesThisWeek: string[], all: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of all) out[id] = 0
  for (const m of modesThisWeek) if (m in out) out[m] = out[m]! + 1
  return out
}

/**
 * Where the social ladder stands, from the history of attempts.
 *
 * Three clears in a row move up, two misses in a row move down one, and rung 1
 * is the floor. Computed from history rather than stored so it can never drift
 * out of step with what actually happened.
 */
export function ladderRung(results: boolean[]): number {
  let rung = 1
  let clears = 0
  let misses = 0
  for (const ok of results) {
    if (ok) {
      misses = 0
      clears++
      if (clears >= LADDER_UP_AFTER) { rung = Math.min(LADDER.length, rung + 1); clears = 0 }
    } else {
      clears = 0
      misses++
      if (misses >= LADDER_DOWN_AFTER) { rung = Math.max(1, rung - 1); misses = 0 }
    }
  }
  return rung
}

export function rungText(rung: number): string {
  return LADDER[Math.min(LADDER.length, Math.max(1, rung)) - 1] ?? LADDER[0]!
}
