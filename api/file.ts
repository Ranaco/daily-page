import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Readable } from 'node:stream'
import { requireAuth } from '../server/auth.js'
import { entryById } from '../server/store.js'

export const config = { maxDuration: 60 }

/**
 * Streams a journal file out of Telegram.
 *
 * This proxies rather than redirects, and that is not a preference. Telegram's
 * download URL is `api.telegram.org/file/bot<TOKEN>/<path>` — the bot token is
 * IN THE PATH, so a 302 would hand a working token to anything that loads the
 * page, visible in the network tab. Nothing may ever emit that URL.
 *
 * Range requests are forwarded so <video> can seek instead of downloading the
 * whole file to play the middle of it.
 *
 *   GET /api/file?id=<entryId>
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return

  const id = Number(req.query.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id required' })

  const entry = await entryById(id)
  if (!entry) return res.status(404).json({ error: 'no such entry' })
  if (!entry.fileId) return res.status(404).json({ error: 'entry has no file' })

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return res.status(500).json({ error: 'bot token not configured' })

  try {
    // Resolved per request rather than stored: the path Telegram returns is
    // short-lived, so caching it would produce links that rot on the page.
    const meta = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file_id: entry.fileId }),
    }).then((r) => r.json() as Promise<{
      ok: boolean; result?: { file_path?: string }; description?: string
    }>)

    if (!meta.ok || !meta.result?.file_path) {
      return res.status(502).json({ error: `getFile: ${meta.description ?? 'no path'}` })
    }

    const upstream = await fetch(
      `https://api.telegram.org/file/bot${token}/${meta.result.file_path}`,
      { headers: req.headers.range ? { range: String(req.headers.range) } : {} },
    )
    if (!upstream.ok && upstream.status !== 206) {
      return res.status(502).json({ error: `download failed: ${upstream.status}` })
    }

    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = upstream.headers.get(h)
      if (v) res.setHeader(h, v)
    }
    if (!upstream.headers.get('content-type') && entry.mime) {
      res.setHeader('content-type', entry.mime)
    }
    // Immutable for a given entry id, but private — this is a personal journal.
    res.setHeader('cache-control', 'private, max-age=3600')
    res.status(upstream.status)

    if (!upstream.body) return res.end()
    Readable.fromWeb(upstream.body as never).pipe(res)
  } catch (err) {
    console.error('file proxy failed', err)
    if (!res.headersSent) res.status(500).json({ error: String(err) })
  }
}
