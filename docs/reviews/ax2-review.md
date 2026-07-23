# AX2 — Fable's Review at Close

**Ticket:** AX2 (the Queue) · **Branch:** `ax2-queue`, tip `783f438`, unmerged
**Reviewed:** July 23, 2026 · **Verdict:** **PASS, unconditional.** No pre-merge fixes.
Three notes ride to AX3. Merge word is Nick's, per schema law.

## 1. Verification

Both branches testify. `main`: the AX1 merge `ebd8b5b` (`--no-ff`, two parents, Nick's word
recorded in the message) and the brief committed verbatim at `5b339b6`. `ax2-queue`: eight
slices in the reported order — `b3eddf7` schema · `fcc85f6` serving · `0b862ec` tests ·
`259665b` web · `c939d03` e2e · `fa2175e` fixtures · `fd9ffa6` floor · `783f438` acceptance.
CI green on the tip (gate · build · test with migrations 001–005 and 42 API tests · e2e at both
widths).

Read line-by-line: migration 005; `queue/claims.ts`; `queue/pieces.ts`; `queue/service.ts`;
`queue/routes.ts`; `audit.ts`; `serialize.ts`; the full 12-test queue suite;
`tools/seed-floor.ts`; `docs/sittings/ax2-first-sitting.md`.

## 2. What holds (read, not just reported)

**Migration 005** is exact: sealed-comment parity on `claims.account_id` with authorship and
deposits; partial indexes on the active set; the partial-unique one-active-hold constraint with
its lazy-expiry interplay documented in the migration itself; a clean down.

**The claim path is correct in the ways that matter.** The self-claim check is the one
authorship read, at claim time, audited on the pool *before* the hold transaction — so the
seeing-law row persists even when the claim is refused, which the property suite pins by
asserting the `claim_self_check` row after a 409. Inside the transaction: the reader's own
expired hold is lazily released first (so the unique index never blocks a re-claim), duplicates
409, the three-hold cap returns a typed `claim_limit`, and a concurrent race resolves at the
unique index into `already_claimed` rather than a 500. Release touches only live holds.

**Text access is a proven property, not a promise.** `pieces.ts` serves the snapshot only to an
active claimant or, for Volumes, any writer; the suite drives 403 → claim → 200 → expiry → 403
end-to-end, board bundle included. Browse lists never touch linkage — the card select reads
submissions plus a claim count, nothing else — and the serializer test goes further than asked,
asserting the author's account id appears nowhere in the serialized payload as a string.

**Serving law:** tail-weighting is `claim_count ASC, created_at ASC`, proven by the inversion
test (three pieces claimed 2/1/0 times list newest-first); filters are any-match on
parameterized arrays; sort is whitelisted through a `Set` so the `ORDER BY` table can never be
reached by an arbitrary string; Volumes live in their own lane and never enter the queue or the
deal, tested.

**The sitting is real.** `seed-floor.ts` refuses production, declares itself the bridge's
stand-in in its header, and posts every fixture through the real `wrizo-bridge/1` endpoint —
including "At the Ceiling" (7,499, accepted) and "One Word Too Many" (7,501, refused) so Nick
can watch the ceiling work in the seed log. The first-sitting script is exactly what the brief
asked for: one page, house voice, honest about the edges and about what AX3 brings.

## 3. Rulings on the judgment calls

**Audit outside the transaction — accepted as the correct fix.** An audit that rolls back with
the refusal it audits is no audit. The catch was CC's own, made locally, pinned by test.

**`dealOne`'s unaudited authorship touch — accepted, with the principle codified.** The deal
query excludes the requester's own pieces via a predicate scoped to the requester's own account
(`a.account_id = $requester`). This discloses nothing about anyone but the asker, to the asker.
Ruling, submitted for ratification into foundations §9 at the next amendment (**the
self-knowledge clause**): *the seeing-law audit covers reads that could expose sealed linkage
beyond the requesting account; predicates scoped strictly to the requester's own linkage are
self-knowledge and exempt.* Without this clause, every deal would flood the audit log and bury
its signal.

**Embedded Postgres for `pnpm floor` — accepted.** A real binary, not an emulation, so citext,
partial-unique, and COMMENT behave as production; dev-only; CI stays on the standard
`postgres:16` service. Housekeeping: keep it a dev dependency and pin its version.

## 4. Notes — ride to AX3, no blockers

1. **Invalid-UUID path params** (`/pieces/:id`, `/claims/:id/release`) currently surface as
   Postgres 22P02 errors (500) rather than 404s. Parameterized, so no injection — purely
   robustness. Validate path params as UUIDs in AX3.
2. **Silent empty text on a missing snapshot** in `pieces.ts`: acceptable under dev memory
   storage, but in production a deposit whose snapshot cannot be fetched is a ledger-integrity
   event and should error loudly. Harden in AX3/AX4.
3. **Releasing an expired hold returns 404** (`no_active_claim`) — semantically right; the UI
   should present expiry as auto-release so the 404 is never user-facing confusion.

## 5. Path forward

1. CC commits this file verbatim as `docs/reviews/ax2-review.md` on `ax2-queue`.
2. **Nick's explicit merge word** merges `ax2-queue` → `main` (`--no-ff`; the slice history is
   the record).
3. **The device sitting proper:** `pnpm install && pnpm floor`, then the script at
   `docs/sittings/ax2-first-sitting.md`. Nick's sitting notes feed AX3 (the composer, sealed
   readings, ratings, credits) and any FX-style fixes the floor earns.
4. Deploy remains a separate word on a separate day; the self-knowledge clause awaits Nick's
   ratification for the next foundations amendment.

*Filed by Fable.*
