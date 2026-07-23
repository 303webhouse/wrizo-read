import type { Pool, PoolClient } from "pg";
import { newId } from "./ids";
import { type LedgerEntry, serializeLedger } from "./serialize";

type Queryable = Pool | PoolClient;

export type LedgerReason = "reading_filed" | "queue_post" | "volume_post" | "dev_grant";

// Balance is SUM(delta) over the append-only ledger (brief §1). No starter credits — the door
// opens by reading (foundations §6; review-before-post is constitutional).
export async function balance(db: Queryable, accountId: string): Promise<number> {
  const r = await db.query(
    `SELECT COALESCE(SUM(delta), 0)::int AS n FROM credit_ledger WHERE account_id = $1`,
    [accountId],
  );
  return r.rows[0]?.n ?? 0;
}

export async function record(
  db: Queryable,
  entry: {
    accountId: string;
    delta: number;
    reason: LedgerReason;
    readingId?: string | null;
    submissionId?: string | null;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO credit_ledger (id, account_id, delta, reason, reading_id, submission_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [newId(), entry.accountId, entry.delta, entry.reason, entry.readingId ?? null, entry.submissionId ?? null],
  );
}

export async function recent(
  db: Queryable,
  accountId: string,
  limit = 20,
): Promise<LedgerEntry[]> {
  const r = await db.query(
    `SELECT delta, reason, reading_id, submission_id, created_at
       FROM credit_ledger
      WHERE account_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [accountId, limit],
  );
  return r.rows.map(serializeLedger);
}
