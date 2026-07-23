import type { Pool } from "pg";
import { countWords } from "@wrizo/contracts";
import { ApiError } from "../errors";
import { newId } from "../ids";
import { auditLinkageRead } from "../audit";
import { balance, record } from "../credits";
import { READING_EARNS, READING_FLOOR_WORDS } from "../economy";
import { hasActiveClaim } from "../queue/claims";
import { type RatingCounts, type ReadingView, serializeReading } from "../serialize";

const UNIQUE_VIOLATION = "23505";

export async function fileReading(
  pool: Pool,
  accountId: string,
  submissionId: string,
  body: string,
): Promise<{ reading: ReadingView; balance: number }> {
  const piece = await pool.query(`SELECT kind, status FROM submissions WHERE id = $1`, [submissionId]);
  const p = piece.rows[0];
  if (!p) throw new ApiError("not_found", 404);

  // Self-check FIRST: the one authorship read at file time, audited on the pool BEFORE the
  // transaction so the seeing-law row persists even when filing is refused (own_piece). It
  // precedes the claim check so the piece's own author is refused with own_piece — never
  // not_claimant (an author holds no claim on their own piece). Mirrors AX2's claim path.
  await auditLinkageRead(pool, {
    actor: accountId,
    tableName: "authorship",
    submissionId,
    reason: "reading_self_check",
  });
  const authorship = await pool.query(`SELECT account_id FROM authorship WHERE submission_id = $1`, [
    submissionId,
  ]);
  if (authorship.rows[0]?.account_id === accountId) throw new ApiError("own_piece", 409);

  // Who may file: an active claimant for a queue piece; any writer for a Volume (brief §2).
  if (p.kind === "queue" && !(await hasActiveClaim(pool, accountId, submissionId))) {
    throw new ApiError("not_claimant", 403);
  }

  // The floor's minimum: >= 120 words, or refuse with nothing stored and no credit (brief §2).
  const wordCount = countWords(body);
  if (wordCount < READING_FLOOR_WORDS) {
    throw new ApiError("reading_too_short", 422, { floor: READING_FLOOR_WORDS, word_count: wordCount });
  }

  const readingId = newId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO readings (id, submission_id, account_id, body, word_count) VALUES ($1, $2, $3, $4, $5)`,
      [readingId, submissionId, accountId, body, wordCount],
    );
    await record(client, { accountId, delta: READING_EARNS, reason: "reading_filed", readingId });
    const rows = await client.query(
      `SELECT r.id, r.body, r.word_count, r.filed_at, p.name AS reader_name
         FROM readings r JOIN pseudonyms p ON p.account_id = r.account_id
        WHERE r.id = $1`,
      [readingId],
    );
    const bal = await balance(client, accountId);
    await client.query("COMMIT");
    const row = rows.rows[0];
    if (!row) throw new ApiError("file_failed", 500);
    return { reading: serializeReading(row, true, { useful: 0, somewhat: 0 }), balance: bal };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err && typeof err === "object" && "code" in err && err.code === UNIQUE_VIOLATION) {
      throw new ApiError("already_filed", 409); // one reading per reader per piece
    }
    throw err;
  } finally {
    client.release();
  }
}

type Seal = { sealed: true; count: number } | { sealed: false; readings: ReadingView[] };

// The crown law (brief §3). Sealed unless the requester has filed on this piece, or IS its author
// (readings exist for the author; authors never file on their own piece and are never sealed out).
export async function getReadings(pool: Pool, accountId: string, submissionId: string): Promise<Seal> {
  const piece = await pool.query(`SELECT 1 FROM submissions WHERE id = $1`, [submissionId]);
  if (!piece.rowCount) throw new ApiError("not_found", 404);

  const filed = await pool.query(
    `SELECT 1 FROM readings WHERE submission_id = $1 AND account_id = $2`,
    [submissionId, accountId],
  );
  // Author check scoped to the requester's own account — self-knowledge clause, no audit row.
  const isAuthor = await pool.query(
    `SELECT 1 FROM authorship WHERE submission_id = $1 AND account_id = $2`,
    [submissionId, accountId],
  );
  const unsealed = Boolean(filed.rowCount) || Boolean(isAuthor.rowCount);

  const countRow = await pool.query(`SELECT count(*)::int AS n FROM readings WHERE submission_id = $1`, [
    submissionId,
  ]);
  const count = countRow.rows[0]?.n ?? 0;
  if (!unsealed) return { sealed: true, count };

  const rows = await pool.query(
    `SELECT r.id, r.account_id, r.body, r.word_count, r.filed_at, p.name AS reader_name
       FROM readings r JOIN pseudonyms p ON p.account_id = r.account_id
      WHERE r.submission_id = $1
      ORDER BY r.filed_at ASC`,
    [submissionId],
  );

  // Per-reading rating counts, for the requester's OWN readings only (brief §4).
  const ownIds = rows.rows.filter((r) => r.account_id === accountId).map((r) => r.id as string);
  const countsByReading = new Map<string, RatingCounts>();
  if (ownIds.length > 0) {
    const rc = await pool.query(
      `SELECT reading_id, value, count(*)::int AS n FROM reading_ratings
        WHERE reading_id = ANY($1) GROUP BY reading_id, value`,
      [ownIds],
    );
    for (const row of rc.rows) {
      const cur = countsByReading.get(row.reading_id) ?? { useful: 0, somewhat: 0 };
      if (row.value === "useful") cur.useful = row.n;
      else cur.somewhat = row.n;
      countsByReading.set(row.reading_id, cur);
    }
  }

  const readings = rows.rows.map((r) => {
    const own = r.account_id === accountId;
    return serializeReading(r, own, own ? (countsByReading.get(r.id) ?? { useful: 0, somewhat: 0 }) : undefined);
  });
  return { sealed: false, readings };
}

export async function rateReading(
  pool: Pool,
  accountId: string,
  readingId: string,
  value: "useful" | "somewhat",
): Promise<{ rated: true; rater_kind: "author" | "peer" }> {
  const reading = await pool.query(`SELECT submission_id, account_id FROM readings WHERE id = $1`, [
    readingId,
  ]);
  const r = reading.rows[0];
  if (!r) throw new ApiError("not_found", 404);
  if (r.account_id === accountId) throw new ApiError("own_reading", 409); // nobody rates their own

  // rater_kind: author if the rater authored the piece (self-knowledge-scoped, no audit), else peer.
  const isAuthor = await pool.query(
    `SELECT 1 FROM authorship WHERE submission_id = $1 AND account_id = $2`,
    [r.submission_id, accountId],
  );
  const raterKind: "author" | "peer" = isAuthor.rowCount ? "author" : "peer";

  // Eligibility mirrors the seal: an author may always rate readings on their own piece; a peer may
  // rate only readings they can see — i.e., they have filed on that piece (brief §4).
  if (raterKind === "peer") {
    const filed = await pool.query(
      `SELECT 1 FROM readings WHERE submission_id = $1 AND account_id = $2`,
      [r.submission_id, accountId],
    );
    if (!filed.rowCount) throw new ApiError("not_eligible", 403);
  }

  await pool.query(
    `INSERT INTO reading_ratings (id, reading_id, rater_account_id, rater_kind, value)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (reading_id, rater_account_id)
       DO UPDATE SET value = EXCLUDED.value, rater_kind = EXCLUDED.rater_kind, created_at = now()`,
    [newId(), readingId, accountId, raterKind, value],
  );
  return { rated: true, rater_kind: raterKind };
}
