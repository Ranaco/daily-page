import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../server/auth.js'
import { getState } from '../server/store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  try {
    res.setHeader('cache-control', 'no-store')
    return res.status(200).json(await getState())
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: String(err) })
  }
}
