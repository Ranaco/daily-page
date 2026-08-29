# The social ladder

`rung` used to read *"Current rung on the ladder"* with no ladder anywhere in the
repo — the highest-friction habit in the plan pointing at a document that did not
exist. This is the document.

It runs Tuesday and Thursday, 7pm, and it is worth 5 points, which is the same as
lights-out and more than reading. That is on purpose: it is the hardest thing in
the week and the one with the least immediate reward.

## The rungs

1. Order at a counter instead of on an app. Say the order out loud.
2. Ask one shop person one real question — what they recommend, and why.
3. Sit in a café for thirty minutes. No laptop, no earphones. Just sit.
4. Small talk with one stranger: the barista, the guard, the man at the stall. Two exchanges minimum.
5. Say one unprompted thing in a work call that is not about the work.
6. Go to a public thing alone — a screening, a talk, a gig, a match.
7. Have one conversation with someone new that lasts past the first exit ramp.
8. Make a plan with someone who is not Madhav, Vatsal, Kunal, or your brother — and keep it.

## Movement

- **Three clears in a row** move you up one rung.
- **Two misses in a row** move you down one.
- **Rung 1 is the floor.** You cannot fall off the bottom.

The rung is *computed from the check-in history* (`ladderResults` → `ladderRung`),
never stored. A stored rung drifts out of step with what actually happened; a
derived one cannot. `/ladder` shows where you are.

## Why rung 1 is trivially small

Because the plan does not need you to be braver, it needs the habit to exist.
An eight-rung ladder whose first step is "go to a meetup" has one rung, and it is
never taken. A first step small enough to be slightly embarrassing gets taken
this Tuesday, and Tuesday is the only date that matters.

Rung 6 is the one to watch. Everything below it is transactional — a counter, a
question, a seat — and can be done while still fundamentally alone. Rung 6 is the
first that requires an evening. If the ladder stalls anywhere it will stall there,
and stalling at 6 for a month is a fine outcome; the four rungs below it are worth
having on their own.

## Editing it

`LADDER` in `server/config.ts`. It is a plain array of strings, so adding or
reordering rungs takes effect immediately — but note that the rung is derived
from *counts* of clears and misses, so reordering mid-run moves you to a
different instruction at the same number rather than recomputing anything.
