import { randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { AuthedAccount, Role } from "./types";

type Queryable = Pool | PoolClient;

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// A bearer session token: 256 bits of CSPRNG entropy, base64url. Not a UUID — a v7 UUID leaks a
// timestamp and carries sub-128-bit entropy, below the floor for a bearer secret (Fable finding B).
// Stored as text (migration 004).
export function mintSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

// Server sessions (brief §5). The bearer token IS the session id — a minimal, real credential;
// magic-link can replace the login path later without schema churn.
export async function createSession(
  db: Queryable,
  accountId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = mintSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.query(`INSERT INTO sessions (id, account_id, expires_at) VALUES ($1, $2, $3)`, [
    token,
    accountId,
    expiresAt,
  ]);
  return { token, expiresAt };
}

export async function resolveSession(
  db: Queryable,
  token: string,
): Promise<AuthedAccount | null> {
  const found = await db.query(
    `SELECT a.id, a.email, a.status, s.expires_at
       FROM sessions s
       JOIN accounts a ON a.id = s.account_id
      WHERE s.id = $1`,
    [token],
  );
  const row = found.rows[0];
  if (!row) return null;
  if (row.status !== "active") return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  const rolesResult = await db.query(`SELECT role FROM roles WHERE account_id = $1`, [row.id]);
  const roles = new Set<Role>(rolesResult.rows.map((r) => r.role as Role));
  return { id: row.id as string, email: row.email as string, roles };
}
