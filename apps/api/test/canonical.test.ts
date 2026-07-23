import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalize, countWords } from "@wrizo/contracts";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("canonicalization stability (brief §6)", () => {
  it("CRLF and LF hash identically", () => {
    expect(sha(canonicalize("line one\r\nline two\r\n"))).toBe(
      sha(canonicalize("line one\nline two\n")),
    );
  });

  it("trailing whitespace does not change the hash", () => {
    expect(sha(canonicalize("a  \nb\t\n"))).toBe(sha(canonicalize("a\nb\n")));
  });

  it("NFC-equivalent encodings hash identically", () => {
    const composed = "café\n"; // é as one code point (U+00E9)
    const decomposed = "café\n"; // e + combining acute (U+0301)
    expect(composed).not.toBe(decomposed); // genuinely different input bytes
    expect(sha(canonicalize(composed))).toBe(sha(canonicalize(decomposed)));
  });

  it("is idempotent", () => {
    const once = canonicalize("x  \r\n\r\n");
    expect(canonicalize(once)).toBe(once);
  });

  it("counts words on trimmed text", () => {
    expect(countWords("  one two   three ")).toBe(3);
    expect(countWords("   ")).toBe(0);
  });
});
