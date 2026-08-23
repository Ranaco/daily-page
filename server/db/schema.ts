import { pgTable, text, integer, boolean, date, timestamp, serial, unique } from 'drizzle-orm/pg-core'

/**
 * Habits live in the database (not just config.ts) so the bot can pause or
 * shrink one at 12:30am without a redeploy. `npm run db:seed` reconciles
 * this table with config.ts, preserving `active` and `points` overrides.
 */
export const habits = pgTable('habits', {
  id: text('id').primaryKey(),
  phase: integer('phase').notNull(),
  time: text('time').notNull(),
  slot: text('slot').notNull(),
  label: text('label').notNull(),
  sub: text('sub').notNull(),
  points: integer('points').notNull(),
  spine: boolean('spine').notNull().default(false),
  weekly: boolean('weekly').notNull().default(false),
  /** JSON array of weekday numbers, or null for every day. */
  days: text('days'),
  active: boolean('active').notNull().default(true),
  sort: integer('sort').notNull().default(0),
})

/**
 * One row per habit per logical day, written only when it is ticked.
 * Absence of a row means "not done" — there is no false row to keep in sync.
 */
export const checkins = pgTable('checkins', {
  id: serial('id').primaryKey(),
  habitId: text('habit_id').notNull(),
  day: date('day').notNull(),
  points: integer('points').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ oneADay: unique('checkins_habit_day').on(t.habitId, t.day) }))

/** The three-line log. One row per logical day. */
export const notes = pgTable('notes', {
  day: date('day').primaryKey(),
  happened: text('happened'),
  felt: text('felt'),
  tomorrow: text('tomorrow'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
})

/** Claimed rewards. Spendable balance = lifetime points − sum(cost). */
export const claims = pgTable('claims', {
  id: serial('id').primaryKey(),
  rewardId: text('reward_id').notNull(),
  name: text('name').notNull(),
  cost: integer('cost').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
})

/** Free-form key/value. Holds `started_on` and the pending-input marker. */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
