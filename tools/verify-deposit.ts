#!/usr/bin/env tsx
// Independent deposit verifier (brief acceptance §7.3). Recomputes the content SHA-256 the
// Archive stores for a deposit and, optionally, checks it against an expected digest — proving
// the hash is reproducible outside the server. Uses the SAME canonicalization as the intake
// pipeline (@wrizo/contracts), so a snapshot verifies byte-for-byte.
//
// Usage:
//   tsx tools/verify-deposit.ts <file> [--raw] [--expect <sha256hex>]
//     <file>     the deposited snapshot (already canonical), or source text with --raw
//     --raw      canonicalize the file first (verify from original, non-canonical source)
//     --expect   compare against an expected hex digest; exit 1 on mismatch
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CANONICALIZATION_VERSION, canonicalize } from "@wrizo/contracts";

function main(argv: string[]): number {
  let file: string | undefined;
  let raw = false;
  let expect: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--raw") raw = true;
    else if (arg === "--expect") expect = argv[(i += 1)];
    else file = arg;
  }

  if (!file) {
    console.error("usage: verify-deposit <file> [--raw] [--expect <sha256hex>]");
    return 2;
  }

  const contents = readFileSync(file, "utf8");
  const canonical = raw ? canonicalize(contents) : contents;
  const contentSha256 = createHash("sha256").update(canonical, "utf8").digest("hex");

  console.log(
    JSON.stringify(
      {
        file,
        canonicalization: CANONICALIZATION_VERSION,
        mode: raw ? "raw->canonical" : "snapshot",
        content_sha256: contentSha256,
      },
      null,
      2,
    ),
  );

  if (expect !== undefined) {
    if (contentSha256 === expect.toLowerCase()) {
      console.log("MATCH");
      return 0;
    }
    console.error(`MISMATCH: expected ${expect}`);
    return 1;
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
