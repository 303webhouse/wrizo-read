import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { newId } from "../ids";
import { ApiError, unauthorized } from "../errors";
import { hashPassword, verifyPassword } from "./password";
import { createSession } from "./sessions";
import { assignPseudonym, regeneratePseudonym } from "./pseudonym";
import { requireAccount, requireWriter } from "./plugin";

const Credentials = z
  .object({
    email: z.string().email(),
    password: z.string().min(8).max(256),
  })
  .strict();

const UNIQUE_VIOLATION = "23505";

export function registerAuthRoutes(app: FastifyInstance, pool: Pool): void {
  app.post("/api/v1/auth/register", async (req, reply) => {
    const parsed = Credentials.safeParse(req.body);
    if (!parsed.success) throw new ApiError("invalid_credentials", 400, { issues: parsed.error.issues });
    const { email, password } = parsed.data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const accountId = newId();
      await client.query(`INSERT INTO accounts (id, email) VALUES ($1, $2)`, [accountId, email]);
      await client.query(`INSERT INTO roles (account_id, role) VALUES ($1, 'reader')`, [accountId]);
      const secret = await hashPassword(password);
      await client.query(
        `INSERT INTO credentials (account_id, kind, secret_hash) VALUES ($1, 'password', $2)`,
        [accountId, secret],
      );
      const session = await createSession(client, accountId);
      await client.query("COMMIT");
      return reply.code(201).send({ account_id: accountId, token: session.token });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err && typeof err === "object" && "code" in err && err.code === UNIQUE_VIOLATION) {
        throw new ApiError("email_taken", 409);
      }
      throw err;
    } finally {
      client.release();
    }
  });

  app.post("/api/v1/auth/login", async (req, reply) => {
    const parsed = Credentials.safeParse(req.body);
    if (!parsed.success) throw unauthorized();
    const { email, password } = parsed.data;

    const found = await pool.query(
      `SELECT a.id, c.secret_hash
         FROM accounts a
         JOIN credentials c ON c.account_id = a.id AND c.kind = 'password'
        WHERE a.email = $1`,
      [email],
    );
    const row = found.rows[0];
    if (!row) throw unauthorized();
    if (!(await verifyPassword(row.secret_hash, password))) throw unauthorized();

    const session = await createSession(pool, row.id);
    return reply.send({ account_id: row.id, token: session.token });
  });

  // Grant the writer role and mint the reviewer pseudonym (brief §5). Self-service in AX1;
  // real invite gating arrives with the founding-cohort playbook.
  app.post("/api/v1/auth/writer", { preHandler: requireAccount }, async (req, reply) => {
    const account = req.account;
    if (!account) throw unauthorized();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO roles (account_id, role) VALUES ($1, 'writer') ON CONFLICT DO NOTHING`,
        [account.id],
      );
      const existing = await client.query(`SELECT name FROM pseudonyms WHERE account_id = $1`, [
        account.id,
      ]);
      const pseudonym = (existing.rows[0]?.name as string | undefined)
        ?? (await assignPseudonym(client, account.id));
      await client.query("COMMIT");
      return reply.send({ roles: ["reader", "writer"], pseudonym });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  app.post(
    "/api/v1/auth/pseudonym/regenerate",
    { preHandler: requireWriter },
    async (req, reply) => {
      const account = req.account;
      if (!account) throw unauthorized();

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const pseudonym = await regeneratePseudonym(client, account.id);
        await client.query("COMMIT");
        return reply.send({ pseudonym });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  );

  app.get("/api/v1/auth/me", { preHandler: requireAccount }, async (req) => {
    const account = req.account;
    if (!account) throw unauthorized();
    const p = await pool.query(`SELECT name FROM pseudonyms WHERE account_id = $1`, [account.id]);
    return {
      account_id: account.id,
      email: account.email,
      roles: [...account.roles],
      pseudonym: (p.rows[0]?.name as string | undefined) ?? null,
    };
  });
}
