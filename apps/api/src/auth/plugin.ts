import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { forbidden, unauthorized } from "../errors";
import { resolveSession } from "./sessions";
import type { AuthedAccount } from "./types";

declare module "fastify" {
  interface FastifyRequest {
    account: AuthedAccount | null;
  }
}

function bearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer (.+)$/.exec(header);
  return match ? (match[1] ?? null) : null;
}

// Resolves the bearer session on every request (or leaves account = null). Route guards below
// decide what a missing/insufficient identity means.
export function registerAuthContext(app: FastifyInstance, pool: Pool): void {
  app.decorateRequest("account", null);
  app.addHook("onRequest", async (req) => {
    const token = bearerToken(req);
    req.account = token ? await resolveSession(pool, token) : null;
  });
}

export async function requireAccount(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!req.account) throw unauthorized();
}

export async function requireWriter(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!req.account) throw unauthorized();
  if (!req.account.roles.has("writer")) throw forbidden({ need: "writer" });
}
