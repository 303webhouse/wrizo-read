# AX1 — Scaffold, Token Matrix, Identity, Publish API + Archive Intake

**Repo:** `303webhouse/wrizo-read` (create; private). **Agent rule:** this repo gets its own
checkout — never share a tree with the Write repo. **Schema notice:** AX1 contains schema; the
build may proceed, but merge requires Nick's explicit word per house law. Report = push.

Read `docs/foundations/foundations.md` before writing any code. It is constitutional.

## 0. Scope

Four slices, one ticket: (a) repo + service scaffold, (b) theme × regime token architecture
(Plateau day/night only, full contract), (c) identity triptych schema + auth, (d) `POST
/api/v1/workshop/submissions` with Archive deposit at intake. No UI beyond a minimal authed
shell proving tokens render; the RC files in `docs/rc/` are the visual north star for later
tickets, not this one.

## 1. Stack

- **Server:** Node 20 + TypeScript, Fastify (or Express if Fastify fights Railway), Postgres 16
  on Railway. Server-first; SSR comes with the Reading Room in AX5 (plan for it: keep rendering
  concerns out of API modules).
- **Client shell:** React + TypeScript + Vite, single workspace monorepo (`apps/api`,
  `apps/web`, `packages/tokens`, `packages/contracts`).
- **IDs:** UUIDv7 everywhere (`uuidv7` npm or pg function). **Migrations:** node-pg-migrate,
  committed under `apps/api/migrations/`, one migration per schema change, no down-migration
  hand-waving.
- **Object storage:** S3-compatible from day one (Railway bucket or Cloudflare R2). Env-driven;
  no filesystem snapshots.

## 2. Token architecture (`packages/tokens`)

- Source of truth: `tokens.json` — `{ theme: { regime: { color: {...}, type: {...}, geometry:
  {...}, motion: {...} } } }` plus `lexicon: { theme: { key: string } }`.
- Build step emits CSS custom properties scoped to `[data-theme][data-regime]` on `<html>`, and
  a typed `lex(key)` helper for copy strings. Client sets `data-theme="plateau"` and
  `data-regime="day" | "night"`.
- **Ship Plateau day + Plateau night only.** Structure must accept new theme/regime sets as pure
  data (adding `flux` = editing `tokens.json`, zero component changes).
- **Zero hard-coded values law, enforced:** add a lint/CI check that fails on raw hex colors,
  px font sizes, or string literals for lexicon keys inside `apps/web/src/**` (allowlist:
  `packages/tokens`). This check is part of AX1's acceptance.
- Lane law encoded as semantic tokens: `--door`, `--door-deep`, `--evental`, `--press`,
  `--ground`, `--panel`, `--ink`, `--soft`, `--rule`, `--seal`. Components consume semantics
  only, never palette entries.
- Lexicon seed: `queue.name` → plateau "The Pile" (flux "Degree Zero", machina "Intake" present
  in the table but unarmed).

## 3. Schema (migration 001)

```sql
accounts        (id uuidv7 pk, email citext unique, created_at, status)
credentials     (account_id fk, kind, secret_hash, created_at)         -- argon2id
roles           (account_id fk, role text check in ('reader','writer'))
pseudonyms      (account_id fk unique, name text unique, created_at)   -- reviewer face
sessions        (id, account_id fk, expires_at, created_at)

submissions     (id uuidv7 pk, kind text check in ('queue','volume'),
                 title text, word_count int, status text,
                 rooms text[], hands text[],
                 provenance jsonb,           -- coarse only: {sessions:int, span_weeks:int, composed_in_wrizo:bool}
                 board_bundle_key text null, -- object-storage key, scrubbed render
                 created_at timestamptz)

authorship      (submission_id fk unique, account_id fk, claimed_at timestamptz null)
                 -- THE LINKAGE TABLE. Sealed: no API ever returns account_id from here.
                 -- Access is audited (see archive_access_log). Row-level comment required.

deposits        (id uuidv7 pk, submission_id fk, content_sha256 bytea,
                 canonicalization text default 'v1', snapshot_key text,
                 deposited_at timestamptz, account_id fk)
anchor_log      (day date pk, chain_sha256 bytea, computed_at)         -- daily job, AX4 wires cron; table lands now
archive_access_log (id, actor, table_name, submission_id, reason, at)
```

Word-count ceiling (7,500 for `kind='queue'`) enforced server-side at intake, not by check
constraint alone — reject with a typed error.

## 4. Publish API (the bridge, Read side)

`POST /api/v1/workshop/submissions` — bearer auth (writer role).

Request (versioned contract in `packages/contracts`, zod-validated):

```ts
{ contract: "wrizo-bridge/1", kind: "queue" | "volume",
  title: string, text: string,                    // canonical UTF-8
  rooms: string[], hands: string[],               // 1–2 rooms, 0–3 hands
  provenance: { sessions: number, span_weeks: number, composed_in_wrizo: true },
  board_bundle?: { format: "wrizo-board/1", cards: {title: string, body: string}[] } }
```

Intake pipeline, transactional: validate → canonicalize text (NFC, LF, trim trailing ws) →
SHA-256 → store snapshot + optional scrubbed board bundle to object storage → insert
`submissions`, `authorship`, `deposits` → return receipt `{ submission_id, deposit_id,
content_sha256, deposited_at }`. The receipt is the writer-facing proof; no linkage data in any
response. **No web upload form exists or ever will** — this endpoint accepts the bridge
contract only.

Rate limit: 10 submissions/account/day at the edge. Provenance is stored as received and coarse;
reject envelopes carrying finer-than-session timing (seeing law).

## 5. Auth (minimal, real)

Email + password (argon2id) with server sessions is sufficient for AX1; magic-link can replace
it later without schema churn. Pseudonym auto-generated at writer-role grant (two-word
generator, collision-checked); user-visible, not user-chosen, regenerate-once allowed.

## 6. Harness floor

- API property tests: sealed-authorship (no endpoint leaks `authorship.account_id`), ceiling
  rejection, canonicalization stability (same text, same hash, across encodings), deposit
  atomicity (no submission without deposit).
- Rendered-geometry checks for the web shell at both reference widths (laptop and tablet —
  house law: presence is not composition), asserting token-driven render in both regimes.
- CI runs the zero-hard-coded-values check, migrations against a scratch Postgres, and the
  property suite. Harness checks set their mode explicitly; no fixture defaults.

## 7. Acceptance

1. Fresh clone → `pnpm i && pnpm dev` boots api + web against local Postgres with documented env.
2. Token matrix demonstrably data-driven: adding a dummy theme in `tokens.json` re-renders the
   shell with zero component edits (prove in the report, then remove the dummy).
3. Bridge endpoint round-trips the contract and returns a valid receipt; hash reproducible by
   an independent script committed at `tools/verify-deposit.ts`.
4. Sealed-linkage and ceiling property tests green; CI green; report = push with commit SHAs.

**Out of scope:** queue serving, claims, readings, credits (AX2–AX3); certificates page and
anchor cron (AX4); all Reading Room surfaces (AX5+); the Write-side button (separate ticket,
post-B-arc).
