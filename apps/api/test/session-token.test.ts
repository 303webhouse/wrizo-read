import { describe, expect, it } from "vitest";
import { mintSessionToken } from "../src/auth/sessions";

describe("session token minting (Fable finding B)", () => {
  it("is 256 bits of base64url — 43 chars, url-safe alphabet, not a UUID", () => {
    for (let i = 0; i < 100; i += 1) {
      const token = mintSessionToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url, unpadded
      expect(token).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/); // not a UUID
    }
  });

  it("does not repeat across many mints", () => {
    const seen = new Set(Array.from({ length: 1000 }, () => mintSessionToken()));
    expect(seen.size).toBe(1000);
  });
});
