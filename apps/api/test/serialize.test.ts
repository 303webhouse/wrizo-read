import { describe, expect, it } from "vitest";
import { serializeDeposit, serializeSubmission } from "../src/serialize";

// The seal in code: even handed a row that carries account_id, the public view must not.
describe("serializers never leak sealed linkage (both tables, Fable review item 2)", () => {
  it("serializeSubmission omits account_id from authorship", () => {
    const out = serializeSubmission({
      id: "s1",
      kind: "queue",
      title: "T",
      word_count: 5,
      status: "received",
      rooms: ["essay"],
      hands: [],
      provenance: {},
      created_at: new Date("2026-07-22T00:00:00Z"),
      account_id: "SECRET-ACCOUNT",
    });
    expect(JSON.stringify(out)).not.toContain("SECRET-ACCOUNT");
    expect(Object.keys(out)).not.toContain("account_id");
  });

  it("serializeDeposit omits account_id from the deposit ledger", () => {
    const out = serializeDeposit({
      id: "d1",
      submission_id: "s1",
      content_sha256: Buffer.from("abcd", "hex"),
      canonicalization: "v1",
      deposited_at: new Date("2026-07-22T00:00:00Z"),
      account_id: "SECRET-ACCOUNT",
    });
    expect(JSON.stringify(out)).not.toContain("SECRET-ACCOUNT");
    expect(Object.keys(out)).not.toContain("account_id");
    expect(out.content_sha256).toBe("abcd");
  });
});
