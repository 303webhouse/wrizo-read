-- Up Migration
-- AX3 migration 006 — readings, ratings, and the credit ledger (brief §1). The account_id columns
-- here are INTERNAL, not sealed like authorship: a reading's public attribution is the reviewer
-- pseudonym (the pseudonym IS the disclosure), so these are not audited — but the raw account id
-- still never appears in any API payload.

CREATE TABLE readings (
  id            uuid PRIMARY KEY,                                 -- UUIDv7 (newId())
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES accounts(id),
  body          text NOT NULL,
  word_count    int  NOT NULL CHECK (word_count >= 0),
  filed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, account_id)                             -- one reading per reader per piece
);
COMMENT ON COLUMN readings.account_id IS
  'INTERNAL. Never in any API payload; public attribution is the reviewer pseudonym only. Not sealed or audited like authorship.';

CREATE TABLE reading_ratings (
  id               uuid PRIMARY KEY,
  reading_id       uuid NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
  rater_account_id uuid NOT NULL REFERENCES accounts(id),
  rater_kind       text NOT NULL CHECK (rater_kind IN ('author', 'peer')),
  value            text NOT NULL CHECK (value IN ('useful', 'somewhat')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reading_id, rater_account_id)                          -- one rating per rater per reading
);
COMMENT ON COLUMN reading_ratings.rater_account_id IS
  'INTERNAL. Never in any API payload.';

-- Append-only. Balance is SUM(delta). foundations §6, the anti-molarization law: one currency,
-- a fixed price list, forever. All prices live in economy.ts with the clause quoted.
CREATE TABLE credit_ledger (
  id            uuid PRIMARY KEY,
  account_id    uuid NOT NULL REFERENCES accounts(id),
  delta         int  NOT NULL,
  reason        text NOT NULL CHECK (reason IN ('reading_filed', 'queue_post', 'volume_post', 'dev_grant')),
  reading_id    uuid NULL REFERENCES readings(id) ON DELETE SET NULL,
  submission_id uuid NULL REFERENCES submissions(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN credit_ledger.account_id IS
  'INTERNAL, own-data only. Never in any payload beyond the owning account /credits view.';
CREATE INDEX credit_ledger_account_idx ON credit_ledger (account_id);

-- Down Migration
DROP TABLE IF EXISTS credit_ledger;
DROP TABLE IF EXISTS reading_ratings;
DROP TABLE IF EXISTS readings;
