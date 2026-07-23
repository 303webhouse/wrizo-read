import type { PoolClient } from "pg";
import { ApiError } from "../errors";

// The reviewer face: a persistent, two-word Workshop pseudonym. Auto-generated at writer-role
// grant; user-visible, not user-chosen; one regeneration allowed (brief §5).
const ADJECTIVES = [
  "Quiet", "Marginal", "Patient", "Candid", "Steady", "Errant", "Lucid", "Wry",
  "Deft", "Sundry", "Fervent", "Tacit", "Nimble", "Solemn", "Ardent", "Vagrant",
];
const NOUNS = [
  "Harbor", "Ledger", "Lantern", "Meridian", "Quill", "Threshold", "Cairn", "Refrain",
  "Plateau", "Stanza", "Almanac", "Compass", "Vellum", "Cadence", "Beacon", "Folio",
];

function pick<T>(list: readonly T[]): T {
  const item = list[Math.floor(Math.random() * list.length)];
  // list is a non-empty literal; the index is always in range.
  return item as T;
}

export function generateName(): string {
  return `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
}

const MAX_ATTEMPTS = 24;

/** Insert a fresh, collision-checked pseudonym for an account. Idempotent-safe on the caller. */
export async function assignPseudonym(client: PoolClient, accountId: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const name = generateName();
    const result = await client.query(
      `INSERT INTO pseudonyms (account_id, name) VALUES ($1, $2)
       ON CONFLICT (name) DO NOTHING
       RETURNING name`,
      [accountId, name],
    );
    if (result.rowCount && result.rows[0]) return result.rows[0].name as string;
  }
  throw new ApiError("pseudonym_generation_failed", 500);
}

/** Regenerate a reviewer's pseudonym exactly once. Spends the single allowance (migration 003). */
export async function regeneratePseudonym(client: PoolClient, accountId: string): Promise<string> {
  const current = await client.query(
    `SELECT regenerated FROM pseudonyms WHERE account_id = $1`,
    [accountId],
  );
  if (!current.rowCount) throw new ApiError("no_pseudonym", 404);
  if (current.rows[0]?.regenerated) throw new ApiError("pseudonym_regeneration_spent", 409);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const name = generateName();
    const result = await client.query(
      `UPDATE pseudonyms SET name = $2, regenerated = true
       WHERE account_id = $1 AND NOT EXISTS (SELECT 1 FROM pseudonyms p2 WHERE p2.name = $2)
       RETURNING name`,
      [accountId, name],
    );
    if (result.rowCount && result.rows[0]) return result.rows[0].name as string;
  }
  throw new ApiError("pseudonym_generation_failed", 500);
}
