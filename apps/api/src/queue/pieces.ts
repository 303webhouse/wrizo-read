import type { Pool } from "pg";
import { ApiError } from "../errors";
import type { Storage } from "../storage";
import { serializeCard, type QueueCard } from "../serialize";
import { hasActiveClaim } from "./claims";

export interface PieceDetail {
  card: QueueCard;
  text: string;
  board_bundle: unknown | null;
  provenance: unknown;
}

// The Reading Table's data. Text access is served ONLY to an active claimant of a queue piece, or
// to any writer for a Volume (open by choice). Non-claimants of a queue piece get 403 not_claimant
// — the card is already theirs from the queue list (brief §2).
export async function pieceDetail(
  pool: Pool,
  storage: Storage,
  accountId: string,
  submissionId: string,
): Promise<PieceDetail> {
  const found = await pool.query(
    `SELECT s.id, s.title, s.kind, s.word_count, s.rooms, s.hands, s.provenance, s.created_at,
            s.board_bundle_key,
            (SELECT count(*) FROM claims c WHERE c.submission_id = s.id) AS claim_count
       FROM submissions s WHERE s.id = $1`,
    [submissionId],
  );
  const row = found.rows[0];
  if (!row) throw new ApiError("not_found", 404);

  const authorized =
    row.kind === "volume" || (await hasActiveClaim(pool, accountId, submissionId));
  if (!authorized) throw new ApiError("not_claimant", 403);

  const deposit = await pool.query(
    `SELECT snapshot_key FROM deposits WHERE submission_id = $1 ORDER BY deposited_at DESC LIMIT 1`,
    [submissionId],
  );
  const snapshotKey = deposit.rows[0]?.snapshot_key as string | undefined;
  const snapshot = snapshotKey ? await storage.get(snapshotKey) : null;
  // Riding note #2 (AX2 review §4): a deposit whose snapshot cannot be fetched is a ledger-
  // integrity event, not silent empty text. Fail loudly in every environment (the error handler
  // logs 500s), so the Archive never quietly serves an empty piece over a real deposit.
  if (!snapshot) {
    throw new ApiError("snapshot_missing", 500, { submission_id: submissionId });
  }
  const text = snapshot.toString("utf8");

  let boardBundle: unknown | null = null;
  const boardKey = row.board_bundle_key as string | null;
  if (boardKey) {
    const board = await storage.get(boardKey);
    boardBundle = board ? JSON.parse(board.toString("utf8")) : null;
  }

  return { card: serializeCard(row), text, board_bundle: boardBundle, provenance: row.provenance };
}
