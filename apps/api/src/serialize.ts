// The seal, expressed in code. Public views are built field-by-field from a whitelist and never
// spread a database row, so account_id from authorship or deposits cannot leak into a payload
// even by accident (foundations §4/§9; Fable review item 2 — both linkage-bearing tables).
export interface PublicSubmission {
  submission_id: string;
  kind: string;
  title: string;
  word_count: number;
  status: string;
  rooms: string[];
  hands: string[];
  provenance: unknown;
  created_at: string;
}

export interface PublicDeposit {
  deposit_id: string;
  submission_id: string;
  content_sha256: string;
  canonicalization: string;
  deposited_at: string;
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function serializeSubmission(row: Record<string, unknown>): PublicSubmission {
  return {
    submission_id: row.id as string,
    kind: row.kind as string,
    title: row.title as string,
    word_count: row.word_count as number,
    status: row.status as string,
    rooms: (row.rooms as string[]) ?? [],
    hands: (row.hands as string[]) ?? [],
    provenance: row.provenance,
    created_at: iso(row.created_at),
  };
}

export function serializeDeposit(row: Record<string, unknown>): PublicDeposit {
  const sha = row.content_sha256;
  return {
    deposit_id: row.id as string,
    submission_id: row.submission_id as string,
    content_sha256: Buffer.isBuffer(sha) ? sha.toString("hex") : String(sha),
    canonicalization: row.canonicalization as string,
    deposited_at: iso(row.deposited_at),
  };
}

// AX2 — the Queue card. Scriptor-sealed: id, title, kind, word_count, rooms, hands, coarse
// provenance, created_at, and the claim count ("N readers so far"). Never any linkage, never a
// pseudonym. Built field-by-field from a whitelist — no row spread (brief §2).
export interface QueueCard {
  submission_id: string;
  title: string;
  kind: string;
  word_count: number;
  rooms: string[];
  hands: string[];
  provenance: unknown;
  created_at: string;
  readers_so_far: number;
}

export function serializeCard(row: Record<string, unknown>): QueueCard {
  return {
    submission_id: row.id as string,
    title: row.title as string,
    kind: row.kind as string,
    word_count: row.word_count as number,
    rooms: (row.rooms as string[]) ?? [],
    hands: (row.hands as string[]) ?? [],
    provenance: row.provenance,
    created_at: iso(row.created_at),
    readers_so_far: Number(row.claim_count ?? 0),
  };
}

// The claimant's own view of a hold. No claim id, no account id — the reader does not need the
// claim's primary key, and account linkage is sealed (brief §3).
export interface ClaimView {
  submission_id: string;
  claimed_at: string;
  expires_at: string;
}

export function serializeClaim(row: Record<string, unknown>): ClaimView {
  return {
    submission_id: row.submission_id as string,
    claimed_at: iso(row.claimed_at),
    expires_at: iso(row.expires_at),
  };
}
