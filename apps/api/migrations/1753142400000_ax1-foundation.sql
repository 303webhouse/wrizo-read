-- Up Migration
-- AX1 migration 001 — foundation schema for Wrizo | Read (brief §3).
-- IDs are application-generated UUIDv7 (the `uuidv7` npm package) per brief §1; id columns are
-- typed uuid with no server default and the app supplies the value on insert. One migration per
-- schema change; no down-migration hand-waving (brief §1).

CREATE EXTENSION IF NOT EXISTS citext;

-- ————— Identity triptych (foundations §4) —————

CREATE TABLE accounts (
  id         uuid PRIMARY KEY,                                   -- UUIDv7, app-generated
  email      citext UNIQUE NOT NULL,
  status     text NOT NULL DEFAULT 'active'
             CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE credentials (
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'password' CHECK (kind IN ('password')),  -- magic-link may join later, no schema churn
  secret_hash text NOT NULL,                                                  -- argon2id
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, kind)
);

CREATE TABLE roles (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('reader', 'writer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, role)
);

-- The reviewer face: one persistent Workshop pseudonym per account; user-visible, not user-chosen.
CREATE TABLE pseudonyms (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,      -- unique per account
  name       text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id         uuid PRIMARY KEY,                                   -- UUIDv7, app-generated
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_account_id_idx ON sessions (account_id);

-- ————— The floor (foundations §5) —————

CREATE TABLE submissions (
  id               uuid PRIMARY KEY,                             -- UUIDv7, app-generated
  kind             text NOT NULL CHECK (kind IN ('queue', 'volume')),
  title            text NOT NULL,
  word_count       int  NOT NULL CHECK (word_count >= 0),        -- ceiling (7,500 for queue) enforced at intake, not by constraint (brief §3)
  status           text NOT NULL DEFAULT 'received'
                   CHECK (status IN ('received', 'queued', 'served', 'hung', 'withdrawn')),
  rooms            text[] NOT NULL,                              -- 1–2 rooms, enforced at intake
  hands            text[] NOT NULL DEFAULT '{}',                 -- 0–3 hands
  provenance       jsonb  NOT NULL,                              -- coarse only: {sessions:int, span_weeks:int, composed_in_wrizo:bool}
  board_bundle_key text NULL,                                    -- object-storage key, scrubbed render
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- THE LINKAGE TABLE. Sealed: no API ever returns account_id from here. Access is audited via
-- archive_access_log. Deanonymization is an event (the ceremonial claim door), never a toggle:
-- claimed_at stays NULL until the author claims the piece into their civic face.
CREATE TABLE authorship (
  submission_id uuid PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,  -- unique per piece
  account_id    uuid NOT NULL REFERENCES accounts(id),                          -- SEALED — never surfaced by any endpoint
  claimed_at    timestamptz NULL
);
COMMENT ON TABLE authorship IS
  'Sealed linkage between a submission and its Scriptor. No endpoint may return account_id from this table; reads are audited in archive_access_log. Per foundations.md §4 and §9 (the seeing law).';
COMMENT ON COLUMN authorship.account_id IS
  'SEALED. Server-side only. Never included in any API payload. Every read is logged in archive_access_log.';

-- ————— The Archive (foundations §9) —————

-- Append-only deposit ledger: content-addressed SHA-256 of canonical text, full snapshot to
-- object storage, server timestamp. Evidence, never verdict.
CREATE TABLE deposits (
  id               uuid PRIMARY KEY,                             -- UUIDv7, app-generated
  submission_id    uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  content_sha256   bytea NOT NULL,
  canonicalization text NOT NULL DEFAULT 'v1',
  snapshot_key     text NOT NULL,                                -- object-storage key, full snapshot
  account_id       uuid NOT NULL REFERENCES accounts(id),
  deposited_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deposits_submission_id_idx ON deposits (submission_id);

-- Daily chain-hash anchor for tamper evidence. AX4 wires the cron; the table lands now (brief §3).
CREATE TABLE anchor_log (
  day          date PRIMARY KEY,
  chain_sha256 bytea NOT NULL,
  computed_at  timestamptz NOT NULL DEFAULT now()
);

-- Every read of the sealed linkage is logged here. The seeing law: no silent access — a reason
-- is required on every row.
CREATE TABLE archive_access_log (
  id            uuid PRIMARY KEY,                                -- UUIDv7, app-generated
  actor         text NOT NULL,                                   -- who looked (system principal or operator)
  table_name    text NOT NULL,                                   -- which sealed table was read
  submission_id uuid NULL REFERENCES submissions(id) ON DELETE SET NULL,
  reason        text NOT NULL,
  at            timestamptz NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE IF EXISTS archive_access_log;
DROP TABLE IF EXISTS anchor_log;
DROP TABLE IF EXISTS deposits;
DROP TABLE IF EXISTS authorship;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS pseudonyms;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS credentials;
DROP TABLE IF EXISTS accounts;
-- The citext extension is left in place intentionally; drop it by hand if truly tearing down.
