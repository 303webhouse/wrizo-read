#!/usr/bin/env tsx
// seed-floor — the bridge's stand-in for a hands-on sitting. There is no web upload form for
// Workshop pieces and never will be; this dev-only tool posts fixtures through the REAL publish
// API (wrizo-bridge/1), exactly as Wrizo | Write's Workshop button will (brief §5, §8). Refuses to
// run in production. AX3: it also funds the writers, pre-files a spread of readings so pieces carry
// varied sealed counts, and leaves one writer holding exactly 1 credit so the sitting can watch a
// queue post refused for insufficient credits, beside the ceiling refusal.
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

// ~14 pieces: varied rooms/hands/word counts, 2 Volumes, one at the 7,499 ceiling and one refused
// at 7,501. author = writers[i % 6].
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

// Which readings to pre-file: readerIndex files on the queue piece at postedQueue[pieceIdx],
// using a reading fixture. Reader must differ from the piece's author (all pairs below do).
const READINGS = [
  { reader: 2, piece: 0, file: "reading-b.txt" },
  { reader: 3, piece: 0, file: "reading-b.txt" },
  { reader: 4, piece: 1, file: "reading-a.txt" },
  { reader: 0, piece: 2, file: "reading-c.txt" },
  { reader: 5, piece: 3, file: "reading-b.txt" },
];

const FILLER =
  "The floor reads slowly by design so that nothing true is ever missed and every honest sentence is given the patience it was owed."
    .trim()
    .split(/\s+/);

const toWords = (text: string) => text.trim().split(/\s+/).filter(Boolean);

function padTo(base: string, target: number): string {
  let words = toWords(base);
  while (words.length < target) words = words.concat(FILLER);
  return words.slice(0, target).join(" ") + "\n";
}
function atLeast(base: string, min: number): string {
  let words = toWords(base);
  while (words.length < min) words = words.concat(FILLER);
  return words.join(" ") + "\n";
}
const fixture = (name: string) => readFileSync(resolve(HERE, "fixtures", name), "utf8");

async function api(path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function makeWriter(email: string): Promise<string> {
  const reg = await api("/api/v1/auth/register", { email, password: "floorfloor" });
  const token = reg.status === 201
    ? (await reg.json()).token
    : (await (await api("/api/v1/auth/login", { email, password: "floorfloor" })).json()).token;
  await api("/api/v1/auth/writer", {}, token);
  return token;
}

async function main() {
  const health = await fetch(BASE + "/health").catch(() => null);
  if (!health || !health.ok) {
    console.error(`seed-floor: the API is not up at ${BASE}. Start it first (or run \`pnpm floor\`).`);
    process.exit(1);
  }

  const writers = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => makeWriter(`writer${i}@fixtures.wrizo.test`)));
  // Fund the writers so they can post (no starter credits by law; the faucet is the dev stand-in).
  await Promise.all(writers.map((t) => api("/api/v1/dev/credits", { amount: 100 }, t)));
  console.log(`seed-floor: ${writers.length} writers, funded.`);

  const postedQueue: { id: string; authorIndex: number }[] = [];
  let hung = 0;
  let rejected = 0;
  for (let i = 0; i < PIECES.length; i += 1) {
    const spec = PIECES[i]!;
    const authorIndex = i % writers.length;
    const token = writers[authorIndex]!;
    const envelope = {
      contract: "wrizo-bridge/1",
      kind: spec.kind ?? "queue",
      title: spec.title,
      text: padTo(fixture(spec.file), spec.words),
      rooms: spec.rooms,
      hands: spec.hands,
      provenance: { sessions: 2 + ((i * 3) % 9), span_weeks: 1 + (i % 6), composed_in_wrizo: true },
    };
    const res = await api("/api/v1/workshop/submissions", envelope, token);
    if (spec.expectReject) {
      const ok = res.status === 422;
      rejected += ok ? 1 : 0;
      console.log(`  ${ok ? "✓" : "✗"} "${spec.title}" refused at the ${spec.words}-word ceiling (${res.status})`);
    } else if (res.status === 201) {
      hung += 1;
      if ((spec.kind ?? "queue") === "queue") postedQueue.push({ id: (await res.json()).submission_id, authorIndex });
      console.log(`  ✓ "${spec.title}" (${spec.kind ?? "queue"}, ${spec.words} words)`);
    } else {
      console.log(`  ✗ "${spec.title}" unexpected ${res.status}: ${await res.text()}`);
    }
  }

  // Pre-file a spread of readings — claim, then file (>= 120 words) — so pieces carry sealed counts.
  let filed = 0;
  for (const r of READINGS) {
    const piece = postedQueue[r.piece];
    if (!piece || r.reader === piece.authorIndex) continue;
    const token = writers[r.reader]!;
    await api("/api/v1/workshop/claims", { submission_id: piece.id }, token);
    const res = await api(`/api/v1/workshop/pieces/${piece.id}/readings`, { body: atLeast(fixture(r.file), 125) }, token);
    if (res.status === 201) filed += 1;
    else console.log(`  ✗ reading by writer${r.reader} on ${piece.id} → ${res.status}`);
  }
  console.log(`seed-floor: ${filed} readings filed — several pieces now carry sealed counts.`);

  // Leave one writer holding exactly 1 credit and watch a queue post refused (needs 2).
  const lean = await makeWriter("writer-lean@fixtures.wrizo.test");
  await api("/api/v1/dev/credits", { amount: 1 }, lean);
  const leanPost = await api("/api/v1/workshop/submissions", {
    contract: "wrizo-bridge/1",
    kind: "queue",
    title: "A Reach Beyond the Purse",
    text: padTo(fixture("salt-year.txt"), 900),
    rooms: ["poetry"],
    hands: ["spare"],
    provenance: { sessions: 2, span_weeks: 1, composed_in_wrizo: true },
  }, lean);
  const leanBody = await leanPost.json();
  const okRefusal = leanPost.status === 409 && leanBody.error === "insufficient_credits";
  console.log(`  ${okRefusal ? "✓" : "✗"} lean writer's queue post refused: ${leanBody.error} (needed ${leanBody.needed}, held ${leanBody.held})`);

  console.log(`seed-floor: ${hung} pieces on the floor, ${filed} readings, ${rejected} refused at the ceiling, 1 refused for credits.`);
}

void main();
