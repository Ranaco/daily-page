import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../server/auth.js'
import { getState, levelFor, lifetimePoints, toggle } from '../server/store.js'
import { logicalDay } from '../server/time.js'
import * as M from '../server/messages.js'
import { send } from '../server/telegram.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { habitId, day } = (req.body ?? {}) as { habitId?: string; day?: string }
  if (!habitId) return res.status(400).json({ error: 'habitId required' })

  try {
    const before = await lifetimePoints()
    const { done } = await toggle(habitId, day || logicalDay())
    const state = await getState()

    // Ticking on the website should feel identical to ticking in Telegram,
    // so the same confirmation lands in the chat either way.
    const after = levelFor(state.xp).level
    if (after > levelFor(before).level) {
      send(M.levelUp(after)).catch((e) => console.error('notify failed', e))
    }

    return res.status(200).json({ done, state })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: String(err) })
  }
}
