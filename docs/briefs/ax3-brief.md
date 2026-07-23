# AX3 — Readings: the Composer, the Seal, Ratings, and the Credit Economy

**Repo:** `303webhouse/wrizo-read` · **Branch:** `ax3-readings` off `main`. **Schema notice:**
AX3 adds schema (readings, ratings, the credit ledger); build may proceed, merge requires
Nick's explicit word at close. **Ratification rider:** AX3 operationalizes the self-knowledge
clause (seeing law, foundations §9) in new places; the clause must be ratified by Nick no
later than the AX3 merge word. Report = push. One checkout; never the Write tree.

Read first: `docs/foundations/foundations.md` §5 (floor laws), §6 (anti-molarization), §9
(seeing law); `docs/rc/workshop-rc2.html` (Reading Table + composer); `docs/reviews/
ax2-review.md` §4 (the three riding notes, folded in below).

## 0. Scope in one sentence

A reader files a reading through a paste-railed composer; the floor's other readings unseal
only then (server-enforced); authors and fellow readers rate usefulness; filing earns the
credit that posting spends — the whole economy live, tested, and touchable at the sitting.

## 1. Schema (one migration: 006)

```sql
readings (
  id            uuid pk,                          -- uuidv7 (newId())
  submission_id uuid not null references submissions(id) on delete cascade,
  account_id    uuid not null references accounts(id),
                -- INTERNAL. Public attribution is the reviewer face (pseudonym) ONLY.
                -- Not sealed like authorship (the pseudonym IS the disclosure), but the
                -- account id itself never appears in any payload. COMMENT accordingly.
  body          text not null,
  word_count    int  not null,                    -- of the body, countWords()
  filed_at      timestamptz not null default now(),
  unique (submission_id, account_id)              -- one reading per reader per piece
)

reading_ratings (
  id                uuid pk,
  reading_id        uuid not null references readings(id) on delete cascade,
  rater_account_id  uuid not null references accounts(id),   -- INTERNAL, same comment
  rater_kind        text not null check (rater_kind in ('author','peer')),
  value             text not null check (value in ('useful','somewhat')),
  created_at        timestamptz not null default now(),
  unique (reading_id, rater_account_id)
)

credit_ledger (
  id            uuid pk,
  account_id    uuid not null references accounts(id),       -- INTERNAL, own-data only
  delta         int  not null,
  reason        text not null check (reason in ('reading_filed','queue_post','volume_post','dev_grant')),
  reading_id    uuid null references readings(id),
  submission_id uuid null references submissions(id),
  created_at    timestamptz not null default now()
)
```

Append-only ledger; balance is `SUM(delta)`. Index `credit_ledger(account_id)`. The
anti-molarization law travels in code: all prices live in one `economy.ts` constants file with
foundations §6 quoted above them — `READING_EARNS = 1`, `QUEUE_COSTS = 2`, `VOLUME_COSTS = 4`,
`READING_FLOOR_WORDS = 120`. `dev_grant` exists for the non-production faucet only (§5).

## 2. The laws of filing (server-side)

- **Who may file:** an active claimant, for a queue piece (expired hold → re-claim first,
  lazy expiry already allows it); any writer, for a Volume. Never the piece's own author —
  the self-check mirrors AX2's claim path exactly: one authorship read at file time, audited
  on the pool (`reason='reading_self_check'`), persisting even on refusal (`own_piece` 409).
- **The floor's minimum:** body `>= 120` words or typed 422 `reading_too_short` (no credit,
  nothing stored). At or above it, the reading is accepted on filing — the rating economy,
  not a gatekeeper, is the quality mechanism (foundations; the Pedagogue's ruling).
- **Filing is one transaction:** insert reading + insert `credit_ledger`
  (`+1, 'reading_filed'`). The response is the reader's own ReadingView plus their new
  balance.
- One reading per reader per piece (the unique constraint; typed 409 `already_filed`).
  Editing/retracting readings is out of scope — a filed reading stands (flags arrive AX7).

## 3. The Seal (the crown law of this ticket)

`GET /pieces/:id/readings` returns one of two shapes, decided server-side:

- **Sealed** — `{ sealed: true, count: N }` — when the requester has no filed reading on the
  piece and is not its author. The count is public; the bodies are not in the payload, full
  stop.
- **Unsealed** — `{ sealed: false, readings: ReadingView[] }` — when the requester has filed
  on this piece, **or is the piece's author** (readings exist *for* the author; authors never
  file on their own piece and are never sealed out of it).

The author check reads authorship scoped to the requester's own account — self-knowledge
clause, no audit row (this is one of the two new reliances named in the header). ReadingView:
`{ reading_id, reader_name (pseudonym), body, word_count, filed_at, own: boolean }` — never an
account id, never the Scriptor. Sealing is tested as an API property at the string level: the
sealed payload must not contain any reading body's text anywhere.

## 4. Ratings

`POST /readings/:id/rate { value: 'useful' | 'somewhat' }`. Server determines `rater_kind`:
`author` if the rater is the piece's author (self-knowledge-scoped check — the second new
reliance), else `peer`. Eligibility mirrors the seal: an author may always rate readings on
their own piece; a peer may rate only readings they can see (i.e., they have filed on that
piece). Nobody rates their own reading (`own_reading` 409). One rating per rater per reading
(upsert is fine: re-rating replaces). Aggregates and laurels are AX7 — AX3 stores ratings and
returns simple per-reading counts to the reading's owner only.

## 5. The economy at the door (intake changes)

The publish pipeline gains the credit gate, in this order: validate → canonicalize → **ceiling**
→ **credits** → snapshot → transaction. A piece refused at the ceiling burns nothing.

- Inside the intake transaction, take a per-account advisory lock
  (`pg_advisory_xact_lock(hashtext(account_id))`), compute the balance, and refuse with typed
  409 `insufficient_credits { needed, held }` — no submission, no deposit, no snapshot row
  consequences (snapshot uploaded pre-transaction is the harmless orphan, as established).
  Sufficient → insert the ledger debit (`-2 queue_post` / `-4 volume_post`) in the same
  transaction as submissions/authorship/deposits. The lock closes the double-spend race;
  test it with two concurrent posts on a 2-credit account: exactly one succeeds.
- **No starter credits.** Review-before-post is constitutional; the door opens by reading.
- **The dev faucet:** `POST /api/v1/dev/credits { amount }` registered **only when
  `NODE_ENV !== 'production'`** (the ALLOW_MEMORY_STORAGE pattern), reason `dev_grant`.
  seed-floor and the test suites use it; production never has the route at all.
- `GET /api/v1/workshop/credits` → `{ balance, recent: LedgerEntry[] }` — own data only.

**Flagged, not solved here (foundations amendment for launch planning):** the genesis policy —
how the first pieces enter an empty production floor when no one yet holds a credit. Named in
the report so it reaches Nick's docket; out of scope for AX3.

## 6. Riding notes from the AX2 review (all three land)

1. **UUID path params validated** (`/pieces/:id`, `/claims/:id/release`, `/readings/:id/…`):
   non-UUIDs → typed 404/400, never a Postgres 22P02 500.
2. **Loud missing snapshot:** a deposit whose snapshot `get()` returns null is a
   ledger-integrity event — typed 500 `snapshot_missing`, logged. Always, every environment.
3. **Expiry as auto-release in the UI:** My holds and the Reading Table present an expired
   hold as "returned to the floor," so the release-expired 404 never reaches a user's eyes.

## 7. Web — the composer and the live economy

Per `workshop-rc2.html`, tokens/lexicon only, both regimes, the gate armed:

- **The composer** on the Reading Table: prose-face textarea; the paste rail (paste is
  prevented; the rail note flares exactly as in RC2 — "the floor reads human"); a plain
  word-count sentence, no meter ("214 words — the floor asks at least 120"); **File your
  reading** enabled at the floor.
- **The seal, live:** before filing, the sealed box with its count; on filing, the composer
  collapses to its filed state, the floor's readings unseal in place, and rating controls
  render where eligible (peer after filing; author always, on others' readings of their own
  piece).
- **The credit chip** in the door header updates live on filing (+1) with a quiet line, not a
  celebration. `GET /credits` backs it.
- Empty and error states in house voice, including `snapshot_missing` and the
  expiry-as-auto-release copy.

## 8. Fixtures & tests

- **seed-floor grows an economy act:** faucet-fund the six writers; pre-file a spread of
  readings (so several pieces carry sealed counts and "M readers" varies); leave one writer
  holding exactly 1 credit and log their queue post refused `insufficient_credits`, beside the
  ceiling refusal already in the log. Fixture reading prose: original, house voice, ≥120 words.
- **API properties (the suite grows ~14):** seal shapes both ways incl. the string-level
  no-bodies assertion; author unsealed without filing; reading self-check audited on refusal;
  claim-required for queue filing (and volume exemption); 120-word floor typed refusal, no
  credit; +1 on filing; one-reading-per-piece 409; rating eligibility matrix (author / filed
  peer / unfiled peer / own reading); double-spend race — exactly one of two concurrent
  2-credit posts lands; ceiling-before-credits (7,501 burns nothing); insufficient_credits
  leaves zero rows; UUID path-param 404s; snapshot_missing 500.
- **E2E (both widths, both regimes):** login → claim → Reading Table → paste blocked with the
  rail note → type past the floor → file → seals open on two pre-filed readings → rate one →
  credit chip ticks to 1. The spec seeds its own pieces/readings/credits via API + faucet with
  a per-run nonce, as established.

## 9. Acceptance — the second sitting

1. CI green: gate · build · migrate (001–006) · test · e2e.
2. `pnpm floor` still one command, now seeding the economy act; **docs/sittings/
   ax3-second-sitting.md** — one page for Nick's hands: file a reading, watch the seal open,
   rate, watch the chip, and find the two refusals (ceiling, credits) in the seed log.
3. Report = push with SHAs, then stop for Fable's review at close (committed file) → Nick's
   explicit merge word (schema; self-knowledge clause ratifies with it at the latest) → the
   device sitting.

**Out of scope:** flags and the committee, laurels aggregation and tiers (AX7); resubmission
lineage (backlog); the genesis policy (flagged above); certificates page and anchor cron
(AX4); Reading Room (AX5+); Railway deploy (separate word, separate day); the Write-side
bridge button (post-B-arc, Write repo).
