// Canonicalization v1 — the single, deterministic normalization applied before hashing a
// deposit. Shared so the API and tools/verify-deposit.ts produce byte-identical input and
// therefore the same SHA-256 (brief §4, acceptance §7.3). Pure: no I/O, no crypto here.
//
// v1 is FROZEN the day the first real deposit lands: changing any rule would break hash
// reproducibility for every prior deposit. The code below is the spec — keep this comment true
// to it (Fable finding C).
//
// Rules (v1), exactly as implemented:
//   - Unicode NFC
//   - CRLF and lone CR line endings -> LF
//   - trailing whitespace trimmed per line (space, tab, form feed, vertical tab, U+00A0)
//   - trailing blank lines collapsed to exactly one final LF
//   - leading content is preserved verbatim — leading blank lines are NOT stripped
export const CANONICALIZATION_VERSION = "v1" as const;

export function canonicalize(text: string): string {
  const nfc = text.normalize("NFC");
  const lf = nfc.replace(/\r\n?/g, "\n");
  const trimmedLines = lf
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v ]+$/u, ""))
    .join("\n");
  return trimmedLines.replace(/\n+$/g, "") + "\n";
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length;
}
