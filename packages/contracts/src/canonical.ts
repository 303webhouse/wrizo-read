// Canonicalization v1 — the single, deterministic normalization applied before hashing a
// deposit. Shared so the API and tools/verify-deposit.ts produce byte-identical input and
// therefore the same SHA-256 (brief §4, acceptance §7.3). Pure: no I/O, no crypto here.
//
// Rules (v1):
//   - Unicode NFC
//   - line endings -> LF
//   - trailing whitespace trimmed per line
//   - a single trailing newline, no leading/trailing blank padding
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
