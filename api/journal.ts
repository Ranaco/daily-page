import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../server/auth.js'
import {
  addEntry, attachEntry, deleteEntry, journalMonth, journalMonths, tickOnce,
} from '../server/store.js'
import { logicalDay } from '../server/time.js'

/**
 *   GET    /api/journal?month=YYYY-MM     one bounded month + the month index
 *   POST   /api/journal                   { caption, kind?, habitId?, day?, meta? }
 *   PATCH  /api/journal                   { id, habitId }   attach or detach
 *   DELETE /api/journal?id=<id>
 *
 * POST takes text only. Files arrive through Telegram, which is the whole point
 * of storing them there — there is no upload path here to secure, no 4.5MB body
 * limit to work around, and no HEIC to transcode.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return

  try {
    if (req.method === 'GET') {
      const months = await journalMonths()
      const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
        ? req.query.month
        : (months[0] ?? logicalDay().slice(0, 7))
      res.setHeader('cache-control', 'no-store')
      return res.status(200).json({ ...(await journalMonth(month)), months })
    }

    if (req.method === 'POST') {
      const { kind, caption, habitId, day, meta } = (req.body ?? {}) as Record<string, unknown>
      if (typeof caption !== 'string' || !caption.trim()) {
        return res.status(400).json({ error: 'a text entry needs something in it' })
      }
      const on = typeof day === 'string' ? day : logicalDay()
      const entry = await addEntry({
        day: on,
        habitId: typeof habitId === 'string' ? habitId : null,
        kind: typeof kind === 'string' && kind ? kind : 'text',
        caption: caption.trim(),
        meta: (meta ?? null) as Record<string, unknown> | null,
      })
      // Writing something IS the log. Silent: no burst, no points animation on
      // a reflective surface. It never un-ticks — see tickOnce.
      const log = await tickOnce('log', on)
      return res.status(200).json({ ok: true, entry, loggedNow: log.ticked })
    }

    if (req.method === 'PATCH') {
      const { id, habitId } = (req.body ?? {}) as { id?: number; habitId?: string | null }
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'id required' })
      const entry = await attachEntry(Number(id), habitId ?? null)
      if (!entry) return res.status(404).json({ error: 'no such entry' })
      return res.status(200).json({ ok: true, entry })
    }

    if (req.method === 'DELETE') {
      const id = Number(req.query.id)
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'id required' })
      await deleteEntry(id)
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'GET, POST, PATCH or DELETE' })
  } catch (err) {
    console.error('journal failed', err)
    return res.status(500).json({ error: String(err) })
  }
}
