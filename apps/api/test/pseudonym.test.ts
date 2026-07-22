import { describe, expect, it } from "vitest";
import { generateName } from "../src/auth/pseudonym";

describe("pseudonym generator (brief §5)", () => {
  it("produces a two-word, title-cased name", () => {
    for (let i = 0; i < 100; i += 1) {
      const name = generateName();
      expect(name.split(" ")).toHaveLength(2);
      expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    }
  });
});
