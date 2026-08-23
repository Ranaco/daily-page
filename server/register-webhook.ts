/** Points Telegram at your deployment. Re-run whenever PUBLIC_URL changes. */
import { setWebhook } from './telegram.js'

async function main() {
  const base = process.env.PUBLIC_URL?.replace(/\/$/, '')
  const secret = process.env.APP_SECRET
  if (!base) throw new Error('PUBLIC_URL is not set')
  if (!secret) throw new Error('APP_SECRET is not set')

  const url = `${base}/api/telegram`
  await setWebhook(url, secret)
  console.log(`webhook → ${url}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
