# AX1 — Fable's Review at Close

**Ticket:** AX1 (scaffold → full acceptance) · **Branch:** `ax1-scaffold`, tip `5d1fc49`, unmerged
**Reviewed:** July 22, 2026 · **Verdict:** **PASS, conditional on three pre-merge fixes below.**
Merge word remains Nick's, per schema law, after the fix commits land and CI re-greens.

## 1. Verification

All eight acceptance SHAs verified on the branch atop `c35cecc`: `8c88974` contracts ·
`d3a4a12` migrations 002/003 · `003f1a7` auth · `42b018d` intake+seal · `b29ca93`
verify-deposit · `fa36ce2` property suite · `924dd41` web e2e · `5d1fc49` CI+docs. `main`
still holds only the AX0 seed. Branch discipline exact.

Surfaces read line-by-line: migrations 001–003; `bridge.ts`; `canonical.ts`;
`intake/pipeline.ts`; `serialize.ts`; `storage.ts`; `config.ts`; `auth/sessions.ts`;
test census (5 files); `e2e/geometry.spec.ts`; CI workflow. CI green on all four jobs at tip.

## 2. Prior review items — closed

**Item 1 (strict nesting): closed exactly.** `Provenance`, `BoardBundle`, `BoardCard` are
`.strict()`; unknown keys anywhere are rejected, not stripped; asserted at unit and
end-to-end level (`contract-strict.test.ts`, integration seeing-law case).

**Item 2 (sealing parity): closed exactly.** Migration 002 places the verbatim sealed
comment on `deposits.account_id` plus a table comment naming parity with `authorship`.
`serialize.ts` builds public views field-by-field from a whitelist — no row spreads — with a
unit test per linkage-bearing table, and the integration suite proves the id is stored in
both tables yet returned by no endpoint.

## 3. What holds (read, not just reported)

The intake pipeline is correct in the ways that matter: it canonicalizes before counting and
hashing; enforces the 7,500 queue ceiling with a typed 422 on the canonical count; writes the
snapshot (and a whitelist-rebuilt board bundle) **before** the transaction so a deposit row can
never exist without its snapshot, with the orphan rationale stated; inserts submissions,
authorship, and deposits in one transaction with rollback; and returns a receipt carrying no
linkage. The server-side 10/day rate limit is typed. Canonicalization v1 is pure and shared, so
`tools/verify-deposit.ts` reproduces the Archive's hash outside the server — proven by the
parity test. Auth is real and minimal: argon2id, session expiry and account-status checks on
every resolve, role guards, and the two-word collision-checked pseudonym with regenerate-once
made structural by migration 003. The e2e harness asserts token-driven render (same key, both
regimes), lexicon resolution ("The Pile" via `lex()`), and real, ordered, non-overflowing boxes
at both reference widths — presence is not composition, honored.

**Judgment calls ruled:** UUIDv7 app-side — accepted, brief §1 sanctions it. The storage
interface with injectable adapters — right design; the fallback's *gating* is Finding A.

## 4. Findings — fix before merge

**A. Silent MemoryStorage fallback in production (must-fix).** `createStorage` falls back to
in-memory whenever S3 env is unset, and nothing gates it to dev/test. A production boot with
missing or typoed `S3_*` would issue receipts and hashes while snapshots evaporate on restart —
an Archive that lies by omission, the one failure mode a ledger cannot have. Fail closed: throw
at startup when `NODE_ENV === "production"` (or absent an explicit
`ALLOW_MEMORY_STORAGE=true`) and S3 config is incomplete. A boot-time guard plus one unit test.

**B. Bearer token is a UUIDv7 (must-fix).** `createSession` mints the session id with
`newId()`; a v7 UUID is a 48-bit public timestamp plus ~74 random bits — half the credential is
guessable and the entropy sits below the 128-bit floor for bearer secrets. Mint tokens with
`crypto.randomBytes(32)` (base64url) and store as text: migration 004 alters `sessions.id`
to `text` (cheap today, painful after real users). Sealed doors deserve a full-strength key.

**C. Canonicalization comment overclaims (comment-only, but before merge).** `canonical.ts`
says "no leading/trailing blank padding"; the code preserves leading blank lines. The behavior
is fine — but v1 freezes forever the day the first real deposit lands, and the code is the
spec. True the comment to the code; do not change behavior.

**Notes, no action required:** rate-limit check-then-insert race is acceptable at this scale
(edge limiting is infra, as commented); expired-session cleanup can ride the jobs table in a
later ticket; the e2e spec's rgb mirrors of tokens.json live outside the gate's scan scope by
design and are acceptable as test oracles.

## 5. Path to merge

1. CC lands A, B (with migration 004), and C; pushes; CI re-greens.
2. Fable spot-verifies the three diffs (not a re-walk).
3. Nick's explicit merge word — schema ticket law — merges `ax1-scaffold` → `main`.
4. Deploy is a separate word and a separate day: Railway project setup for Read is not part
   of AX1 and ships no earlier than AX2 planning.

*Filed by Fable. Relay target: `docs/reviews/ax1-review.md` on `ax1-scaffold` (so the review
merges with the work it reviews).*
