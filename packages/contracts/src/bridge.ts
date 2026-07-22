import { z } from "zod";

/**
 * The Write -> Read bridge. Wrizo | Write POSTs a sealed snapshot to Read's publish API.
 * This is the only accepted caller of POST /api/v1/workshop/submissions — there is no web
 * upload form for Workshop pieces, ever (foundations §1, brief §4).
 */
export const CONTRACT_ID = "wrizo-bridge/1" as const;

export const BoardCard = z
  .object({
    title: z.string().min(1),
    body: z.string(),
  })
  .strict();

export const BoardBundle = z
  .object({
    format: z.literal("wrizo-board/1"),
    cards: z.array(BoardCard),
  })
  .strict();

/**
 * Provenance is coarse by law — session count and span only. Fine-grained timing is a
 * fingerprint (the seeing law, foundations §9). Every level is `.strict()`, including the
 * nested objects below: an unknown key anywhere is REJECTED, never silently stripped, so a
 * finer-than-session field cannot ride in on a nested object (Fable review item 1).
 */
export const Provenance = z
  .object({
    sessions: z.number().int().nonnegative(),
    span_weeks: z.number().int().nonnegative(),
    composed_in_wrizo: z.literal(true),
  })
  .strict();

export const SubmissionEnvelope = z
  .object({
    contract: z.literal(CONTRACT_ID),
    kind: z.enum(["queue", "volume"]),
    title: z.string().min(1),
    text: z.string().min(1), // canonical UTF-8; the server re-canonicalizes before hashing
    rooms: z.array(z.string().min(1)).min(1).max(2), // 1–2 rooms (dual-room tagging allowed)
    hands: z.array(z.string().min(1)).max(3), // 0–3 hands
    provenance: Provenance,
    board_bundle: BoardBundle.optional(),
  })
  .strict();

export type SubmissionEnvelope = z.infer<typeof SubmissionEnvelope>;

/**
 * The writer-facing proof of deposit. No linkage data (no account id, no pseudonym) ever
 * appears here or in any other response (brief §4).
 */
export const Receipt = z.object({
  submission_id: z.string(),
  deposit_id: z.string(),
  content_sha256: z.string(), // hex-encoded
  deposited_at: z.string(), // ISO-8601
});

export type Receipt = z.infer<typeof Receipt>;
