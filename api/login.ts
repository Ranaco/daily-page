import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setSessionCookie } from '../server/auth.js'

/** GET /api/login?key=APP_SECRET — sets the session cookie, then redirects home. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if ((req.query.key as string) !== process.env.APP_SECRET) {
    return res.status(401).send('nope')
  }
  setSessionCookie(res)
  res.setHeader('Location', '/')
  return res.status(302).end()
}
