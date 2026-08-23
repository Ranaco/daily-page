import type { VercelRequest, VercelResponse } from '@vercel/node'
import * as M from '../../server/messages.js'
import { send } from '../../server/telegram.js'
import { addDays, logicalDay, weekStart } from '../../server/time.js'
import {
  allHabits, currentPhase, getSetting, getState, habitsBySlot, missedTwice, setSetting,
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
    if (slot === 'morning') await morning(today)
    else if (slot === 'midday') await midday(today)
    else if (slot === 'evening') await evening(today)
    else return res.status(400).json({ error: 'unknown slot' })
    return res.status(200).json({ ok: true, slot, day: today })
  } catch (err) {
    console.error('cron failed', err)
    return res.status(500).json({ error: String(err) })
  }
}

async function morning(today: string) {
  await announceWeekAndPhase(today)

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

async function midday(today: string) {
  const state = await getState(today)
  const due = (await habitsBySlot('midday', today)).filter(
    (h) => !state.tasks.find((t) => t.id === h.id)?.done,
  )
  const msg = M.midday(state, due)
  if (msg) await send(msg.text, msg.rows)
}

async function evening(today: string) {
  const state = await getState(today)
  const remaining = state.tasks.filter((t) => !t.done)
  const { text, rows } = M.evening(state, remaining as any)
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
    const closing = await getState(addDays(thisWeek, -1))
    await send(M.weekClosed(closing))
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
