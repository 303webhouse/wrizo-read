import type { Pool } from "pg";
import { ApiError } from "../errors";
import { newId } from "../ids";
import { auditLinkageRead } from "../audit";
import { serializeClaim, type ClaimView } from "../serialize";

const MAX_ACTIVE_CLAIMS = 3;
const UNIQUE_VIOLATION = "23505";

export async function hasActiveClaim(
  pool: Pool,
  accountId: string,
  submissionId: string,
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM claims
      WHERE submission_id = $1 AND account_id = $2 AND released_at IS NULL AND expires_at > now()`,
    [submissionId, accountId],
  );
  return Boolean(result.rowCount);
}

export async function claim(
  pool: Pool,
  accountId: string,
  submissionId: string,
): Promise<ClaimView> {
  // Piece must exist and be a claimable queue piece (no linkage read yet).
  const piece = await pool.query(`SELECT kind, status FROM submissions WHERE id = $1`, [submissionId]);
  const p = piece.rows[0];
  if (!p) throw new ApiError("not_found", 404);
  if (!(p.kind === "queue" && p.status === "received")) throw new ApiError("not_claimable", 409);

  // Self-claim block: the ONE authorship read, at claim time, audited (brief §2). Done on the pool
  // (auto-commit) BEFORE the hold transaction — the seeing-law audit must persist even when the
  // claim is refused (own_piece), so it must not ride inside a transaction that rolls back.
  await auditLinkageRead(pool, {
    actor: accountId,
    tableName: "authorship",
    submissionId,
    reason: "claim_self_check",
  });
  const authorship = await pool.query(`SELECT account_id FROM authorship WHERE submission_id = $1`, [
    submissionId,
  ]);
  if (authorship.rows[0]?.account_id === accountId) throw new ApiError("own_piece", 409);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lazily release this reader's own EXPIRED hold on the piece so it never blocks a re-claim.
    await client.query(
      `UPDATE claims SET released_at = expires_at
        WHERE submission_id = $1 AND account_id = $2 AND released_at IS NULL AND expires_at <= now()`,
      [submissionId, accountId],
    );

    // Already holds a live (non-expired) claim on this piece?
    const dup = await client.query(
      `SELECT 1 FROM claims
        WHERE submission_id = $1 AND account_id = $2 AND released_at IS NULL AND expires_at > now()`,
      [submissionId, accountId],
    );
    if (dup.rowCount) throw new ApiError("already_claimed", 409);

    // Cap: at most 3 live holds per account.
    const active = await client.query(
      `SELECT count(*)::int AS n FROM claims
        WHERE account_id = $1 AND released_at IS NULL AND expires_at > now()`,
      [accountId],
    );
    if ((active.rows[0]?.n ?? 0) >= MAX_ACTIVE_CLAIMS) {
      throw new ApiError("claim_limit", 409, { limit: MAX_ACTIVE_CLAIMS });
    }

    const inserted = await client.query(
      `INSERT INTO claims (id, submission_id, account_id, claimed_at, expires_at)
       VALUES ($1, $2, $3, now(), now() + interval '4 hours')
       RETURNING submission_id, claimed_at, expires_at`,
      [newId(), submissionId, accountId],
    );
    await client.query("COMMIT");
    const row = inserted.rows[0];
    if (!row) throw new ApiError("claim_failed", 500);
    return serializeClaim(row);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err && typeof err === "object" && "code" in err && err.code === UNIQUE_VIOLATION) {
      throw new ApiError("already_claimed", 409); // concurrent claim raced the unique index
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function release(
  pool: Pool,
  accountId: string,
  submissionId: string,
): Promise<void> {
  const result = await pool.query(
    `UPDATE claims SET released_at = now()
      WHERE submission_id = $1 AND account_id = $2 AND released_at IS NULL AND expires_at > now()`,
    [submissionId, accountId],
  );
  if (!result.rowCount) throw new ApiError("no_active_claim", 404);
}

export async function myClaims(pool: Pool, accountId: string): Promise<ClaimView[]> {
  const result = await pool.query(
    `SELECT submission_id, claimed_at, expires_at FROM claims
      WHERE account_id = $1 AND released_at IS NULL AND expires_at > now()
      ORDER BY expires_at ASC`,
    [accountId],
  );
  return result.rows.map(serializeClaim);
}
