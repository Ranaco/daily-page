/**
 * Every string the bot can say lives here.
 *
 * House rules for this file, and they are load-bearing:
 *   - Never express disappointment. Shame is the fastest route to a muted bot.
 *   - Never reset anything to zero for a single bad day.
 *   - Offer to make a habit smaller before ever suggesting trying harder.
 *   - No question needs typing. Buttons for everything except the three lines.
 */

import type { AppState } from './store.js'
import type { HabitRow } from './store.js'
import type { Button } from './telegram.js'
import { esc } from './telegram.js'
import { prettyDay } from './time.js'

const tickBtn = (h: HabitRow, day: string): Button => ({
  text: `${h.label} · ${h.points}`,
  data: `t:${h.id}:${day}`,
})

export function morning(state: AppState, list: HabitRow[]) {
  const n = list.length
  const head =
    state.weekIndex === 0 && state.phase === 1
      ? `Morning. Phase one — ${n} things, and nothing else.`
      : `Morning. ${n} ${n === 1 ? 'thing' : 'things'} today.`

  const streak = state.week.pct
  const tail = streak >= 80
    ? `\n\nWeek's at ${streak}% so far. It counts at 80.`
    : ''

  return {
    text: `<b>${esc(head)}</b>${tail}`,
    rows: list.map((h) => [tickBtn(h, state.today)]),
  }
}

export function midday(state: AppState, list: HabitRow[]) {
  if (!list.length) return null
  return {
    text: `<b>Midday.</b> Anything to tick?`,
    rows: [...list.map((h) => [tickBtn(h, state.today)]), [{ text: 'Nothing right now', data: 'noop' }]],
  }
}

export function evening(state: AppState, remaining: HabitRow[]) {
  const lines = [
    `<b>Wrap-up.</b> ${esc(prettyDay(state.today))}`,
    '',
    remaining.length
      ? 'Tick what actually happened:'
      : 'Everything is already ticked. Good day.',
  ]
  const rows = remaining.map((h) => [tickBtn(h, state.today)])
  rows.push([{ text: '📝 Three lines', data: `note:${state.today}` }])
  return { text: lines.join('\n'), rows }
}

/** Instant response to a tick. This is the whole dopamine loop. */
export function ticked(h: HabitRow, state: AppState, done: boolean) {
  if (!done) return `Un-ticked <b>${esc(h.label)}</b>. −${h.points}.`

  const bits = [`<b>+${h.points}.</b>`]
  if (h.spine) bits.push("That's a spine habit.")
  const left = state.tasks.filter((t) => !t.done).length
  bits.push(left === 0 ? 'Everything done today.' : `${left} left today.`)
  bits.push(`Week ${state.week.banked}/${state.week.available} — ${state.week.pct}%.`)
  return bits.join(' ')
}

export function levelUp(level: number) {
  return `<b>Level ${level}.</b> That's ${level * 100} points of days that mostly felt like nothing. They added up anyway.`
}

export function weekClosed(state: AppState) {
  return state.week.counts
    ? `<b>Week ${state.weekIndex + 1} counts.</b> ${state.week.banked}/${state.week.available} — ${state.week.pct}%.`
    : `Week ${state.weekIndex + 1} came in at ${state.week.pct}%. Under the line, and that's all it is — the next one starts clean.`
}

export function phaseUnlocked(phase: number, names: string[]) {
  const titles: Record<number, string> = {
    2: 'The body', 3: 'The mind', 4: 'The world',
  }
  return [
    `<b>Phase ${phase} — ${titles[phase] ?? ''}.</b>`,
    '',
    'New habits unlocked:',
    ...names.map((n) => `· ${esc(n)}`),
    '',
    'Keep the old ones running. These are additions, not replacements.',
  ].join('\n')
}

/** The only message that ever pushes back. */
export function missedTwice(h: HabitRow) {
  return {
    text: [
      `Second miss in a row on <b>${esc(h.label)}</b>.`,
      '',
      'Not a problem yet — but two is the line. A smaller version you actually keep beats the full one you abandon.',
    ].join('\n'),
    rows: [
      [{ text: 'Halve it for a week', data: `shrink:${h.id}` }],
      [{ text: "Keep it, I'll do it", data: 'noop' }],
      [{ text: 'Pause this habit', data: `pause:${h.id}` }],
    ] as Button[][],
  }
}

export function shrunk(h: HabitRow) {
  return `<b>${esc(h.label)}</b> halved for now. Worth ${h.points} points. Put it back whenever you want with /habits.`
}

export function paused(h: HabitRow) {
  return `<b>${esc(h.label)}</b> paused. It stops appearing and stops counting against the week. /habits to bring it back.`
}

export const notePrompt = [
  '<b>Three lines.</b> Send them in one message:',
  '',
  '1 · What actually happened today',
  '2 · What you felt, and where in your body',
  '3 · One thing you\'ll do tomorrow',
  '',
  '<i>"Nothing" is a valid answer to line two. It changes over the weeks.</i>',
].join('\n')

export function noteSaved(day: string) {
  return `Logged for ${esc(prettyDay(day))}.`
}

export function status(state: AppState) {
  const bar = (pct: number) => '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))
  return [
    `<b>Level ${state.level}</b> · ${state.into}/${state.per} XP`,
    `${bar(Math.round((state.into / state.per) * 100))}`,
    '',
    `Week ${state.weekIndex + 1} · Phase ${state.phase}`,
    `${state.week.banked}/${state.week.available} points — ${state.week.pct}% (counts at 80%)`,
    '',
    `<b>${state.bank}</b> points to spend`,
  ].join('\n')
}

export function shelf(state: AppState) {
  const rows: Button[][] = state.rewards
    .filter((r) => !r.claimed)
    .map((r) => [{
      text: r.affordable ? `✅ ${r.name} · ${r.cost}` : `${r.name} · ${r.cost - state.bank} to go`,
      data: r.affordable ? `claim:${r.id}` : 'noop',
    }])
  return { text: `<b>${state.bank} points to spend.</b>`, rows }
}

export function claimed(name: string, left: number) {
  return `<b>Claimed: ${esc(name)}.</b> ${left} points left.\n\nGo and actually take it. An unclaimed reward teaches you the points are fake.`
}

export const help = [
  '<b>The Daily Page</b>',
  '',
  '/today — today\'s list',
  '/week — the grid',
  '/status — level, points, week',
  '/rewards — spend points',
  '/note — the three lines',
  '/habits — pause or restore habits',
  '',
  'Three pushes a day: morning list, midday nudge, evening wrap. Nothing else.',
].join('\n')
