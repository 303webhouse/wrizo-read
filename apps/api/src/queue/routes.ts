import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Pool } from "pg";
import type { Storage } from "../storage";
import { ApiError, unauthorized } from "../errors";
import { requireWriter } from "../auth/plugin";
import { dealOne, listQueue, listVolumes, type Sort } from "./service";
import { claim, myClaims, release } from "./claims";
import { pieceDetail } from "./pieces";

function parseList(value: unknown): string[] | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const SORTS = new Set<Sort>(["tail", "newest", "shortest"]);
function parseSort(value: unknown): Sort {
  return typeof value === "string" && SORTS.has(value as Sort) ? (value as Sort) : "tail";
}

const ClaimBody = z.object({ submission_id: z.string().uuid() }).strict();

export interface QueueDeps {
  pool: Pool;
  storage: Storage;
}

// All queue endpoints are bearer-authed, writer role (brief §3). Serializers whitelist every
// field — no row spreads, no linkage, no pseudonyms.
export function registerQueueRoutes(app: FastifyInstance, deps: QueueDeps): void {
  const { pool, storage } = deps;

  app.get("/api/v1/workshop/queue", { preHandler: requireWriter }, async (req) => {
    const q = req.query as Record<string, unknown>;
    return listQueue(pool, {
      rooms: parseList(q.rooms),
      hands: parseList(q.hands),
      sort: parseSort(q.sort),
    });
  });

  app.get("/api/v1/workshop/volumes", { preHandler: requireWriter }, async () => listVolumes(pool));

  app.get("/api/v1/workshop/queue/deal", { preHandler: requireWriter }, async (req, reply) => {
    const account = req.account;
    if (!account) throw unauthorized();
    const card = await dealOne(pool, account.id);
    if (!card) return reply.code(404).send({ error: "pile_empty" });
    return card;
  });

  app.post("/api/v1/workshop/claims", { preHandler: requireWriter }, async (req, reply) => {
    const account = req.account;
    if (!account) throw unauthorized();
    const parsed = ClaimBody.safeParse(req.body);
    if (!parsed.success) throw new ApiError("invalid_request", 400, { issues: parsed.error.issues });
    const view = await claim(pool, account.id, parsed.data.submission_id);
    return reply.code(201).send(view);
  });

  app.post(
    "/api/v1/workshop/claims/:submission_id/release",
    { preHandler: requireWriter },
    async (req) => {
      const account = req.account;
      if (!account) throw unauthorized();
      const { submission_id } = req.params as { submission_id: string };
      await release(pool, account.id, submission_id);
      return { released: true };
    },
  );

  app.get("/api/v1/workshop/claims/mine", { preHandler: requireWriter }, async (req) => {
    const account = req.account;
    if (!account) throw unauthorized();
    return myClaims(pool, account.id);
  });

  app.get("/api/v1/workshop/pieces/:id", { preHandler: requireWriter }, async (req) => {
    const account = req.account;
    if (!account) throw unauthorized();
    const { id } = req.params as { id: string };
    return pieceDetail(pool, storage, account.id, id);
  });
}
