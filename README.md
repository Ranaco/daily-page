# The Daily Page

A habit tracker built around one idea: **the reward has to land at the moment you do the thing.**
A Telegram bot that pushes three times a day and rewards instantly, plus a comic-styled
web grid for seeing the whole week at once.

Single user. No accounts, no teams, no social features.

---

## The mechanics (these are the point â€” the code is just plumbing)

| Rule | Why |
|---|---|
| **Never miss twice** | One miss is logged, coloured yellow, costs nothing. Two in a row is the only thing the bot reacts to â€” and it reacts by offering to *halve* the habit, never to scold. |
| **The week is scored, not the day** | Hit 80% of available points and the week counts. One wrecked Tuesday gets absorbed instead of ending the run. |
| **Points weighted by difficulty** | Waking at 7:15 is worth 5, ticking a box is worth 1. Flat scoring means farming the easy ones. |
| **Points buy real things** | If points only buy a bigger number it's a spreadsheet. Once something is on the shelf, you don't buy it any other way. |
| **Phases unlock on time, not performance** | Phase 2 opens in week 3 regardless of how week 1 went. The lock guards against starting everything at once, which is the actual failure mode. |
| **XP never resets** | Its only job is to make eight weeks of unremarkable days visibly add up. |

The bot's tone rules live at the top of `server/messages.ts` and are load-bearing:
no disappointment, no zeroing out, offer smaller before harder, buttons over typing.

---

## Setup

### 1. Database â€” Neon

Create a project at [console.neon.tech](https://console.neon.tech) and copy the
**pooled** connection string.

```bash
cp .env.example .env      # then fill it in
npm install
npm run db:push           # creates the tables
npm run db:seed           # loads habits from server/config.ts
```

### 2. Bot â€” BotFather

In Telegram, message [@BotFather](https://t.me/BotFather) â†’ `/newbot` â†’ copy the token
into `TELEGRAM_BOT_TOKEN`. Message [@userinfobot](https://t.me/userinfobot) to get your
numeric id â†’ `TELEGRAM_OWNER_ID`. The bot ignores every other chat; that is the whole
auth model.

Generate a secret for `APP_SECRET`:

```bash
openssl rand -hex 24        # or: node -e "console.log(crypto.randomUUID().replace(/-/g,''))"
```

### 3. Deploy

```bash
npx vercel            # link the project
npx vercel env add    # add all five vars, for Production
npx vercel --prod
```

Then set `PUBLIC_URL` in `.env` to the deployed origin and point Telegram at it:

```bash
npm run bot:register
```

Send the bot `/help`. If it answers, everything is wired.

### 4. Open the website

Visit `https://daily.ranax.co/api/login?key=<APP_SECRET>` once per device. It sets an
httpOnly cookie for a year and redirects you home.

---

## Scheduling the three daily pushes

The bot pushes at **7:10am, 1:15pm and 12:20am IST**. Times are driven by whatever
hits `/api/cron/tick`.

**Vercel's Hobby plan allows two cron jobs, once a day each** â€” so `vercel.json`
registers only morning and evening, and Hobby crons fire *somewhere within the hour*
rather than at an exact minute. For a bot whose entire job is showing up at 7:10, that
is not good enough.

**Recommended:** use a free external scheduler with minute precision
([cron-job.org](https://cron-job.org) works well). Create three jobs, all `GET`:

| When (IST) | URL |
|---|---|
| 07:10 | `https://daily.ranax.co/api/cron/tick?slot=morning&key=<APP_SECRET>` |
| 13:15 | `https://daily.ranax.co/api/cron/tick?slot=midday&key=<APP_SECRET>` |
| 00:20 | `https://daily.ranax.co/api/cron/tick?slot=evening&key=<APP_SECRET>` |

Then delete the `crons` block from `vercel.json` so nothing fires twice.

The morning job also handles week rollover and phase unlock announcements, and it is
idempotent â€” running it twice in one day will not double-announce anything.

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

Everything is in **`server/config.ts`** â€” habits, points, phases, rewards. Edit it and:

```bash
npm run db:seed
```

Seeding **preserves `points` and `active`** on habits that already exist, because those
are the two fields the bot edits at 12:30am when it offers to halve or pause something.
A redeploy should never quietly undo that. Use `npm run db:seed -- --force` to reset them.

---

## Layout

```
api/              Vercel serverless functions
  telegram.ts       webhook â€” commands and button taps
  cron/tick.ts      the three daily pushes
  state|toggle|claim|login.ts
server/           shared server code
  config.ts         THE PLAN â€” habits, points, phases, rewards
  messages.ts       every string the bot can say
  store.ts          scoring, forgiveness, week grid
  time.ts           logical days, weeks
  grid.ts           the monospace grid for Telegram
web/              Vite + React front end
```

## Commands

```
/today    today's list        /rewards  spend points
/week     the grid            /note     the three lines
/status   level, points, week /habits   pause or restore
```

