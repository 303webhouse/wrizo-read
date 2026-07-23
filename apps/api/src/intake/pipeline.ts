import { createHash } from "node:crypto";
import type { Pool } from "pg";
import {
  CANONICALIZATION_VERSION,
  canonicalize,
  countWords,
  type Receipt,
  type SubmissionEnvelope,
} from "@wrizo/contracts";
import { ApiError } from "../errors";
import { newId } from "../ids";
import { balance, record } from "../credits";
import { postCost } from "../economy";
import type { Storage } from "../storage";

const QUEUE_WORD_CEILING = 7500;
const DAILY_SUBMISSION_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface IntakeDeps {
  pool: Pool;
  storage: Storage;
}

// Transactional intake (brief §4): validate (done at the route) -> canonicalize -> SHA-256 ->
// store snapshot + optional scrubbed board bundle -> insert submissions, authorship, deposits ->
// return receipt. No linkage data in the response, ever.
export async function runIntake(
  deps: IntakeDeps,
  envelope: SubmissionEnvelope,
  accountId: string,
): Promise<Receipt> {
  const canonical = canonicalize(envelope.text);
  const wordCount = countWords(canonical);

  // Ceiling enforced server-side with a typed error, not by check constraint alone (brief §3).
  if (envelope.kind === "queue" && wordCount > QUEUE_WORD_CEILING) {
    throw new ApiError("queue_ceiling_exceeded", 422, {
      ceiling: QUEUE_WORD_CEILING,
      word_count: wordCount,
    });
  }

  // Rate limit: 10 submissions/account/day (brief §4). Server-side count; edge limiting is infra.
  const since = new Date(Date.now() - DAY_MS);
  const recent = await deps.pool.query(
    `SELECT count(*)::int AS n FROM deposits WHERE account_id = $1 AND deposited_at > $2`,
    [accountId, since],
  );
  if ((recent.rows[0]?.n ?? 0) >= DAILY_SUBMISSION_LIMIT) {
    throw new ApiError("rate_limited", 429, { limit: DAILY_SUBMISSION_LIMIT });
  }

  const submissionId = newId();
  const depositId = newId();
  const digest = createHash("sha256").update(canonical, "utf8").digest();
  const contentSha256 = digest.toString("hex");

  // Store snapshot (and any scrubbed board bundle) BEFORE the DB transaction, so a deposit row can
  // never exist without its snapshot. Storage is append-only; an orphaned snapshot is harmless.
  const snapshotKey = `submissions/${submissionId}/snapshot.txt`;
  await deps.storage.put(snapshotKey, canonical, "text/plain; charset=utf-8");

  let boardBundleKey: string | null = null;
  if (envelope.board_bundle) {
    const scrubbed = {
      format: envelope.board_bundle.format,
      cards: envelope.board_bundle.cards.map((card) => ({ title: card.title, body: card.body })),
    };
    boardBundleKey = `submissions/${submissionId}/board.json`;
    await deps.storage.put(boardBundleKey, JSON.stringify(scrubbed), "application/json; charset=utf-8");
  }

  // The credit gate lives inside the transaction (brief §5): the ceiling was already checked
  // above (a piece refused at the ceiling burns nothing), the snapshot is uploaded (a harmless
  // orphan if we roll back), and now — under a per-account advisory lock that closes the
  // double-spend race — the balance is checked and the debit posts in the same transaction as
  // submissions/authorship/deposits.
  const needed = postCost(envelope.kind);
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [accountId]);
    const held = await balance(client, accountId);
    if (held < needed) {
      throw new ApiError("insufficient_credits", 409, { needed, held });
    }
    await client.query(
      `INSERT INTO submissions
         (id, kind, title, word_count, status, rooms, hands, provenance, board_bundle_key)
       VALUES ($1, $2, $3, $4, 'received', $5, $6, $7, $8)`,
      [
        submissionId,
        envelope.kind,
        envelope.title,
        wordCount,
        envelope.rooms,
        envelope.hands,
        JSON.stringify(envelope.provenance),
        boardBundleKey,
      ],
    );
    await client.query(`INSERT INTO authorship (submission_id, account_id) VALUES ($1, $2)`, [
      submissionId,
      accountId,
    ]);
    const deposited = await client.query(
      `INSERT INTO deposits
         (id, submission_id, content_sha256, canonicalization, snapshot_key, account_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING deposited_at`,
      [depositId, submissionId, digest, CANONICALIZATION_VERSION, snapshotKey, accountId],
    );
    await record(client, {
      accountId,
      delta: -needed,
      reason: envelope.kind === "volume" ? "volume_post" : "queue_post",
      submissionId,
    });
    await client.query("COMMIT");

    const row = deposited.rows[0];
    if (!row) throw new ApiError("deposit_failed", 500);
    return {
      submission_id: submissionId,
      deposit_id: depositId,
      content_sha256: contentSha256,
      deposited_at: new Date(row.deposited_at).toISOString(),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
