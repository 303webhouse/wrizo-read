import type { Pool } from "pg";
import { serializeCard, type QueueCard } from "../serialize";

export type Sort = "tail" | "newest" | "shortest";

// Tail-weighted (default): oldest and least-claimed first — coverage reaches the tail. The claim
// count proxies readings until readings exist (AX3); note in code, per brief §2.
const ORDER: Record<Sort, string> = {
  tail: "claim_count ASC, s.created_at ASC",
  newest: "s.created_at DESC",
  shortest: "s.word_count ASC, s.created_at ASC",
};

export interface QueueFilter {
  rooms?: string[];
  hands?: string[];
  sort?: Sort;
}

// Browse lists never touch linkage (brief §2): the card select reads submissions + a claim COUNT
// only — never authorship, never account ids.
function cardSelect(where: string, order: string): string {
  return `
    SELECT s.id, s.title, s.kind, s.word_count, s.rooms, s.hands, s.provenance, s.created_at,
           (SELECT count(*) FROM claims c WHERE c.submission_id = s.id) AS claim_count
      FROM submissions s
     WHERE ${where}
     ORDER BY ${order}`;
}

export async function listQueue(pool: Pool, filter: QueueFilter): Promise<QueueCard[]> {
  const conditions = ["s.kind = 'queue'", "s.status = 'received'"];
  const params: unknown[] = [];
  if (filter.rooms && filter.rooms.length > 0) {
    params.push(filter.rooms);
    conditions.push(`s.rooms && $${params.length}::text[]`); // any-match
  }
  if (filter.hands && filter.hands.length > 0) {
    params.push(filter.hands);
    conditions.push(`s.hands && $${params.length}::text[]`); // any-match
  }
  const order = ORDER[filter.sort ?? "tail"];
  const result = await pool.query(cardSelect(conditions.join(" AND "), order), params);
  return result.rows.map(serializeCard);
}

export async function listVolumes(pool: Pool): Promise<QueueCard[]> {
  // Volumes are open by choice — a separate lane, newest first, never in the queue or the deal.
  const result = await pool.query(
    cardSelect("s.kind = 'volume' AND s.status = 'received'", "s.created_at DESC"),
    [],
  );
  return result.rows.map(serializeCard);
}

export async function dealOne(pool: Pool, accountId: string): Promise<QueueCard | null> {
  // First tail-weighted queue piece the requester has no active claim on and did not author. The
  // self-authored exclusion is filtered to the requester's OWN account, so it reveals no one
  // else's linkage — seeing-law compliant self-knowledge, no audit needed.
  const where = `s.kind = 'queue' AND s.status = 'received'
    AND NOT EXISTS (SELECT 1 FROM claims c
                     WHERE c.submission_id = s.id AND c.account_id = $1
                       AND c.released_at IS NULL AND c.expires_at > now())
    AND NOT EXISTS (SELECT 1 FROM authorship a
                     WHERE a.submission_id = s.id AND a.account_id = $1)`;
  const result = await pool.query(`${cardSelect(where, ORDER.tail)} LIMIT 1`, [accountId]);
  const row = result.rows[0];
  return row ? serializeCard(row) : null;
}
