-- Up Migration
-- AX1 migration 002 — sealing parity for the deposit ledger (Fable review item 2).
-- deposits.account_id is a second linkage-bearing column; it carries the same seeing-law
-- obligation as authorship.account_id and must be documented identically.
COMMENT ON COLUMN deposits.account_id IS
  'SEALED. Server-side only. Never included in any API payload. Every read is logged in archive_access_log.';
COMMENT ON TABLE deposits IS
  'Append-only deposit ledger. Content-addressed evidence, never verdict (foundations §9). account_id is sealed linkage — no endpoint may return it, on parity with authorship.';

-- Down Migration
COMMENT ON COLUMN deposits.account_id IS NULL;
COMMENT ON TABLE deposits IS NULL;
