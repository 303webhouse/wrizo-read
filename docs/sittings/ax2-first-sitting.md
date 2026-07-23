# AX2 — First Hands-On Sitting

A one-page script for Nick's hands. The floor is real: seeded pieces, claims, holds, the Reading
Table. About ten minutes.

## One command

From the repo root:

```bash
pnpm install      # first time only
pnpm floor
```

`pnpm floor` needs nothing but Node + pnpm. It starts an **embedded Postgres** (no install, no
Docker), applies migrations 001–005, boots the API with `ALLOW_MEMORY_STORAGE=true`, seeds ~14
fixture pieces **through the real publish API** (there is no upload form — the seed tool is the
bridge's stand-in), and serves the web. When it prints the line, open:

**http://localhost:5173**

Stop everything with Ctrl+C. (Already have a Postgres? Set `DATABASE_URL` first and `pnpm floor`
will use it instead.)

## What to do

1. **The Door.** Enter an email and any 8+ character passphrase, click **Create an account**. A
   reviewer name (your Workshop pseudonym) is minted at the door — see it top-right. The token
   lives in memory only this ticket, so a refresh returns you to the Door. That's by design.
2. **The Pile.** You land in the queue. Cards are in RC2's shape: tags, *by the Scriptor*, word
   count, "Waiting N days · M readers so far". Everything you see is Scriptor-sealed — no names,
   no linkage, ever.
3. **Filter & sort.** Click a room or hand chip to narrow (any-match). Change the sort:
   *oldest & least-read* (the tail-weighted default — coverage reaches the tail), *newest*,
   *shortest*.
4. **Claim one.** Click **Claim · 4h hold**. The card flips in place to *You hold this* with a
   live countdown. Claim up to **three**; a fourth is refused — read or release one first.
5. **Read.** Click **Read** on a held card. The Reading Table shows the piece: tags, provenance
   line, the full text in the prose face, and — where present — a collapsible **Board** (open
   *The Board · N cards*). Read-only this ticket; the composer's seat says so plainly: *Your
   reading — arrives with the next ticket.* No dead buttons.
6. **Release.** *Release this hold* returns the card to the floor. Or visit **My holds** for all
   active holds with countdowns.
7. **Deal me one.** Back in the Pile, click **Deal me one** — the oldest, least-read piece you
   don't already hold, claimed and opened straight to the table.
8. **Volumes.** Scroll to the dashed **Volumes** lane — *Open by choice*, no claim needed, never
   served to the quota.
9. **Both regimes, both widths.** Toggle **Night/Day** (every color re-resolves from the token
   layer, not a repaint). Narrow the window to a tablet width — the floor holds its composition.

## Where the edges are

- **The ceiling works.** The seed log shows one fixture **refused at 7,501 words** and one
  accepted at 7,499 — the queue ceiling is enforced server-side, not by the client.
- **Sealed by construction.** No card, list, or receipt carries an account id or pseudonym. The
  only place authorship is read is the claim-time self-check, and that read is written to the
  audit log with reason `claim_self_check` — even when the claim is refused.
- **Lazy expiry.** A hold is four hours. Expiry is computed, not swept — an expired hold neither
  blocks a re-claim nor serves text (no cron this ticket).
- **Not here yet (AX3):** the reading composer, sealed-readings gating, usefulness ratings, and
  credits. Intake stays credit-free by design this ticket.

## If something looks wrong

- Re-run `pnpm floor` — it re-seeds a clean floor each start.
- Run the checks yourself: `pnpm test:local` (API property suite on an embedded Postgres),
  `pnpm test:e2e:local` (the full browser flow), `pnpm check` (the zero-hard-coded-values gate).
