import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SubmissionEnvelope } from "@wrizo/contracts";

// Queue pieces carry a hard ceiling. Enforced server-side at intake, not by check constraint
// alone (brief §3), and reported as a typed error.
const QUEUE_WORD_CEILING = 7500;

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

// TODO(AX1 acceptance): real bearer auth resolving a session -> account -> writer role.
// The bridge contract is the only accepted caller; there is no web upload form (foundations §1).
async function requireWriter(_req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  // Skeleton gate. Left unimplemented deliberately — auth lands with the intake pipeline.
}

export function registerSubmissions(app: FastifyInstance): void {
  app.post(
    "/api/v1/workshop/submissions",
    { preHandler: requireWriter },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = SubmissionEnvelope.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_envelope", issues: parsed.error.issues });
      }
      const envelope = parsed.data;

      if (envelope.kind === "queue") {
        const words = countWords(envelope.text);
        if (words > QUEUE_WORD_CEILING) {
          return reply.code(422).send({
            error: "queue_ceiling_exceeded",
            ceiling: QUEUE_WORD_CEILING,
            word_count: words,
          });
        }
      }

      // TODO(AX1 acceptance): transactional intake pipeline —
      //   canonicalize text (NFC, LF, trim trailing ws) -> SHA-256 -> store snapshot + optional
      //   scrubbed board bundle to object storage -> insert submissions, authorship, deposits ->
      //   return receipt { submission_id, deposit_id, content_sha256, deposited_at }.
      //   No linkage data ever appears in the response (brief §4).
      return reply.code(501).send({ error: "not_implemented", stage: "intake_pipeline" });
    },
  );
}
