-- Up Migration
-- AX2 migration 005 — the claims ledger (brief §1). A claim is a four-hour hold a reader places
-- on a queue piece. Claims are references, not bearer secrets: ids are app-generated UUIDv7
-- (newId()). Expiry is lazy — queries treat expires_at <= now() and released_at IS NULL as
-- released; no cron this ticket.

CREATE TABLE claims (
  id            uuid PRIMARY KEY,                                  -- UUIDv7, app-generated (newId())
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES accounts(id),            -- SEALED linkage (parity w/ authorship, deposits)
  claimed_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,                             -- claimed_at + 4h
  released_at   timestamptz NULL                                  -- explicit release; expiry is lazy
);

COMMENT ON COLUMN claims.account_id IS
  'SEALED. Server-side only. Never included in any API payload. Reads that expose it are logged in archive_access_log.';
COMMENT ON TABLE claims IS
  'Four-hour reader holds on queue pieces. account_id is sealed linkage on parity with authorship and deposits; no endpoint returns it. Expiry is lazy.';

CREATE INDEX claims_submission_active_idx ON claims (submission_id) WHERE released_at IS NULL;
CREATE INDEX claims_account_active_idx ON claims (account_id) WHERE released_at IS NULL;

-- At most one unreleased claim per (submission_id, account_id). Because expiry is lazy, the claim
-- path first lazily releases the reader's own expired hold on the piece before inserting a new one,
-- so an expired hold never blocks a re-claim (brief §2).
CREATE UNIQUE INDEX claims_one_active_per_reader_idx
  ON claims (submission_id, account_id) WHERE released_at IS NULL;

-- Down Migration
DROP TABLE IF EXISTS claims;
