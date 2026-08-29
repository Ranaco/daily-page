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
  /** Blocks ticking until a journal entry is attached for that day. */
  needsProof: boolean('needs_proof').notNull().default(false),
  /**
   * Made in the bot rather than declared in config.ts.
   *
   * The seed reconciler deactivates anything it does not find in config, which
   * would quietly kill every task you made yourself on the next deploy. This
   * flag is what it checks before doing that.
   */
  custom: boolean('custom').notNull().default(false),
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

/**
 * The three-line log, plus a number.
 *
 * `felt` is prose and prose is not queryable. In eight weeks the question worth
 * answering is "is the flatness lifting", and that needs a series, not fifty
 * paragraphs to re-read. 1 = flat, 5 = genuinely good. Nullable: the number is
 * asked for after the lines are saved, and skipping it must not lose the lines.
 */
export const notes = pgTable('notes', {
  day: date('day').primaryKey(),
  happened: text('happened'),
  felt: text('felt'),
  tomorrow: text('tomorrow'),
  mood: integer('mood'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * The topic pool for the Saturday talk. Seeded from config.ts; `usedOn` is set
 * when a topic is handed out, and nothing repeats until the pool is exhausted.
 * There are no re-rolls, so this table is the only record of what was asked.
 */
export const topics = pgTable('topics', {
  id: text('id').primaryKey(),
  domain: text('domain').notNull(),
  text: text('text').notNull(),
  usedOn: date('used_on'),
})

/**
 * Which mode the morning block ran in. One row per logical day, written when
 * the mode is declared — so an undeclared morning is simply absent, and the
 * weekly distribution is a group-by rather than a set of defaults.
 */
export const modes = pgTable('modes', {
  day: date('day').primaryKey(),
  mode: text('mode').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * The journal: every artifact the plan produces. A talk video, a photo of a
 * finished sketchbook page, a screenshot, a line of typed text.
 *
 * Deliberately generic, because the plan will grow task types that do not exist
 * yet. `habitId` is nullable so an entry can belong to just a day; `kind` is an
 * open string, not an enum; `meta` is free JSON. A new kind of artifact needs a
 * new `kind` value and no migration.
 *
 * Files live in Telegram. We store `fileId` — resolvable forever through
 * getFile — and never the bytes. Postgres is a bad blob store and these are
 * videos. `uniqueId` is stable per file, so a re-send is detectable.
 */
export const entries = pgTable('entries', {
  id: serial('id').primaryKey(),
  day: date('day').notNull(),
  habitId: text('habit_id'),
  kind: text('kind').notNull(),
  caption: text('caption'),
  fileId: text('file_id'),
  uniqueId: text('unique_id'),
  mime: text('mime'),
  bytes: integer('bytes'),
  width: integer('width'),
  height: integer('height'),
  duration: integer('duration'),
  /** JSON. Whatever a future task type needs that this schema does not have. */
  meta: text('meta'),
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
