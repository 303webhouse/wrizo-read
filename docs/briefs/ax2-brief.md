# AX2 — The Queue: Claims, Serving, Filters, Volumes, First Hands-On Sitting

**Repo:** `303webhouse/wrizo-read` · **Branch:** `ax2-queue` off `main` (post-AX1 merge — do not
start before Nick's AX1 merge word is executed). **Schema notice:** AX2 adds schema (claims);
build may proceed, merge requires Nick's explicit word at close. Report = push. One checkout;
this tree never touches the Write repo.

Read `docs/foundations/foundations.md` §5 (floor laws) and `docs/rc/workshop-rc2.html` (the
visual north star for the Queue room) before writing code.

## 0. Scope in one sentence

Seeded pieces surface in a filterable, tail-weighted queue; a writer claims one on a four-hour
hold and reads it (text, provenance, board bundle) in a read-only Reading Table — full-stack,
runnable on Nick's machine with one command, testable by hand.

**Explicitly deferred to AX3:** the reading composer, sealed-readings gating, usefulness
ratings, and the credit economy (including the credit check on the publish endpoint — intake
stays credit-free this ticket by design).

## 1. Schema (one migration: claims)

```sql
claims (
  id            text pk,                 -- mint like session tokens? No: uuidv7 via newId() — claims are not secrets
  submission_id uuid not null references submissions(id),
  account_id    uuid not null references accounts(id),   -- SEALED linkage, parity with authorship/deposits:
                                                         -- COMMENT ON COLUMN with the standard sealed language;
                                                         -- no endpoint returns it; reads audited where personal
  claimed_at    timestamptz not null default now(),
  expires_at    timestamptz not null,                    -- claimed_at + 4h
  released_at   timestamptz null                         -- explicit release or fulfilled later (AX3)
)
```

Indexes: `(submission_id) where released_at is null`, `(account_id) where released_at is null`.
Uniqueness: at most one **active** claim per (submission_id, account_id) — partial unique index.
Use `newId()` (uuidv7) for claim ids; claims are references, not bearer secrets.

Claim expiry is **lazy**: queries treat `expires_at <= now() and released_at is null` as
released. No cron this ticket.

## 2. Serving rules (the law of the floor, server-side)

- **Queue membership:** `kind='queue' and status='received'`. No status churn in AX2 —
  visibility is computed, statuses stay untouched.
- **Tail weighting:** order by (count of claims on the piece, ascending) then `created_at`
  ascending — oldest and least-claimed first. Claims count is the proxy for readings until
  readings exist (AX3); note this in code.
- **Filters:** by rooms (any-match) and hands (any-match); sort options: tail-weighted
  (default), newest, shortest.
- **Deal me one:** first piece in tail-weighted order that the requester has no active claim
  on and did not author.
- **Self-claim block (seeing-law compliant):** the authorship check happens only at claim
  time — one row read of `authorship` for that submission, written to `archive_access_log`
  with `reason='claim_self_check'`. Browse lists never touch linkage.
- **Claim:** creates the hold (4h), max **3 active claims** per account (typed 409 beyond),
  409 if the piece already has an active claim by this account. Multiple readers may hold the
  same piece concurrently — holds are per-reader, not exclusive locks.
- **Release:** explicit endpoint sets `released_at`; expiry does it lazily.
- **Text access:** the snapshot (and board bundle) is served **only** to (a) an active
  claimant of that piece, or (b) any writer for `kind='volume'` — Volumes are open by choice,
  no claim needed, and never appear in deal-me-one or the queue list (separate lane/endpoint).
  Non-claimants get card metadata only. This is an API property, tested as one.
- **Card metadata is Scriptor-sealed:** id, title, kind, word_count, rooms, hands, coarse
  provenance, created_at, claim count ("N readers so far"). Never any linkage, never pseudonyms.

## 3. Endpoints (all bearer-authed, writer role)

```
GET  /api/v1/workshop/queue?rooms=&hands=&sort=      -> QueueCard[]  (queue lane only)
GET  /api/v1/workshop/volumes                        -> QueueCard[]  (volumes lane)
POST /api/v1/workshop/claims { submission_id }       -> Claim (own view: submission_id, claimed_at, expires_at)
POST /api/v1/workshop/claims/:submission_id/release  -> { released: true }
GET  /api/v1/workshop/claims/mine                    -> Claim[] (active only)
GET  /api/v1/workshop/pieces/:id                     -> { card, text, board_bundle? , provenance }
                                                        (claimant-or-volume rule enforced here)
```

Serializers extend `serialize.ts` whitelists — never spread a row. Typed errors throughout
(`not_claimable`, `own_piece`, `claim_limit`, `not_claimant`, …).

## 4. Web — the floor becomes real

Grow the AX1 shell into the Workshop floor per `workshop-rc2.html`, Plateau both regimes,
tokens/lexicon only (the gate stays armed):

- **Door:** minimal register/login + writer-grant (dev) + pseudonym chip. Session token held
  in memory for AX2; cookie/persistence strategy is a named later decision, not an accident.
- **The Queue room** (lexicon: `queue.name` — "The Pile"): filter chips (rooms, hands), sort,
  cards exactly in RC2's shape — Scriptor line, word count, tags, "waiting N days · M readers
  so far", Claim button with live hold countdown; claimed state per RC2. Volumes render in
  their dashed lane with "Open by choice."
- **Reading Table (read-only this ticket):** claimed piece — title, tags, provenance line,
  collapsible board bundle (read-only), full text in prose face. A quiet placeholder where the
  composer will sit: "Your reading — arrives with the next ticket." No dead buttons.
- **My holds:** the active claims with countdowns; release action.
- Empty states in house voice (an empty Pile says something true, not "No data").

## 5. Fixtures — the seeded floor

`tools/seed-floor.ts` (dev-only; refuses to run when `NODE_ENV==='production'`): creates ~6
writer accounts and posts ~14 fixture pieces **through the real publish API** with valid
`wrizo-bridge/1` envelopes (varied rooms/hands/word counts, 2 Volumes, one piece at 7,499 and
one rejected at 7,501 to log the ceiling working). Fixture prose lives in
`tools/fixtures/*.txt` — original filler in the house's voice, a paragraph each is plenty.
No web upload form exists or ever will; the seed tool is the bridge's stand-in and says so in
its header comment.

## 6. Tests

- **API properties:** claimant-only text access (and volume exception); self-claim block with
  its audited reason row; 3-claim cap; per-piece duplicate-claim 409; lazy expiry (expired
  hold neither blocks re-claim nor grants text); tail-weighted ordering deterministic under
  fixture load; volumes excluded from queue list and deal; card serializer emits no linkage
  and no pseudonym.
- **E2E (Playwright, both reference widths, both regimes):** login → queue renders seeded
  cards from tokens → filter narrows → claim → countdown appears → Reading Table shows text
  and board bundle → release returns the card. Geometry floor: presence is not composition.

## 7. Acceptance — the first sitting

1. CI green: gate, build, migrate (001–005), test, e2e.
2. **One-command run on Nick's machine:** CC prepares the local env (Postgres, envs,
   `ALLOW_MEMORY_STORAGE=true`, seed) so that a single documented command brings up the floor
   seeded, and writes `docs/sittings/ax2-first-sitting.md` — a one-page script for Nick's
   hands: what to open, what to try, what to look at, where the edges are.
3. Report = push with SHAs, then stop. Fable's review at close (committed file), then Nick's
   explicit merge word (schema), then the device sitting proper.

**Out of scope:** composer/readings/ratings/credits (AX3); certificates page and anchor cron
(AX4); all Reading Room surfaces (AX5+); Railway deploy (separate word, separate day);
the Write-side bridge button (post-B-arc, Write repo).
