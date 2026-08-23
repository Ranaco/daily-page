import type { VercelRequest, VercelResponse } from '@vercel/node'

const COOKIE = 'dp_session'

/**
 * One user, one secret. The website asks for it once and stores it in an
 * httpOnly cookie. That is the entire auth model, and for a habit tracker
 * only you will ever open, it is the right amount.
 */
export function authorized(req: VercelRequest): boolean {
  const secret = process.env.APP_SECRET
  if (!secret) return false
  const header = req.headers['x-app-key']
  if (header === secret) return true
  const raw = req.headers.cookie ?? ''
  return raw.split(';').some((c) => c.trim() === `${COOKIE}=${secret}`)
}

export function requireAuth(req: VercelRequest, res: VercelResponse): boolean {
  if (authorized(req)) return true
  res.status(401).json({ error: 'unauthorized' })
  return false
}

export function setSessionCookie(res: VercelResponse) {
  res.setHeader('Set-Cookie', [
    `${COOKIE}=${process.env.APP_SECRET}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
  ])
}
