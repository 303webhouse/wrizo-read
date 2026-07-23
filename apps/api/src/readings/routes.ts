import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { ApiError, unauthorized } from "../errors";
import { requireWriter } from "../auth/plugin";
import { requireUuidParam } from "../http";
import { balance, record, recent } from "../credits";
import { fileReading, getReadings, rateReading } from "./service";

const FileBody = z.object({ body: z.string() }).strict();
const RateBody = z.object({ value: z.enum(["useful", "somewhat"]) }).strict();
const FaucetBody = z.object({ amount: z.number().int().positive().max(1000) }).strict();

// Readings, ratings, and the credit economy (brief §2–5). All bearer-authed, writer role.
export function registerReadingRoutes(app: FastifyInstance, pool: Pool): void {
  app.get("/api/v1/workshop/pieces/:id/readings", { preHandler: requireWriter }, async (req) => {
    const account = req.account;
    if (!account) throw unauthorized();
    const id = requireUuidParam((req.params as { id: string }).id);
    return getReadings(pool, account.id, id);
  });

  app.post("/api/v1/workshop/pieces/:id/readings", { preHandler: requireWriter }, async (req, reply) => {
    const account = req.account;
    if (!account) throw unauthorized();
    const id = requireUuidParam((req.params as { id: string }).id);
    const parsed = FileBody.safeParse(req.body);
    if (!parsed.success) throw new ApiError("invalid_request", 400, { issues: parsed.error.issues });
    const result = await fileReading(pool, account.id, id, parsed.data.body);
    return reply.code(201).send(result);
  });

  app.post("/api/v1/workshop/readings/:id/rate", { preHandler: requireWriter }, async (req) => {
    const account = req.account;
    if (!account) throw unauthorized();
    const id = requireUuidParam((req.params as { id: string }).id);
    const parsed = RateBody.safeParse(req.body);
    if (!parsed.success) throw new ApiError("invalid_request", 400, { issues: parsed.error.issues });
    return rateReading(pool, account.id, id, parsed.data.value);
  });

  // Own data only (brief §5).
  app.get("/api/v1/workshop/credits", { preHandler: requireWriter }, async (req) => {
    const account = req.account;
    if (!account) throw unauthorized();
    return { balance: await balance(pool, account.id), recent: await recent(pool, account.id) };
  });

  // The dev faucet — registered ONLY when NODE_ENV !== 'production' (the ALLOW_MEMORY_STORAGE
  // pattern). Production never has this route at all. seed-floor and the suites use it (brief §5).
  if (process.env.NODE_ENV !== "production") {
    app.post("/api/v1/dev/credits", { preHandler: requireWriter }, async (req, reply) => {
      const account = req.account;
      if (!account) throw unauthorized();
      const parsed = FaucetBody.safeParse(req.body);
      if (!parsed.success) throw new ApiError("invalid_request", 400, { issues: parsed.error.issues });
      await record(pool, { accountId: account.id, delta: parsed.data.amount, reason: "dev_grant" });
      return reply.code(201).send({ balance: await balance(pool, account.id) });
    });
  }
}
