import type { VercelRequest, VercelResponse } from '@vercel/node'
import * as M from '../server/messages.js'
import { gridText } from '../server/grid.js'
import { answer, edit, ownerId, send } from '../server/telegram.js'
import { logicalDay } from '../server/time.js'
import {
  allHabits, claimReward, getSetting, getState, levelFor, lifetimePoints,
  pauseHabit, saveNote, setSetting, shrinkHabit, toggle,
} from '../server/store.js'
import { db, schema } from '../server/db/client.js'
import { eq } from 'drizzle-orm'

export const config = { maxDuration: 20 }

/**
 * Telegram retries any update it does not get a 200 for, which turns one
 * failure into a loop. So: always answer 200, and log problems instead.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('POST only')

  const secret = req.headers['x-telegram-bot-api-secret-token']
  if (secret !== process.env.APP_SECRET) return res.status(401).send('bad secret')

  try {
    await route(req.body)
  } catch (err) {
    console.error('handler failed', err)
    try { await send(`Something broke: <code>${String(err)}</code>`) } catch {}
  }
  return res.status(200).send('ok')
}

async function route(update: any) {
  const from = update?.message?.from?.id ?? update?.callback_query?.from?.id
  if (String(from) !== ownerId()) return // single-user bot; ignore everyone else

  if (update.callback_query) return onCallback(update.callback_query)
  if (update.message?.text) return onText(update.message)
}

// ------------------------------------------------------------------- text

async function onText(msg: any) {
  const text: string = msg.text.trim()

  if (!text.startsWith('/')) {
    const pending = await getSetting('pending')
    if (pending?.startsWith('note:')) {
      const day = pending.slice(5)
      await saveNote(day, text)
      await setSetting('pending', '')
      await send(M.noteSaved(day))
      return
    }
    return send(M.help)
  }

  const cmd = text.split(/[\s@]/)[0]!.toLowerCase()
  const state = await getState()

  switch (cmd) {
    case '/start':
    case '/help':
      return send(M.help)

    case '/today': {
      const left = state.tasks.filter((t) => !t.done)
      if (!left.length) return send('Everything ticked for today.')
      const { text: t, rows } = M.morning(state, left)
      return send(t, rows)
    }

    case '/week':
      return send(gridText(state))

    case '/status':
      return send(M.status(state))

    case '/rewards': {
      const { text: t, rows } = M.shelf(state)
      return send(t, rows)
    }

    case '/note':
      await setSetting('pending', `note:${state.today}`)
      return send(M.notePrompt)

    case '/habits': {
      const all = await allHabits()
      const rows = all.map((h) => [{
        text: `${h.active ? '✅' : '⏸'} ${h.label}`,
        data: `${h.active ? 'pause' : 'unpause'}:${h.id}`,
      }])
      return send('<b>Habits.</b> Tap to pause or restore.', rows)
    }

    default:
      return send(M.help)
  }
}

// --------------------------------------------------------------- callbacks

async function onCallback(cq: any) {
  const data: string = cq.data ?? ''
  const [kind, a, b] = data.split(':')
  const chatId = cq.message?.chat?.id
  const messageId = cq.message?.message_id

  if (kind === 'noop') return answer(cq.id, 'Noted.')

  if (kind === 't' && a) {
    const day = b || logicalDay()
    const before = await lifetimePoints()
    const { done, habit } = await toggle(a, day)
    const state = await getState()

    await answer(cq.id, done ? `+${habit.points}` : `−${habit.points}`)
    await send(M.ticked({ ...habit, days: null }, state, done))

    // Level-ups are announced separately so they feel like an event.
    const lvlBefore = levelFor(before).level
    const lvlAfter = levelFor(state.xp).level
    if (lvlAfter > lvlBefore) await send(M.levelUp(lvlAfter))

    // Fold the tapped button out of the original message so the list shrinks.
    if (chatId && messageId && done) {
      const rows = (cq.message.reply_markup?.inline_keyboard ?? [])
        .map((r: any[]) => r.filter((btn) => btn.callback_data !== data))
        .filter((r: any[]) => r.length)
        .map((r: any[]) => r.map((btn) => ({ text: btn.text, data: btn.callback_data })))
      const label = cq.message.text?.split('\n')[0] ?? 'Today'
      try { await edit(chatId, messageId, `<b>${label}</b>`, rows) } catch {}
    }
    return
  }

  if (kind === 'claim' && a) {
    const result = await claimReward(a)
    if (!result.ok) return answer(cq.id, `${result.short} points short.`)
    const state = await getState()
    await answer(cq.id, 'Claimed')
    return send(M.claimed(result.reward.name, state.bank))
  }

  if (kind === 'shrink' && a) {
    const [h] = await db().select().from(schema.habits).where(eq(schema.habits.id, a)).limit(1)
    if (!h) return answer(cq.id, 'Gone.')
    const halved = Math.max(1, Math.round(h.points / 2))
    await shrinkHabit(h.id, h.label, `Halved: ${h.sub}`, halved)
    await answer(cq.id, 'Halved')
    return send(M.shrunk({ ...h, points: halved, days: null } as any))
  }

  if (kind === 'pause' && a) {
    const [h] = await db().select().from(schema.habits).where(eq(schema.habits.id, a)).limit(1)
    if (!h) return answer(cq.id, 'Gone.')
    await pauseHabit(a)
    await answer(cq.id, 'Paused')
    return send(M.paused({ ...h, days: null } as any))
  }

  if (kind === 'unpause' && a) {
    await db().update(schema.habits).set({ active: true }).where(eq(schema.habits.id, a))
    return answer(cq.id, 'Back on')
  }

  if (kind === 'note' && a) {
    await setSetting('pending', `note:${a}`)
    await answer(cq.id)
    return send(M.notePrompt)
  }

  return answer(cq.id)
}
