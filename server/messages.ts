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
import type { HabitRow, TopicRow } from './store.js'
import type { Button } from './telegram.js'
import { LADDER, MODES, PHASE_GATE, PHASE_MAX_WEEKS, TALK, WEEK_TARGET } from './config.js'
import { rungText } from './plan.js'
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

  const rows: Button[][] = list.map((h) => [tickBtn(h, state.today)])

  // The first hour needs a declared mode before it needs a tick.
  if (list.some((h) => h.id === 'mine') && !state.mode) {
    rows.unshift(...MODES.map((m) => [{
      text: m.id === 'project' && state.projectLeft === 0 ? `${m.label} · used up` : m.label,
      data: m.id === 'project' && state.projectLeft === 0 ? 'noop' : `mode:${m.id}`,
    }]))
  }

  return { text: `<b>${esc(head)}</b>${tail}`, rows }
}

/** The declared mode, and the one line that says what it means. */
export function modeSet(modeId: string, projectLeft: number) {
  const m = MODES.find((x) => x.id === modeId)
  if (!m) return 'Noted.'
  const tail = modeId === 'project'
    ? `\n\n<i>${projectLeft} project morning${projectLeft === 1 ? '' : 's'} left this week.</i>`
    : ''
  return [`<b>${esc(m.label)}.</b>`, '', esc(m.prompt), tail].join('\n')
}

/**
 * Fires at 12:15, half an hour BEFORE the target lunch. Reminding you at 12:45
 * would be useless — by then the ordering decision has already been made badly.
 */
export function lunch(state: AppState, list: HabitRow[]) {
  if (!list.length) return null
  return {
    text: [
      '<b>Order lunch now.</b>',
      '',
      'Not at 2. Protein and veg first, rice last.',
    ].join('\n'),
    rows: [...list.map((h) => [tickBtn(h, state.today)]), [{ text: 'Already sorted', data: 'noop' }]],
  }
}

export function midday(state: AppState, list: HabitRow[]) {
  if (!list.length) return null
  return {
    text: `<b>Ten minutes outside after eating.</b> Best single fix for the slump.`,
    rows: [...list.map((h) => [tickBtn(h, state.today)]), [{ text: 'Not today', data: 'noop' }]],
  }
}

/** 21:00 — the highest-value habit in the day gets its own push. */
export function draw(state: AppState, list: HabitRow[]) {
  if (!list.length) return null
  const drawing = list.find((h) => h.id === 'draw')
  return {
    text: drawing
      ? ['<b>Drawing block.</b>', '', 'No outcome, nothing to post. Screens off, music on.'].join('\n')
      : '<b>Evening.</b> Anything to tick?',
    rows: [...list.map((h) => [tickBtn(h, state.today)]), [{ text: 'Skip tonight', data: 'noop' }]],
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

/**
 * The week's result and its consequences, stated as facts.
 *
 * The house rule at the top of this file still holds: no disappointment, no
 * zeroing out. A cost is not a scolding — say what happened and what follows,
 * then stop. Every sentence here should be readable at 07:00 without flinching.
 */
export function weekClosed(state: AppState, held: { advance: boolean; reason: string; from: number; holds: number }) {
  const lines = [
    state.week.counts
      ? `<b>Week ${state.weekIndex + 1} counts.</b> ${state.week.banked}/${state.week.available} — ${state.week.pct}%.`
      : `<b>Week ${state.weekIndex + 1}: ${state.week.pct}%.</b> ${state.week.banked}/${state.week.available}, against ${Math.round(WEEK_TARGET * 100)}%.`,
  ]

  if (!state.week.counts) {
    lines.push('', `The shelf is locked until Sunday. Points still bank — you just cannot spend them this week.`)
  }

  if (held.advance && held.reason === 'earned') {
    lines.push('', `Phase ${held.from} cleared at the gate. Phase ${held.from + 1} opens today.`)
  } else if (held.advance && held.reason === 'elapsed') {
    lines.push('', `Third week in phase ${held.from}, so it opens anyway. That was always the deal — the gate can hold you back, it cannot strand you.`)
  } else {
    lines.push(
      '',
      `<b>Phase ${held.from} stays.</b> The gate is ${Math.round(PHASE_GATE * 100)}% and this week came in under it.`,
      held.holds === 1
        ? 'One more held week and it opens regardless.'
        : `${held.holds} held weeks left before it opens regardless.`,
      '',
      'Same habits, one more run at them. Nothing new arrives on top.',
    )
  }

  return lines.join('\n')
}

export function shelfLocked(until: string) {
  return [
    `<b>Shelf locked until ${esc(prettyDay(until))}.</b>`,
    '',
    `Last week came in under ${Math.round(WEEK_TARGET * 100)}%. Points keep banking; spending resumes Monday.`,
  ].join('\n')
}

export function phaseUnlocked(phase: number, names: string[]) {
  const titles: Record<number, string> = {
    2: 'The clock, and her', 3: 'The body, and the voice', 4: 'The world',
  }
  return [
    `<b>Phase ${phase} — ${titles[phase] ?? ''}.</b>`,
    '',
    'New habits unlocked:',
    ...names.map((n) => `· ${esc(n)}`),
    '',
    'Keep the old ones running. These are additions, not replacements.',
    '',
    `<i>Earned it, or ran out of holds — either way it is open. ${PHASE_MAX_WEEKS} weeks maximum per phase.</i>`,
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

/**
 * Asked after the lines are saved, never as a fourth line. `felt` is prose and
 * prose is not a series; this is the number you will actually plot in week ten.
 */
export function moodPrompt(day: string) {
  return {
    text: ['<b>One number.</b> Today, overall.', '', '<i>1 flat · 3 ordinary · 5 genuinely good</i>'].join('\n'),
    rows: [[1, 2, 3, 4, 5].map((n) => ({ text: String(n), data: `mood:${day}:${n}` }))] as Button[][],
  }
}

export function moodSaved(n: number) {
  return `${n} logged. Nothing to do about it — it is just on the record now.`
}

export function status(state: AppState) {
  const bar = (pct: number) => '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))
  const gate = Math.round(state.phaseGate * 100)
  return [
    `<b>Level ${state.level}</b> · ${state.into}/${state.per} XP`,
    `${bar(Math.round((state.into / state.per) * 100))}`,
    '',
    `Week ${state.weekIndex + 1} · Phase ${state.phase}`,
    `${state.week.banked}/${state.week.available} points — ${state.week.pct}%`,
    `${Math.round(WEEK_TARGET * 100)}% and the week counts · ${gate}% and phase ${Math.min(4, state.phase + 1)} opens`,
    state.phase < 4
      ? `Week ${state.weeksInPhase + 1} of phase ${state.phase} · ${state.holdsLeft} hold${state.holdsLeft === 1 ? '' : 's'} left`
      : 'Phase 4 — everything is open.',
    '',
    state.shelfLockedUntil
      ? `<b>${state.bank}</b> points banked · shelf locked until ${esc(prettyDay(state.shelfLockedUntil))}`
      : `<b>${state.bank}</b> points to spend`,
  ].join('\n')
}

export function shelf(state: AppState) {
  if (state.shelfLockedUntil) return { text: shelfLocked(state.shelfLockedUntil), rows: [] as Button[][] }
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

// ------------------------------------------------------- the Saturday talk

/**
 * Stage 1 of three. Ten minutes of reading, and explicitly nothing written yet —
 * transcribing while reading feels productive and trains nothing.
 *
 * There is no timer here and there cannot be: serverless has no way to wake
 * itself up in ten minutes without another cron. The stages advance on button
 * taps instead, which is better anyway — each tap is a commitment, and the whole
 * thing works whenever you actually start rather than only at 11:00.
 */
export function talkStart(topic: TopicRow) {
  return {
    text: [
      '<b>Saturday. Here is the topic.</b>',
      '',
      `<b>${esc(topic.text)}</b>`,
      `<i>${esc(topic.domain)}</i>`,
      '',
      `<b>Stage 1 — ${TALK.readMinutes} minutes, screen on.</b>`,
      'Read. Two or three sources. Websites are fine.',
      '',
      '<b>No AI. Not at any stage.</b> No model, no summariser, no explain-it-simply.',
      'The struggle is the whole point — it is the exact thing that got automated',
      'out of the rest of your week.',
      '',
      'Write nothing yet. Set a timer and tap when the ten minutes are up.',
    ].join('\n'),
    rows: [[{ text: `Read for ${TALK.readMinutes} min — done`, data: 'talk:1' }]] as Button[][],
  }
}

export function talkWrite(topic: TopicRow) {
  return {
    text: [
      '<b>Close the tabs. All of them.</b>',
      '',
      `<b>Stage 2 — ${TALK.writeMinutes} minutes, screen off.</b>`,
      `Now write, by hand, in ${esc(TALK.notebook)}.`,
      '',
      '<b>From memory only.</b> Not a transcript — a reconstruction. What you cannot',
      'remember is the part you did not actually learn, and finding that out is',
      'the point of doing it this way round.',
      '',
      `<i>${esc(topic.text)}</i>`,
    ].join('\n'),
    rows: [[{ text: 'Notes written', data: 'talk:2' }]] as Button[][],
  }
}

export function talkSpeak(topic: TopicRow) {
  return {
    text: [
      '<b>Now say it.</b>',
      '',
      `<b>Stage 3 — ${TALK.speakMinutes} minutes minimum, one take.</b>`,
      'From your notes, to camera. A second take makes it a reading exercise.',
      '',
      'Save it dated, in order, with the others. Nothing posted, nothing deleted —',
      'in three months you will want to watch week one and hear the difference.',
      '',
      `<i>${esc(topic.text)}</i>`,
      '',
      'Ten minutes of reading gives you a shallow two minutes. That is correct.',
      'The skill is being fluent on thin material, not being an expert.',
    ].join('\n'),
    rows: [[{ text: 'Recorded — tick it', data: 'talk:3' }]] as Button[][],
  }
}

/**
 * The talk is a weekly habit, so it never appears in a daily list — which means
 * the only place it can be ticked is here, at the end of its own flow.
 */
export function talkDone(day: string) {
  return {
    text: [
      '<b>On the record.</b>',
      '',
      'Notebook closed, video saved, one line typed from memory. That is the whole loop.',
    ].join('\n'),
    rows: [[{ text: 'Tick the talk · 6', data: `t:talk:${day}` }]] as Button[][],
  }
}

export const talkLine = [
  '<b>One line.</b> The single most interesting thing you learned.',
  '',
  '<i>Typed from memory, notebook closed. Second recall test of the day.</i>',
].join('\n')

// ------------------------------------------------------------- week valve

/**
 * The aggregate relief valve. missedTwice() only sees one habit missed on two
 * consecutive days, so it is blind to the likelier failure: everything at 65%,
 * scattered, nothing ever missed twice, nothing ever offered, the plan rotting
 * politely. Same rules as every other push — offer smaller, never harder.
 */
export function weekValve(pcts: number[], candidates: HabitRow[]) {
  return {
    text: [
      `<b>Two weeks under the line.</b> ${pcts.map((p) => `${p}%`).join(' then ')}.`,
      '',
      'Not a verdict — a load reading. Nothing here was missed twice in a row, which',
      'means nothing is broken; there is just more of it than fits in your week.',
      '',
      'Drop the cheapest things until it fits. They come back with /habits.',
    ].join('\n'),
    rows: [
      ...candidates.map((h) => [{ text: `Pause ${h.label} · ${h.points}`, data: `pause:${h.id}` }]),
      [{ text: 'Leave it, the load is fine', data: 'noop' }],
    ] as Button[][],
  }
}

// ----------------------------------------------------------------- ladder

export function ladder(rung: number) {
  return [
    `<b>Rung ${rung} of ${LADDER.length}.</b>`,
    '',
    `<b>${esc(rungText(rung))}</b>`,
    '',
    ...LADDER.map((l, i) => {
      const n = i + 1
      const mark = n < rung ? '·' : n === rung ? '→' : ' '
      return `${mark} ${n}. ${esc(l)}`
    }),
    '',
    '<i>Three clears move you up. Two misses move you down one. Rung 1 is the floor.</i>',
  ].join('\n')
}

export const help = [
  '<b>The Daily Page</b>',
  '',
  '/today — today\'s list',
  '/week — the grid',
  '/status — level, points, week',
  '/rewards — spend points',
  '/note — the three lines, then the number',
  '/proof — pick a task, then send the file',
  '/habits — pause or restore habits',
  '/topic — this week\'s talk, and where you are in it',
  '/ladder — the social rungs',
  '/mode — set or change the first hour',
  '',
  'Pushes: the morning list, a nudge before lunch, one after, the drawing block,',
  'and the wrap after midnight. Silence the rest of the time.',
].join('\n')

// ------------------------------------------------------------------ journal

const KIND_WORD: Record<string, string> = {
  photo: 'Photo', video: 'Video', voice: 'Voice note',
  audio: 'Audio', file: 'File',
}

/**
 * Said the moment a file lands. Deliberately flat: the artifact is the reward,
 * and celebrating here would be celebrating an upload rather than the work.
 */
export function captured(kind: string): string {
  const word = KIND_WORD[kind] ?? 'Saved'
  return [`<b>${word} saved.</b>`, '', 'What was it for?'].join('\n')
}

export function attached(label: string | null): string {
  return label ? `Filed against <b>${esc(label)}</b>.` : 'Filed under today.'
}

/**
 * The proof gate. It refuses and then says exactly what clears it — a refusal
 * with no route forward is just a wall.
 */
export function needsProof(label: string): string {
  return [
    `<b>${esc(label)}</b> needs something attached first.`,
    '',
    'Send the video, a photo of the page, or a screenshot — then tick it. This is '
    + 'the one habit that is worth nothing as a tick and everything as a record.',
  ].join('\n')
}

/**
 * Duolingo's one transferable insight: forgiveness that has to be claimed never
 * reaches the person who needed it, because someone who missed a day is not
 * opening the app. So the cover is applied silently at the time, and reported
 * afterwards — here, at the week close, when it is news rather than pressure.
 */
export function covered(labels: string[]): string | null {
  if (!labels.length) return null
  const list = labels.map((l) => esc(l)).join(', ')
  return labels.length === 1
    ? `One miss was covered this week: <b>${list}</b>. Nothing lost.`
    : `Misses covered this week: <b>${list}</b>. Nothing lost.`
}

/** /proof — choose the task before sending the file. */
export const pickTask = [
  '<b>What are you filing proof for?</b>',
  '',
  'Pick one, then send the photo, video or screenshot. It lands attached.',
].join('\n')

export function armed(label: string): string {
  return [
    `<b>${esc(label)}</b> — send it now.`,
    '',
    'Photo, video, voice note or file. The next thing you send gets attached to this.',
  ].join('\n')
}

export function attachedTo(kind: string, label: string): string {
  const word = (KIND_WORD[kind] ?? 'File').toLowerCase()
  return `Filed that ${word} against <b>${esc(label)}</b>.`
}
