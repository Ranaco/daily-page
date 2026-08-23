import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../server/auth.js'
import { claimReward, getState } from '../server/store.js'
import * as M from '../server/messages.js'
import { send } from '../server/telegram.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { rewardId } = (req.body ?? {}) as { rewardId?: string }
  if (!rewardId) return res.status(400).json({ error: 'rewardId required' })

  try {
    const result = await claimReward(rewardId)
    if (!result.ok) return res.status(400).json({ error: `${result.short} points short` })
    const state = await getState()
    send(M.claimed(result.reward.name, state.bank)).catch((e) => console.error('notify failed', e))
    return res.status(200).json({ ok: true, state })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: String(err) })
  }
}
