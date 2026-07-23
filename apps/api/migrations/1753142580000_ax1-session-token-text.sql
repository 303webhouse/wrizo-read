-- Up Migration
-- AX1 migration 004 (Fable review finding B): bearer session tokens are now 256-bit random values
-- (crypto.randomBytes(32), base64url), not UUIDv7 — a v7 UUID exposes a timestamp and carries
-- sub-128-bit entropy, below the floor for a bearer secret. Store the id as text. Cheap now,
-- painful after real users exist.
ALTER TABLE sessions ALTER COLUMN id TYPE text USING id::text;

-- Down Migration
-- Reverting to uuid cannot cast base64url tokens; clear the ephemeral sessions first (this logs
-- everyone out) so the column can return to uuid. No hand-waving — the reversal is explicit.
DELETE FROM sessions;
ALTER TABLE sessions ALTER COLUMN id TYPE uuid USING id::uuid;
