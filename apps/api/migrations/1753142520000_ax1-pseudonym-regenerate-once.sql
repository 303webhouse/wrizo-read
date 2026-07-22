-- Up Migration
-- AX1 migration 003 — pseudonym regenerate-once (brief §5). A reviewer may regenerate their
-- auto-assigned pseudonym exactly once; this flag records that the single regeneration is spent.
ALTER TABLE pseudonyms ADD COLUMN regenerated boolean NOT NULL DEFAULT false;

-- Down Migration
ALTER TABLE pseudonyms DROP COLUMN regenerated;
