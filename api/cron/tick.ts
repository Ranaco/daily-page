import type { VercelRequest, VercelResponse } from '@vercel/node'
import * as M from '../../server/messages.js'
import { send } from '../../server/telegram.js'
import { WEEK_VALVE_AFTER } from '../../server/config.js'
import { valveCandidates, weekValveTripped } from '../../server/plan.js'
import { addDays, dayOfWeek, logicalDay, weekStart } from '../../server/time.js'
import {
  advancePhase, allHabits, closedWeekPcts, currentPhase, getSetting, getState,
  habitsBySlot, lockShelfFor, markTick, missedTwice, setSetting, talkStage, weekTopic,
} from '../../server/store.js'

export const config = { maxDuration: 30 }

/**
 * One endpoint for all three daily pushes: /api/cron/tick?slot=morning&key=…
 *
 * Vercel's Hobby plan allows two cron jobs at once-a-day granularity, which
 * is why vercel.json only registers morning and evening. Point a free
 * external scheduler at all three if you want exact times — see the README.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = (req.query.key as string) ?? ''
  const auth = req.headers.authorization ?? ''
  const fromVercelCron = auth === `Bearer ${process.env.CRON_SECRET ?? ''}` && !!process.env.CRON_SECRET
  if (key !== process.env.APP_SECRET && !fromVercelCron) {
    return res.status(401).json({ error: 'bad key' })
  }

  const slot = (req.query.slot as string) ?? 'morning'
  const today = logicalDay()

  try {
    await markTick()
    if (slot === 'morning') await morning(today)
    else if (slot === 'lunch') await nudge(today, 'lunch', M.lunch)
    else if (slot === 'midday') await nudge(today, 'midday', M.midday)
    else if (slot === 'draw') await nudge(today, 'draw', M.draw)
    else if (slot === 'wrap' || slot === 'evening') await wrap(today)
    else return res.status(400).json({ error: `unknown slot: ${slot}` })
    return res.status(200).json({ ok: true, slot, day: today })
  } catch (err) {
    console.error('cron failed', err)
    return res.status(500).json({ error: String(err) })
  }
}

/**
 * The shape every mid-day push shares: take the habits due in this slot, drop
 * the ones already ticked, and stay silent if nothing is left. Silence matters
 * more than the reminder — a bot that pings when there is nothing to do is the
 * one that gets muted.
 */
async function nudge(
  today: string,
  slot: string,
  build: (s: Awaited<ReturnType<typeof getState>>, list: any[]) => { text: string; rows: any[] } | null,
) {
  const state = await getState(today)
  const due = (await habitsBySlot(slot, today)).filter(
    (h) => !state.tasks.find((t) => t.id === h.id)?.done,
  )
  const msg = build(state, due)
  if (msg) await send(msg.text, msg.rows)
}

async function morning(today: string) {
  await announceWeekAndPhase(today)
  await maybeStartTalk(today)

  const state = await getState(today)
  const due = (await habitsBySlot('morning', today)).filter(
    (h) => !state.tasks.find((t) => t.id === h.id)?.done,
  )
  if (due.length) {
    const { text, rows } = M.morning(state, due)
    await send(text, rows)
  }

  // The one message that ever pushes back — and only ever with an offer.
  for (const h of await missedTwice(today)) {
    const { text, rows } = M.missedTwice(h)
    await send(text, rows)
  }
}

/**
 * Saturday's topic is handed out from the morning push rather than its own cron
 * job — one fewer thing to wire at the scheduler, and the stages then advance on
 * button taps, so the whole thing works whenever you start rather than only at
 * the minute a cron fires.
 */
async function maybeStartTalk(today: string) {
  if (dayOfWeek(today) !== 6) return
  const wk = weekStart(today)
  const row = (await allHabits()).find((h) => h.id === 'talk')
  if (!row?.active || row.phase > (await currentPhase(today))) return
  if ((await talkStage(wk)) > 0) return

  const topic = await weekTopic(wk, true)
  if (!topic) return
  const { text, rows } = M.talkStart(topic)
  await send(text, rows)
}

async function wrap(today: string) {
  const state = await getState(today)
  const remaining = state.tasks.filter((t) => !t.done)
  const { text, rows } = M.evening(state, remaining as any)
  await send(text, rows)
}

/**
 * The aggregate valve, checked once at week rollover. Two closed weeks under
 * target and the bot offers to shed the cheapest non-spine habits.
 */
async function maybeWeekValve(today: string) {
  const pcts = await closedWeekPcts(today, WEEK_VALVE_AFTER)
  if (pcts.length < WEEK_VALVE_AFTER || !weekValveTripped(pcts)) return
  const candidates = valveCandidates(await allHabits(), await currentPhase(today))
  if (!candidates.length) return
  const { text, rows } = M.weekValve(pcts, candidates)
  await send(text, rows)
}

/**
 * Fired from the morning job so there is exactly one place that can announce
 * a week rollover or a phase unlock, and it can only do it once.
 */
async function announceWeekAndPhase(today: string) {
  const thisWeek = weekStart(today)
  const lastAnnounced = await getSetting('last_week_announced')

  if (lastAnnounced && lastAnnounced !== thisWeek) {
    // Read the closing week BEFORE the phase moves, or its score is measured
    // against a phase that was not live while it was being earned.
    const closing = await getState(addDays(thisWeek, -1))
    const verdict = await advancePhase(closing.week.pct)
    if (!closing.week.counts) await lockShelfFor(thisWeek)
    await send(M.weekClosed(closing, verdict))
    await maybeWeekValve(today)
  }

  if (lastAnnounced !== thisWeek) {
    await setSetting('last_week_announced', thisWeek)

    const phase = await currentPhase(today)
    const prev = Number((await getSetting('last_phase')) ?? '0')
    if (phase > prev) {
      await setSetting('last_phase', String(phase))
      if (prev > 0) {
        const names = (await allHabits())
          .filter((h) => h.phase === phase && h.active)
          .map((h) => h.label)
        if (names.length) await send(M.phaseUnlocked(phase, names))
      }
    }
  }
}
