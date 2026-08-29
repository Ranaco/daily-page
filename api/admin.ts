import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from 'drizzle-orm'
import { db, schema } from '../server/db/client.js'
import { HABITS } from '../server/config.js'
import { seedTopics } from '../server/store.js'
import { eq } from 'drizzle-orm'

export const config = { maxDuration: 60 }

/**
 * Migrate and reseed from a URL, guarded by APP_SECRET — the same auth model as
 * the cron endpoint.
 *
 * This exists because `drizzle-kit push` and `npm run db:seed` need
 * DATABASE_URL, which lives in Vercel and not on every machine that might need
 * to change the plan. Running it here means a redeploy can be followed by one
 * GET instead of a round trip through wherever the .env happens to be.
 *
 *   GET /api/admin?key=<APP_SECRET>&migrate=1
 *   GET /api/admin?key=<APP_SECRET>&seed=1[&force=1]
 *
 * Both are idempotent. `force=1` also resets `points` and `active` on habits
 * that already exist — needed exactly once, when the plan's point values change,
 * and never afterwards, because those two fields are what the bot edits when it
 * offers to halve or pause something.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if ((req.query.key as string) !== process.env.APP_SECRET) {
    return res.status(401).json({ error: 'bad key' })
  }

  const out: Record<string, unknown> = {}
  try {
    if (req.query.migrate) out.migrate = await migrate()
    if (req.query.seed) out.seed = await seed(!!req.query.force)
    if (!Object.keys(out).length) return res.status(400).json({ error: 'pass migrate=1 and/or seed=1' })
    return res.status(200).json({ ok: true, ...out })
  } catch (err) {
    console.error('admin failed', err)
    return res.status(500).json({ error: String(err) })
  }
}

/**
 * Additive DDL only, and every statement is IF NOT EXISTS. Nothing here drops a
 * column or a table: the check-in history is the one thing in this system that
 * cannot be rebuilt, and a migration endpoint reachable by URL has no business
 * being able to destroy it.
 */
async function migrate() {
  const steps = [
    sql`alter table notes add column if not exists mood integer`,
    sql`create table if not exists topics (
      id text primary key,
      domain text not null,
      text text not null,
      used_on date
    )`,
    sql`create table if not exists modes (
      day date primary key,
      mode text not null,
      at timestamptz not null default now()
    )`,
  ]
  for (const s of steps) await db().execute(s)
  const added = await seedTopics()
  return { statements: steps.length, topicsAdded: added }
}

/**
 * The same reconciliation as `server/seed.ts`, kept in step with it by hand.
 * Habits removed from config are deactivated rather than deleted, so their
 * check-in history survives and they can be restored with /habits.
 */
async function seed(force: boolean) {
  const { habits } = schema
  const existing = await db().select().from(habits)
  const known = new Set(existing.map((h) => h.id))

  let added = 0, updated = 0
  for (const [i, h] of HABITS.entries()) {
    const row = {
      id: h.id, phase: h.phase, time: h.time, slot: h.slot,
      label: h.label, sub: h.sub, points: h.points,
      spine: h.spine, weekly: !!h.weekly,
      days: h.days ? JSON.stringify(h.days) : null,
      sort: i,
    }
    if (!known.has(h.id)) {
      await db().insert(habits).values({ ...row, active: true })
      added++
      continue
    }
    const { points, ...safe } = row
    void points
    await db().update(habits)
      .set(force ? { ...row, active: true } : safe)
      .where(eq(habits.id, h.id))
    updated++
  }

  const removed = existing.filter((e) => !HABITS.some((h) => h.id === e.id))
  for (const r of removed) {
    await db().update(habits).set({ active: false }).where(eq(habits.id, r.id))
  }

  return { added, updated, deactivated: removed.map((r) => r.id), forced: force }
}
