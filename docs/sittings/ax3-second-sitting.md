# AX3 — Second Hands-On Sitting

A one-page script for Nick's hands. The economy is live: file a reading, watch the seal open,
rate one, watch the credit chip tick — and find the two refusals in the seed log. About ten
minutes.

## One command

```bash
pnpm install      # first time only
pnpm floor
```

Same as before — an embedded Postgres (no install, no Docker), migrations 001–006, the API, the
web. AX3: the seed now runs the **economy act** — it funds the writers, posts the pieces,
pre-files a spread of readings so several pieces carry sealed counts, and leaves one writer
holding exactly 1 credit. When it prints the line, open **http://localhost:5173**. Ctrl+C stops
everything.

**Read the seed log before you open the browser.** Two refusals are in it, by design:

```
✓ "One Word Too Many" refused at the 7501-word ceiling (422)
✓ lean writer's queue post refused: insufficient_credits (needed 2, held 1)
```

The first is the ceiling; the second is the credit gate. Both burned nothing.

## What to do

1. **Enter.** Email + 8-char passphrase → **Create an account**. Note the **credit chip** top-right:
   **0 credits**. No starter credits — the door opens by reading (foundations §6).
2. **Claim and read.** Open the Pile, claim a piece, click **Read**. You have the text.
3. **The seal is closed.** Below the piece: *N readings here, sealed.* You cannot see them yet —
   the floor reads blind until you have too.
4. **The composer & the paste rail.** Try to paste into the reading box. It is refused and the
   rail note flares: *Paste is closed on the floor — the floor reads human.* Type instead. The
   count line reads plainly — *"64 words — the floor asks at least 120"* — no meter. **File your
   reading** enables at 120.
5. **File it.** The composer collapses, **the seal opens in place** — the pre-filed readings
   appear beside your own — and the **credit chip ticks to 1 credit** with no fanfare. Filing an
   accepted reading earns exactly one credit.
6. **Rate.** On another reader's reading, click **Useful** or **Somewhat**. You can rate theirs
   because you have filed; a stranger who hasn't filed cannot even see them. Only *your own*
   reading shows you its rating counts.
7. **Spend what you earned.** Every credit you hold came from a reading. A queue post costs 2, a
   Volume 4 — the price list is fixed, forever (it lives in one file, `apps/api/src/economy.ts`,
   with the clause quoted above it).

## Where the edges are

- **The seal is server-enforced.** The sealed payload never contains a reading's text — not
  hidden by CSS, not present at all. Filing is the only key.
- **Never your own piece.** Filing on a piece you wrote is refused (`own_piece`), and that
  self-check is audited even on refusal — the seeing law does not roll back.
- **The two refusals** above: the ceiling is checked *before* credits, so an over-length piece
  never touches your balance; and an under-funded post leaves zero rows.
- **The three AX2 notes, now closed:** a bad id in a URL is a clean 404 (not a database 500); a
  deposit whose snapshot cannot be fetched fails loudly as `snapshot_missing`; and an expired hold
  shows in **My holds** as *returned to the floor*, never as a raw error.
- **Not here yet (AX7):** laurels, flags, the moderation desk. **Flagged for your docket:** the
  *genesis policy* — how the first pieces enter an empty production floor when no one yet holds a
  credit. Out of scope for AX3, named so it reaches you.

## If something looks wrong

- Re-run `pnpm floor` — it re-seeds a clean economy each start.
- Run the checks: `pnpm test:local` (API property suite on an embedded Postgres),
  `pnpm test:e2e:local` (the full browser flow), `pnpm check` (the zero-hard-coded-values gate).
