#!/usr/bin/env tsx
// seed-floor — the bridge's stand-in for a hands-on sitting. There is no web upload form for
// Workshop pieces and never will be; this dev-only tool posts fixtures through the REAL publish
// API (wrizo-bridge/1), exactly as Wrizo | Write's Workshop button will (brief §5). Refuses to
// run in production.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.NODE_ENV === "production") {
  console.error("seed-floor refuses to run in production.");
  process.exit(1);
}

const BASE = process.env.API_URL ?? "http://localhost:8080";
const HERE = dirname(fileURLToPath(import.meta.url));

interface Spec {
  title: string;
  rooms: string[];
  hands: string[];
  file: string;
  words: number;
  kind?: "queue" | "volume";
  expectReject?: boolean;
}

// ~14 pieces: varied rooms/hands/word counts, 2 Volumes, one at the 7,499 ceiling and one
// rejected at 7,501 so the sitting can watch the ceiling work.
const PIECES: Spec[] = [
  { title: "The Orchard Ledger", rooms: ["memoir"], hands: ["lyric"], file: "orchard-ledger.txt", words: 6940 },
  { title: "Untitled (opens on a ferry)", rooms: ["fiction"], hands: ["spare"], file: "ferry.txt", words: 4980 },
  { title: "Against the Second Person", rooms: ["essay", "criticism"], hands: ["experimental"], file: "second-person.txt", words: 2315 },
  { title: "Salt Year", rooms: ["poetry"], hands: ["spare"], file: "salt-year.txt", words: 780 },
  { title: "The North Wall", rooms: ["nature", "essay"], hands: ["plain"], file: "north-wall.txt", words: 3220 },
  { title: "The Lending Library", rooms: ["memoir"], hands: ["plain"], file: "lending-library.txt", words: 1560 },
  { title: "Probably", rooms: ["memoir"], hands: ["lyric"], file: "weather-service.txt", words: 4130 },
  { title: "A Coin for Tomorrow", rooms: ["essay"], hands: ["formal"], file: "weather-service.txt", words: 990 },
  { title: "Salt Year (Reprise)", rooms: ["poetry"], hands: ["experimental"], file: "salt-year.txt", words: 1875 },
  { title: "The Room with the Good Silver", rooms: ["criticism"], hands: ["formal"], file: "hollow-crown.txt", words: 5410 },
  { title: "The Hollow Crown of Anna K.", rooms: ["fiction"], hands: ["lyric"], file: "hollow-crown.txt", words: 52000, kind: "volume" },
  { title: "Field Notes for a Coming Weather", rooms: ["nature"], hands: ["plain"], file: "weather-service.txt", words: 24000, kind: "volume" },
  { title: "At the Ceiling", rooms: ["essay"], hands: ["plain"], file: "ferry.txt", words: 7499 },
  { title: "One Word Too Many", rooms: ["essay"], hands: ["plain"], file: "ferry.txt", words: 7501, expectReject: true },
];

const FILLER =
  "The floor reads slowly by design so that nothing true is ever missed and every honest sentence is given the patience it was owed."
    .trim()
    .split(/\s+/);

function toWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function padTo(base: string, target: number): string {
  let words = toWords(base);
  while (words.length < target) words = words.concat(FILLER);
  return words.slice(0, target).join(" ") + "\n";
}

async function api(path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(BASE + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function makeWriter(i: number): Promise<string> {
  const email = `writer${i}@fixtures.wrizo.test`;
  const reg = await api("/api/v1/auth/register", { email, password: "floorfloor" });
  let token: string;
  if (reg.status === 201) {
    token = (await reg.json()).token;
  } else {
    const login = await api("/api/v1/auth/login", { email, password: "floorfloor" });
    token = (await login.json()).token;
  }
  await api("/api/v1/auth/writer", {}, token);
  return token;
}

async function main() {
  const health = await fetch(BASE + "/health").catch(() => null);
  if (!health || !health.ok) {
    console.error(`seed-floor: the API is not up at ${BASE}. Start it first (or run \`pnpm floor\`).`);
    process.exit(1);
  }

  const writers = await Promise.all([0, 1, 2, 3, 4, 5].map(makeWriter));
  console.log(`seed-floor: ${writers.length} writer accounts ready.`);

  let hung = 0;
  let rejected = 0;
  for (let i = 0; i < PIECES.length; i += 1) {
    const spec = PIECES[i]!;
    const token = writers[i % writers.length]!;
    const text = padTo(readFileSync(resolve(HERE, "fixtures", spec.file), "utf8"), spec.words);
    const envelope = {
      contract: "wrizo-bridge/1",
      kind: spec.kind ?? "queue",
      title: spec.title,
      text,
      rooms: spec.rooms,
      hands: spec.hands,
      provenance: {
        sessions: 2 + ((i * 3) % 9),
        span_weeks: 1 + (i % 6),
        composed_in_wrizo: true,
      },
    };
    const res = await api("/api/v1/workshop/submissions", envelope, token);
    if (spec.expectReject) {
      const ok = res.status === 422;
      rejected += ok ? 1 : 0;
      console.log(`  ${ok ? "✓" : "✗"} "${spec.title}" rejected at the ${spec.words}-word ceiling (${res.status})`);
    } else if (res.status === 201) {
      hung += 1;
      console.log(`  ✓ "${spec.title}" (${spec.kind ?? "queue"}, ${spec.words} words)`);
    } else {
      console.log(`  ✗ "${spec.title}" unexpected ${res.status}: ${await res.text()}`);
    }
  }

  console.log(`seed-floor: ${hung} pieces on the floor, ${rejected} correctly refused at the ceiling.`);
}

void main();
