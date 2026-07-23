import type { Pool, PoolClient } from "pg";
import { newId } from "./ids";

type Queryable = Pool | PoolClient;

// The seeing law (foundations §9): every read of sealed linkage is logged, with a reason — no
// silent access. The claim-time self-check is the AX2 caller (reason 'claim_self_check').
export async function auditLinkageRead(
  db: Queryable,
  params: { actor: string; tableName: string; submissionId: string; reason: string },
): Promise<void> {
  await db.query(
    `INSERT INTO archive_access_log (id, actor, table_name, submission_id, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [newId(), params.actor, params.tableName, params.submissionId, params.reason],
  );
}
