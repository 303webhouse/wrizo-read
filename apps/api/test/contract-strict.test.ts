import { describe, expect, it } from "vitest";
import { Provenance, SubmissionEnvelope } from "@wrizo/contracts";

const base = {
  contract: "wrizo-bridge/1",
  kind: "queue",
  title: "A Piece",
  text: "hello world\n",
  rooms: ["essay"],
  hands: ["plain"],
  provenance: { sessions: 3, span_weeks: 2, composed_in_wrizo: true },
};

describe("bridge contract is strict at every level (Fable review item 1)", () => {
  it("accepts a clean envelope", () => {
    expect(SubmissionEnvelope.safeParse(base).success).toBe(true);
  });

  it("REJECTS (not strips) an unknown key inside provenance", () => {
    const result = SubmissionEnvelope.safeParse({
      ...base,
      provenance: { ...base.provenance, keystroke_ms: [11, 12, 13] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown top-level key", () => {
    expect(SubmissionEnvelope.safeParse({ ...base, ip: "1.2.3.4" }).success).toBe(false);
  });

  it("rejects an unknown key inside a board card", () => {
    const result = SubmissionEnvelope.safeParse({
      ...base,
      board_bundle: { format: "wrizo-board/1", cards: [{ title: "a", body: "b", color: "red" }] },
    });
    expect(result.success).toBe(false);
  });

  it("Provenance itself rejects extra keys", () => {
    expect(
      Provenance.safeParse({ sessions: 1, span_weeks: 1, composed_in_wrizo: true, extra: 5 }).success,
    ).toBe(false);
  });

  it("enforces room and hand cardinality", () => {
    expect(SubmissionEnvelope.safeParse({ ...base, rooms: [] }).success).toBe(false);
    expect(SubmissionEnvelope.safeParse({ ...base, rooms: ["a", "b", "c"] }).success).toBe(false);
    expect(SubmissionEnvelope.safeParse({ ...base, hands: ["a", "b", "c", "d"] }).success).toBe(false);
  });
});
