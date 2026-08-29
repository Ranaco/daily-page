/**
 * Reconciles the habits table with config.ts.
 *
 * Deliberately does NOT overwrite `points` or `active` on rows that already
 * exist — those are the two fields the bot edits at 12:30am when it offers to
 * halve or pause something, and a redeploy should never quietly undo that.
 * Pass --force to overwrite them anyway.
 */
import { db, schema } from './db/client.js'
import { HABITS } from './config.js'
import { seedTopics } from './store.js'
import { eq } from 'drizzle-orm'

const force = process.argv.includes('--force')

async function main() {
  const existing = await db().select().from(schema.habits)
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
      await db().insert(schema.habits).values({ ...row, active: true })
      added++
      continue
    }

    const { points, ...safe } = row
    await db().update(schema.habits)
      .set(force ? { ...row, active: true } : safe)
      .where(eq(schema.habits.id, h.id))
    updated++
  }

  const removed = existing.filter((e) => !HABITS.some((h) => h.id === e.id))
  for (const r of removed) {
    await db().update(schema.habits).set({ active: false }).where(eq(schema.habits.id, r.id))
  }

  const topicsAdded = await seedTopics()
  console.log(`seeded — ${added} added, ${updated} updated, ${removed.length} deactivated, ${topicsAdded} topics`)
  if (!force && updated) console.log('(points/active preserved; re-run with --force to reset them)')
}

main().catch((e) => { console.error(e); process.exit(1) })
