# The Daily Page

A habit tracker built around one idea: **the reward has to land at the moment you do the thing.**
A Telegram bot that pushes three times a day and rewards instantly, plus a comic-styled
web grid for seeing the whole week at once.

Single user. No accounts, no teams, no social features.

---

## The mechanics (these are the point — the code is just plumbing)

| Rule | Why |
|---|---|
| **Never miss twice** | One miss is logged, coloured yellow, costs nothing. Two in a row is the only thing the bot reacts to — and it reacts by offering to *halve* the habit, never to scold. |
| **The week is scored, not the day** | Hit 80% of available points and the week counts. One wrecked Tuesday gets absorbed instead of ending the run. |
| **Points weighted by difficulty** | Waking at 7:15 is worth 5, ticking a box is worth 1. Flat scoring means farming the easy ones. |
| **Points buy real things** | If points only buy a bigger number it's a spreadsheet. Once something is on the shelf, you don't buy it any other way. |
| **Phases are earned, and cannot be rushed** | A week at 70% or better opens the next phase. Under that, the phase repeats — but three weeks in one phase and it opens anyway. You can be held back twice; you cannot be stranded. |
| **The two lines do different jobs** | 80% is whether the week *counted* (and whether the shelf stays open). 70% is whether the next phase opens. |
| **An under-target week locks the shelf** | Points keep banking; spending pauses for the following week. Nothing is deducted and nothing resets. |
| **XP never resets** | Its only job is to make eight weeks of unremarkable days visibly add up. |
| **The first week gives, it does not take** | Phase 1 is the hour that belongs to you, a book and the sketchbook — and it does *not* move your wake time. The clock only moves in phase 2. See below. |
| **Two bad weeks shrinks the load** | Never-miss-twice is blind to 65% every week with nothing missed twice. The week valve catches that and offers to drop the cheapest habits. |

---

## Why the phases are in this order

The first version of this plan opened with the clock — wake earlier, sleep
earlier, get outside — and put drawing three weeks out. That is how someone with
spare discipline would build it. The discipline here is already fully committed
to work; there is none spare. Curiosity is the tank that still has fuel in it.

It also cut sleep. Lights-out at 01:00 with a 07:15 wake is 6h15m, which was
*less* than the 7h it was replacing, in a plan whose author had already reported
memory trouble and emotional flatness. The first phase was pointed the wrong way.

So:

| Phase | What opens |
|---|---|
| 1 · what you miss | The first hour, reading, the sketchbook, the three lines |
| 2 · the clock, and her | Wake 07:30, outside, the call at 23:30, lights out 00:30 |
| 3 · the body, and the voice | Movement, meals, the walk, reading aloud, the Saturday talk |
| 4 · the world | The social rung, one new place, calling home, the Sunday hour |

Each phase needs one week at or above the gate to open the next. Earliest
completion is therefore four weeks; the slowest possible is twelve.

Phase 1 takes nothing away. Phase 2 moves the clock only once there is a reason
to be awake earlier, and only once the 00:30–02:00 tail has lost its job — which
is the whole point of putting the drawing block at 21:00 first.

**The floor is seven hours.** If 00:30 will not hold, move `wake` later rather
than moving `lights` earlier.

---

## The gate, and why it is 70 and not 80

Progression is earned rather than handed over by the calendar — a week under the
gate repeats the phase. Two numbers rather than one, because they answer
different questions:

- **80%** — did the week count? Gates XP milestones and the reward shelf.
- **70%** — does the next phase open?

The gate is lower on purpose. At 80% the slack is 1.4 days of total collapse per
week, in every phase:

| Phase | Points/week | Slack at 80% | Slack at 70% |
|---|---|---|---|
| 1 | 105 | 21 pts · 1.4 days | 31 pts · 2.1 days |
| 2 | 238 | 47 pts · 1.4 days | 71 pts · 2.1 days |
| 3 | 328 | 65 pts · 1.4 days | 98 pts · 2.1 days |
| 4 | 347 | 69 pts · 1.5 days | 104 pts · 2.3 days |

Gating at 80% keys progression to a single wrecked weekend, which is currently
the most broken part of the week — it would hold back the plan on exactly the
thing the plan has not fixed yet.

**`PHASE_MAX_WEEKS = 3`** is the backstop. Without it, the habits aimed at the
actual complaint — the ladder, new places, the talk, calling home — sit in phases
3 and 4 and become the least reachable things in the plan. A repeated phase also
means the same handful of habits for a month, which is the monotony this exists
to break. So the gate can hold you back twice and then stops.

The phase lives in `settings.phase`, not in a date calculation. `phaseForWeek()`
survives only to seed it on first read, so an existing run keeps the phase it
had. `phase_override` still wins over everything if you need to force it.

### Weekly habits now count toward the score

They were excluded from `week.pct` entirely, which made the Saturday talk — six
points, the highest-value single habit — worth nothing toward the week. Harmless
while the score was decoration; not harmless once it gates the next phase. A
weekly habit becomes *available* on the weekday in its `days`, and only once that
day has elapsed, so an unstarted Saturday does not drag Tuesday down.

---

## The first hour

One 60-minute block, before work opens, with a declared mode: **writing**,
**learning**, or **project**. The bot asks at the morning push, logs the answer,
and shows the week's spread — a fixed rota gets resented by week two, and free
choice while depleted defaults to whichever mode is easiest.

**Project mornings are capped at two a week** (`PROJECT_MODE_CAP`). The failure
mode is specific: "personal project" becomes work with a different repo name,
done for free, at 09:15, and eats the block whole. The qualifying test is no
deadline, no user, no architecture document. If it has invariants, it is work.

**The block only survives if work formally starts later.** Otherwise you do the
hour, then work the same thirteen hours behind it, and net nothing but tiredness.

---

## The Saturday talk

A random topic from a pool of 150, then three stages in this order:

1. **10 minutes, screen on.** Read. Two or three sources. Write nothing.
2. **5 minutes, screen off, tabs closed.** Write by hand, from memory. Not a
   transcript — a reconstruction. What you cannot remember is the part you did
   not learn, and finding that out is the point of doing it this way round.
3. **2 minutes minimum, one take, to camera.** From the notes. A second take
   makes it a reading exercise.

Then one typed line: the most interesting thing you learned, notebook closed.

**No AI, at any stage.** Websites are fine. Nothing enforces this and nothing
needs to — the struggle is the whole point, being the exact thing that got
automated out of the rest of the week.

Topics are used once and never repeat until the pool is exhausted, and **there
are no re-rolls**. The failure mode is rolling until you land on something
adjacent to what you already know, at which point the habit becomes a comfort
exercise. Ten minutes of reading gives a shallow two minutes; that is correct.
The skill is fluency on thin material, not expertise.

Stages advance on **button taps, not a timer** — serverless cannot wake itself
in ten minutes without another cron job, and taps are better anyway: each one is
a commitment, and the thing works whenever you start rather than only at 11:00.

---

## Two notebooks, and neither is digital

- **The sketchbook** — dated, in order, nothing torn out, nothing posted. Pride
  comes from flipping back twenty pages.
- **The topic notebook** — the Saturday talk's stage-2 notes, same rules.

`draw` used to say *"no outcome, nothing to post"*. Killing the audience was
right; killing the outcome was not. Drawing was described as *learning, pride,
quiet, interesting* — three of those four need visible progress and only one
needs solitude. Hence: unpostable, but sequential.

The bot's tone rules live at the top of `server/messages.ts` and are load-bearing:
no disappointment, no zeroing out, offer smaller before harder, buttons over typing.

---

## Setup

### 1. Database — Neon

Create a project at [console.neon.tech](https://console.neon.tech) and copy the
**pooled** connection string.

```bash
cp .env.example .env      # then fill it in
npm install
npm run db:push           # creates the tables
npm run db:seed           # loads habits from server/config.ts
```

### 2. Bot — BotFather

In Telegram, message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token
into `TELEGRAM_BOT_TOKEN`. Message [@userinfobot](https://t.me/userinfobot) to get your
numeric id → `TELEGRAM_OWNER_ID`. The bot ignores every other chat; that is the whole
auth model.

Generate a secret for `APP_SECRET`:

```bash
openssl rand -hex 24        # or: node -e "console.log(crypto.randomUUID().replace(/-/g,''))"
```

### 3. Deploy

```powershell
.\deploy.ps1 -Token vcp_xxx     # token from vercel.com/account/settings/tokens
```

This pushes the env vars, deploys, registers the Telegram webhook, and verifies
itself. It is idempotent — re-run it after any change.

> **Commit with an email GitHub knows, or the deploy is blocked.** Vercel's GitHub
> integration refuses any commit whose committer it cannot map to a GitHub user:
> *"The Deployment was blocked because GitHub could not associate the committer
> with a GitHub user."* It is not a code error and retrying does not help — the
> only fix is a new commit with a linked identity. `86058409+Ranaco@users.noreply.github.com`
> always associates:
>
> ```bash
> git config user.email "86058409+Ranaco@users.noreply.github.com"
> ```
>
> Or add the address you do commit with to github.com/settings/emails.

> **Why it sets env vars through the REST API rather than `vercel env add`:**
> piping a string to a native command's stdin in Windows PowerShell 5.1 prepends
> a UTF-8 BOM, so every value lands one invisible character too long. An
> `APP_SECRET` of 49 bytes instead of 48 fails every comparison and every
> endpoint returns an opaque 401. This is worth knowing before you "simplify" it.

Send the bot `/help`. If it answers, everything is wired.

### 4. Open the website

Live at **https://daily.ranax.co**.

Visit `https://daily.ranax.co/api/login?key=<APP_SECRET>` once per device. It sets
an httpOnly cookie for a year and redirects you home.

The domain is a CNAME at Namecheap: `daily` → `c63e0d15ce60d14b.vercel-dns-017.com.`
The webhook and `PUBLIC_URL` both point here rather than at a `*.vercel.app` URL,
so the address survives redeploys.

---

## Scheduling the three daily pushes

The bot pushes at the times in `SLOTS` (`server/config.ts`). Times are driven by
whatever hits `/api/cron/tick` — the config values are display only.

**Vercel's Hobby plan allows two cron jobs, once a day each** — so `vercel.json`
registers only morning and evening, and Hobby crons fire *somewhere within the hour*
rather than at an exact minute. For a bot whose entire job is showing up at 7:10, that
is not good enough.

**Recommended:** use a free external scheduler with minute precision
([cron-job.org](https://cron-job.org) works well). Create three jobs, all `GET`:

| When (IST) | URL |
|---|---|
| 09:10 | `https://daily.ranax.co/api/cron/tick?slot=morning&key=<APP_SECRET>` |
| 12:15 | `https://daily.ranax.co/api/cron/tick?slot=lunch&key=<APP_SECRET>` |
| 13:20 | `https://daily.ranax.co/api/cron/tick?slot=midday&key=<APP_SECRET>` |
| 21:00 | `https://daily.ranax.co/api/cron/tick?slot=draw&key=<APP_SECRET>` |
| 00:20 | `https://daily.ranax.co/api/cron/tick?slot=wrap&key=<APP_SECRET>` |

**The morning job is at 09:10 while phase 1 runs**, because phase 1 does not move
your wake time and a 07:10 push would arrive while you are asleep. Move it to
07:20 when phase 2 lands.

**The 21:00 `draw` job is the one that matters most** — it is the push for the
highest-value habit in the plan. If only two jobs can exist, make them `draw` and
`morning`.

The Saturday talk needs **no cron of its own**: the topic is handed out by the
morning push and the stages advance on button taps.

### If the scheduler dies

Every tick stamps `last_tick`. The website shows a warning when nothing has
fired in `STALE_TICK_HOURS` (26). Nothing inside the app can alarm on its own
cron failing to run — that is the point of the banner. Silence should never be
read as your own lapse when it is an outage.

Then delete the `crons` block from `vercel.json` so nothing fires twice.

The morning job also handles week rollover and phase unlock announcements, and it is
idempotent — running it twice in one day will not double-announce anything.

---

## The logical day

**A day starts at 04:00, not midnight.** Lights-out at 1:00am belongs to the day that
just ended, and the 12:20am wrap-up is asking about yesterday. All of this lives in
`server/time.ts`; nothing else does date maths.

```bash
npx tsx server/time.test.ts    # 19 assertions covering the boundary and forgiveness rules
```

---

## Changing the plan

Everything is in **`server/config.ts`** — habits, points, phases, modes, topics,
the ladder, rewards. Edit it and:

```bash
npm run db:push          # only if schema.ts changed
npm run db:seed
```

### …without a local `.env`

Both of those need `DATABASE_URL`, which lives in Vercel. `/api/admin` does the
same work server-side, guarded by `APP_SECRET` like the cron:

```
GET /api/admin?key=<APP_SECRET>&migrate=1        # additive DDL only, idempotent
GET /api/admin?key=<APP_SECRET>&seed=1           # reconcile habits + topics
GET /api/admin?key=<APP_SECRET>&seed=1&force=1   # ALSO reset points and active
```

`migrate` is additive only — every statement is `IF NOT EXISTS` and nothing
drops anything. The check-in history is the one thing here that cannot be
rebuilt, and an endpoint reachable by URL has no business being able to destroy
it.

Use `force=1` **once**, when point values change, and never again — `points` and
`active` are the two fields the bot edits when it offers to halve or pause
something, and a redeploy must not quietly undo that.

Seeding **preserves `points` and `active`** on habits that already exist, because those
are the two fields the bot edits at 12:30am when it offers to halve or pause something.
A redeploy should never quietly undo that. Use `npm run db:seed -- --force` to reset them.

---

## Layout

```
api/              Vercel serverless functions
  telegram.ts       webhook — commands and button taps
  cron/tick.ts      the three daily pushes
  state|toggle|claim|login.ts
server/           shared server code
  config.ts         THE PLAN — habits, points, phases, rewards
  messages.ts       every string the bot can say
  store.ts          scoring, forgiveness, week grid
  time.ts           logical days, weeks
  grid.ts           the monospace grid for Telegram
web/              Vite + React front end
```

## Commands

```
/today    today's list        /rewards  spend points
/week     the grid            /note     the three lines, then the number
/status   level, points, week /habits   pause or restore
/topic    the Saturday talk   /ladder   the social rungs
/mode     set the first hour
```

## Tests

```bash
npx tsx server/time.test.ts    # logical days, weeks, the phase clock
npx tsx server/plan.test.ts    # topics, the week valve, modes, the ladder
npm run typecheck
```

`server/plan.ts` holds every decision that is a pure function of its arguments —
which topic, whether the phase advances, whether the shelf locks, whether the
valve trips, what to offer, where the ladder stands.
That is deliberate: it is the part worth testing, and it has no database, no
Telegram and no clock in it.
