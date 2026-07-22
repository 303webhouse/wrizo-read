import type { FastifyInstance } from "fastify";
import { SubmissionEnvelope } from "@wrizo/contracts";
import { ApiError, unauthorized } from "../errors";
import { requireWriter } from "../auth/plugin";
import { runIntake, type IntakeDeps } from "../intake/pipeline";

// The bridge, Read side (brief §4). Bearer auth (writer role). This endpoint accepts the
// wrizo-bridge/1 contract only — there is no web upload form for Workshop pieces, ever.
export function registerSubmissions(app: FastifyInstance, deps: IntakeDeps): void {
  app.post(
    "/api/v1/workshop/submissions",
    { preHandler: requireWriter },
    async (req, reply) => {
      const account = req.account;
      if (!account) throw unauthorized();

      const parsed = SubmissionEnvelope.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError("invalid_envelope", 400, { issues: parsed.error.issues });
      }

      const receipt = await runIntake(deps, parsed.data, account.id);
      return reply.code(201).send(receipt);
    },
  );
}
