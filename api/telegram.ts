import type { VercelRequest, VercelResponse } from '@vercel/node'
import * as M from '../server/messages.js'
import { gridText } from '../server/grid.js'
import { answer, edit, ownerId, send } from '../server/telegram.js'
import { MODES } from '../server/config.js'
import { projectModeLeft } from '../server/plan.js'
import { logicalDay, weekStart } from '../server/time.js'
import {
  addEntry, allHabits, attachEntry, claimReward, currentRung, getSetting, getState,
  levelFor, lifetimePoints, modesInWeek, pauseHabit, saveMood, saveNote, setMode,
  setSetting, setTalkStage, shrinkHabit, talkStage, toggle, weekTopic,
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
  if (update.message && hasMedia(update.message)) return onMedia(update.message)
  if (update.message?.text) return onText(update.message)
}

// ------------------------------------------------------------------ media

function hasMedia(msg: any): boolean {
  return !!(msg.photo || msg.video || msg.voice || msg.video_note || msg.document || msg.audio)
}

/**
 * Anything you send the bot becomes an artifact against today.
 *
 * Telegram is the store: it takes large video, converts photos to JPEG (so no
 * HEIC ever reaches the browser), and hands back a file_id that resolves
 * forever. Nothing is uploaded anywhere else and no bytes touch Postgres.
 */
async function onMedia(msg: any) {
  const day = logicalDay()

  // photo arrives as an array of sizes, ascending — the last is the original
  const photo = msg.photo ? msg.photo[msg.photo.length - 1] : null
  const src =
    photo ? { kind: 'photo', f: photo }
    : msg.video ? { kind: 'video', f: msg.video }
    : msg.video_note ? { kind: 'video', f: msg.video_note }
    : msg.voice ? { kind: 'voice', f: msg.voice }
    : msg.audio ? { kind: 'audio', f: msg.audio }
    : { kind: 'file', f: msg.document }

  // /proof arms a habit first, so the file that follows arrives already
  // attached. Stored in settings rather than held in memory: every update is a
  // separate cold serverless invocation with nothing carried between them.
  const pending = await getSetting('pending')
  const armed = pending?.startsWith('attach:') ? (pending.split(':')[1] || null) : null

  const f = src.f
  const entry = await addEntry({
    day,
    habitId: armed,
    kind: src.kind,
    caption: msg.caption ?? null,
    fileId: f.file_id,
    uniqueId: f.file_unique_id,
    mime: f.mime_type ?? null,
    bytes: f.file_size ?? null,
    width: f.width ?? null,
    height: f.height ?? null,
    duration: f.duration ?? null,
  })

  if (armed) {
    await setSetting('pending', '')
    const habit = (await allHabits()).find((h) => h.id === armed)
    // The proof gate is satisfiable now, so offer the tick here rather than
    // making him go and find it on another surface.
    return send(M.attachedTo(src.kind, habit?.label ?? armed), [
      [{ text: `Tick ${habit?.label ?? armed}`, data: `t:${armed}:${day}` }],
    ])
  }

  // Otherwise it is filed against today and we ask what it was for.
  const state = await getState(day)
  const candidates = [...state.tasks, ...state.weekly]
  candidates.sort((a, b) => Number(!!b.needsProof) - Number(!!a.needsProof))

  const rows = candidates.slice(0, 6).map((h) => [{
    text: h.needsProof ? `${h.label} — proof` : h.label,
    data: `att:${entry.id}:${h.id}`,
  }])
  rows.push([{ text: 'Just the journal', data: `att:${entry.id}:` }])

  return send(M.captured(src.kind), rows)
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
      const { text: mt, rows } = M.moodPrompt(day)
      await send(mt, rows)
      return
    }
    if (pending?.startsWith('talkline:')) {
      const day = pending.slice(9)
      await setSetting(`talk_line:${weekStart(day)}`, text)
      await setSetting('pending', '')
      const { text: dt, rows } = M.talkDone(day)
      await send(dt, rows)
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

    case '/topic': {
      const wk = weekStart(state.today)
      const topic = await weekTopic(wk)
      if (!topic) return send('No topic yet. It is handed out with Saturday morning\'s push.')
      const stage = await talkStage(wk)
      const msg = stage === 0 ? M.talkStart(topic)
        : stage === 1 ? M.talkWrite(topic)
        : stage === 2 ? M.talkSpeak(topic)
        : M.talkDone(state.today)
      return send(msg.text, msg.rows)
    }

    case '/ladder':
      return send(M.ladder(await currentRung(state.today)))

    case '/mode': {
      const left = projectModeLeft(await modesInWeek(weekStart(state.today)))
      const rows = MODES.map((m) => [{
        text: m.id === 'project' && left === 0 ? `${m.label} · used up` : m.label,
        data: m.id === 'project' && left === 0 ? 'noop' : `mode:${m.id}`,
      }])
      return send('<b>The first hour.</b> Which one today?', rows)
    }

    case '/proof':
    case '/attach': {
      const all = [...state.tasks, ...state.weekly]
      if (!all.length) return send('Nothing live today to attach to.')
      all.sort((a, b) => Number(!!b.needsProof) - Number(!!a.needsProof))
      const rows = all.map((h) => [{
        text: h.needsProof ? `${h.label} · proof required` : h.label,
        data: `pick:${h.id}`,
      }])
      rows.push([{ text: 'Cancel', data: 'pickoff' }])
      return send(M.pickTask, rows)
    }

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

  if (kind === 'pickoff') {
    await setSetting('pending', '')
    await answer(cq.id, 'Cancelled')
    if (chatId && messageId) { try { await edit(chatId, messageId, 'Cancelled.') } catch {} }
    return
  }

  if (kind === 'pick' && a) {
    const day = logicalDay()
    // Armed until the next file arrives. Stored rather than held in memory
    // because every update is a cold serverless invocation.
    await setSetting('pending', `attach:${a}:${day}`)
    const label = (await allHabits()).find((h) => h.id === a)?.label ?? a
    await answer(cq.id, 'Send it')
    if (chatId && messageId) {
      try { await edit(chatId, messageId, M.armed(label)) } catch {}
    }
    return
  }

  if (kind === 'att' && a) {
    const habitId = b || null
    const entry = await attachEntry(Number(a), habitId)
    if (!entry) return answer(cq.id, 'Gone.')
    const label = habitId
      ? (await allHabits()).find((h) => h.id === habitId)?.label ?? habitId
      : null
    await answer(cq.id, label ? 'Attached' : 'Filed')
    if (chatId && messageId) {
      try { await edit(chatId, messageId, M.attached(label)) } catch {}
    }
    return
  }

  if (kind === 't' && a) {
    const day = b || logicalDay()
    const before = await lifetimePoints()
    const { done, habit, blocked } = await toggle(a, day)
    if (blocked) {
      await answer(cq.id, 'Needs proof')
      return send(M.needsProof(habit.label))
    }
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
    if (!result.ok && result.locked) {
      await answer(cq.id, 'Shelf locked')
      return send(M.shelfLocked(result.locked))
    }
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

  if (kind === 'mode' && a) {
    const day = logicalDay()
    await setMode(day, a)
    const left = projectModeLeft(await modesInWeek(weekStart(day)))
    await answer(cq.id, 'Set')
    return send(M.modeSet(a, left))
  }

  if (kind === 'mood' && a && b) {
    const n = Number(b)
    if (!Number.isInteger(n) || n < 1 || n > 5) return answer(cq.id)
    await saveMood(a, n)
    await answer(cq.id, String(n))
    return send(M.moodSaved(n))
  }

  /**
   * The Saturday talk advances one stage per tap. `a` is the stage just
   * finished, so a stale button cannot skip ahead or rewind.
   */
  if (kind === 'talk' && a) {
    const wk = weekStart(logicalDay())
    const topic = await weekTopic(wk)
    if (!topic) return answer(cq.id, 'No topic this week.')
    const done = Number(a)
    const at = await talkStage(wk)
    if (done !== at + 1) return answer(cq.id, 'Already past that.')
    await setTalkStage(wk, done)
    await answer(cq.id, 'Next')

    if (done === 1) {
      const { text, rows } = M.talkWrite(topic)
      return send(text, rows)
    }
    if (done === 2) {
      const { text, rows } = M.talkSpeak(topic)
      return send(text, rows)
    }
    await setSetting('pending', `talkline:${logicalDay()}`)
    return send(M.talkLine)
  }

  if (kind === 'note' && a) {
    await setSetting('pending', `note:${a}`)
    await answer(cq.id)
    return send(M.notePrompt)
  }

  return answer(cq.id)
}
