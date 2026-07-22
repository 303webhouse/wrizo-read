#!/usr/bin/env node
// AX1 acceptance gate: zero hard-coded values in apps/web/src/**.
// Fails on raw hex colors, px sizes, or lexicon copy strings written as literals.
// The token layer (packages/tokens) is the sole home of raw values and is never scanned.
// Foundations §10: tokens are the sole styling source; arming a theme is a data drop.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const scanDir = join(root, "apps", "web", "src");

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/;
const PX = /\b\d*\.?\d+px\b/;
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);

/** Copy strings that live in the lexicon must reach components through lex(), never as literals. */
function lexiconLiterals() {
  const tokensPath = join(root, "packages", "tokens", "tokens.json");
  if (!existsSync(tokensPath)) return [];
  const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));
  const values = new Set();
  for (const theme of Object.values(tokens.lexicon ?? {})) {
    for (const v of Object.values(theme)) {
      if (typeof v === "string" && v.trim().length > 0) values.add(v);
    }
  }
  return [...values];
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (EXTS.has(full.slice(full.lastIndexOf(".")))) out.push(full);
  }
  return out;
}

if (!existsSync(scanDir)) {
  console.log(
    `check-no-hardcoded-values: nothing to scan yet (${relative(root, scanDir)} absent) — OK`,
  );
  process.exit(0);
}

const literals = lexiconLiterals();
const violations = [];

for (const file of walk(scanDir)) {
  const rel = relative(root, file).replace(/\\/g, "/");
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (HEX.test(line)) violations.push(`${rel}:${i + 1}  raw hex color -> ${line.trim()}`);
      if (PX.test(line)) violations.push(`${rel}:${i + 1}  px value -> ${line.trim()}`);
      for (const lit of literals) {
        if (line.includes(lit))
          violations.push(`${rel}:${i + 1}  lexicon literal "${lit}" — resolve via lex()`);
      }
    });
}

if (violations.length > 0) {
  console.error(
    "check-no-hardcoded-values: FAILED — the token layer is the sole styling & copy source.\n",
  );
  for (const v of violations) console.error("  x " + v);
  console.error(
    `\n${violations.length} violation(s). Move colors/sizes into packages/tokens; route copy through lex().`,
  );
  process.exit(1);
}

console.log("check-no-hardcoded-values: OK — no raw hex, px, or lexicon literals in apps/web/src.");
