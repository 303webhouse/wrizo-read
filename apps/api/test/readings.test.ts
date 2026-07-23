import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { build } from "../src/server";
import { createPool } from "../src/db";
import { MemoryStorage, type Storage } from "../src/storage";

// DB-backed AX3 property suite (brief §8): the seal, filing, ratings, and the credit economy.
const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

const LONG_BODY = Array.from({ length: 140 }, (_, i) => `word${i}`).join(" "); // >= 120 words

suite("readings, the seal, ratings, and the economy (requires Postgres)", () => {
  const pool = createPool(DATABASE_URL ?? "");
  let storage: MemoryStorage;
  let app: ReturnType<typeof build>;

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE reading_ratings, readings, credit_ledger, claims, deposits, authorship, submissions, sessions, credentials, roles, pseudonyms, accounts, archive_access_log CASCADE`,
    );
    storage = new MemoryStorage();
    app = build({ pool, storage });
  });
  afterAll(async () => {
    await pool.end();
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  async function register() {
    const email = `u${Date.now()}${Math.random().toString(36).slice(2)}@x.test`;
    const reg = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { email, password: "password123" } });
    const { token, account_id } = reg.json();
    await app.inject({ method: "POST", url: "/api/v1/auth/writer", headers: auth(token), payload: {} });
    return { token: token as string, accountId: account_id as string };
  }
  async function faucet(token: string, amount: number) {
    return app.inject({ method: "POST", url: "/api/v1/dev/credits", headers: auth(token), payload: { amount } });
  }
  async function fundedWriter(amount = 100) {
    const w = await register();
    await faucet(w.token, amount);
    return w;
  }
  const envelope = (over: Record<string, unknown> = {}) => ({
    contract: "wrizo-bridge/1",
    kind: "queue",
    title: "A Piece",
    text: "hello world here\n",
    rooms: ["essay"],
    hands: ["plain"],
    provenance: { sessions: 3, span_weeks: 2, composed_in_wrizo: true },
    ...over,
  });
  function post(token: string, over: Record<string, unknown> = {}, injectApp = app) {
    return injectApp.inject({ method: "POST", url: "/api/v1/workshop/submissions", headers: auth(token), payload: envelope(over) });
  }
  const claim = (token: string, id: string) =>
    app.inject({ method: "POST", url: "/api/v1/workshop/claims", headers: auth(token), payload: { submission_id: id } });
  const file = (token: string, id: string, body: string) =>
    app.inject({ method: "POST", url: `/api/v1/workshop/pieces/${id}/readings`, headers: auth(token), payload: { body } });
  const getReadings = (token: string, id: string) =>
    app.inject({ method: "GET", url: `/api/v1/workshop/pieces/${id}/readings`, headers: auth(token) });
  const rate = (token: string, readingId: string, value: string) =>
    app.inject({ method: "POST", url: `/api/v1/workshop/readings/${readingId}/rate`, headers: auth(token), payload: { value } });
  const balanceOf = async (token: string) =>
    (await app.inject({ method: "GET", url: "/api/v1/workshop/credits", headers: auth(token) })).json().balance as number;

  // A funded author posts a queue piece and a reader claims it; returns the ids/tokens.
  async function seededQueuePiece() {
    const author = await fundedWriter();
    const submissionId = (await post(author.token)).json().submission_id as string;
    return { author, submissionId };
  }

  it("seals for a stranger, unseals for a filer — and the sealed payload carries no body text", async () => {
    const { submissionId } = await seededQueuePiece();
    const filer = await register();
    await claim(filer.token, submissionId);
    await file(filer.token, submissionId, LONG_BODY);

    const own = await getReadings(filer.token, submissionId);
    expect(own.json().sealed).toBe(false);
    expect(own.json().readings[0].body).toContain("word0");

    const stranger = await register();
    const sealed = await getReadings(stranger.token, submissionId);
    expect(sealed.json()).toMatchObject({ sealed: true, count: 1 });
    expect(JSON.stringify(sealed.json())).not.toContain("word0"); // no body text anywhere
  });

  it("the author is unsealed on their own piece without filing", async () => {
    const { author, submissionId } = await seededQueuePiece();
    const reader = await register();
    await claim(reader.token, submissionId);
    await file(reader.token, submissionId, LONG_BODY);

    const view = await getReadings(author.token, submissionId);
    expect(view.json().sealed).toBe(false);
    expect(view.json().readings).toHaveLength(1);
  });

  it("filing on your own piece is blocked and the check is audited (reading_self_check)", async () => {
    const { author, submissionId } = await seededQueuePiece();
    const res = await file(author.token, submissionId, LONG_BODY);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("own_piece");
    const audit = await pool.query(
      `SELECT actor FROM archive_access_log WHERE submission_id = $1 AND reason = 'reading_self_check'`,
      [submissionId],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].actor).toBe(author.accountId);
  });

  it("queue filing requires an active claim; Volumes are exempt", async () => {
    const { submissionId } = await seededQueuePiece();
    const reader = await register();
    expect((await file(reader.token, submissionId, LONG_BODY)).statusCode).toBe(403); // no claim

    await claim(reader.token, submissionId);
    expect((await file(reader.token, submissionId, LONG_BODY)).statusCode).toBe(201);

    const author = await fundedWriter();
    const volumeId = (await post(author.token, { kind: "volume", title: "A Volume" })).json().submission_id;
    const other = await register();
    expect((await file(other.token, volumeId, LONG_BODY)).statusCode).toBe(201); // no claim needed
  });

  it("a reading under the 120-word floor is refused, with nothing stored and no credit", async () => {
    const { submissionId } = await seededQueuePiece();
    const reader = await register();
    await claim(reader.token, submissionId);
    const res = await file(reader.token, submissionId, "far too short");
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("reading_too_short");
    expect(await balanceOf(reader.token)).toBe(0);
    const stored = await pool.query(`SELECT count(*)::int AS n FROM readings WHERE account_id = $1`, [reader.accountId]);
    expect(stored.rows[0].n).toBe(0);
  });

  it("filing earns exactly one credit and returns the reader's new balance", async () => {
    const { submissionId } = await seededQueuePiece();
    const reader = await register();
    await claim(reader.token, submissionId);
    const res = await file(reader.token, submissionId, LONG_BODY);
    expect(res.statusCode).toBe(201);
    expect(res.json().balance).toBe(1);
    expect(await balanceOf(reader.token)).toBe(1);
  });

  it("one reading per reader per piece", async () => {
    const { submissionId } = await seededQueuePiece();
    const reader = await register();
    await claim(reader.token, submissionId);
    expect((await file(reader.token, submissionId, LONG_BODY)).statusCode).toBe(201);
    const again = await file(reader.token, submissionId, LONG_BODY);
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe("already_filed");
  });

  it("rating eligibility: author yes, filed peer yes, unfiled peer no, own reading no", async () => {
    const { author, submissionId } = await seededQueuePiece();
    const readerA = await register();
    await claim(readerA.token, submissionId);
    const readingA = (await file(readerA.token, submissionId, LONG_BODY)).json().reading.reading_id;

    // author rates A's reading -> ok (author)
    const byAuthor = await rate(author.token, readingA, "useful");
    expect(byAuthor.statusCode).toBe(200);
    expect(byAuthor.json().rater_kind).toBe("author");

    // a filed peer rates A's reading -> ok (peer)
    const readerB = await register();
    await claim(readerB.token, submissionId);
    await file(readerB.token, submissionId, LONG_BODY);
    const byPeer = await rate(readerB.token, readingA, "somewhat");
    expect(byPeer.statusCode).toBe(200);
    expect(byPeer.json().rater_kind).toBe("peer");

    // an unfiled peer cannot rate (cannot even see the reading)
    const stranger = await register();
    expect((await rate(stranger.token, readingA, "useful")).statusCode).toBe(403);

    // nobody rates their own reading
    expect((await rate(readerA.token, readingA, "useful")).statusCode).toBe(409);
  });

  it("only the reading's owner sees rating counts", async () => {
    const { author, submissionId } = await seededQueuePiece();
    const readerA = await register();
    await claim(readerA.token, submissionId);
    const readingA = (await file(readerA.token, submissionId, LONG_BODY)).json().reading.reading_id;
    await rate(author.token, readingA, "useful");

    const ownView = await getReadings(readerA.token, submissionId);
    expect(ownView.json().readings[0].ratings).toEqual({ useful: 1, somewhat: 0 });

    // the author is unsealed but does not own A's reading -> no counts leaked
    const authorView = await getReadings(author.token, submissionId);
    expect(authorView.json().readings[0].ratings).toBeUndefined();
  });

  it("double-spend: two concurrent posts on a 2-credit account, exactly one lands", async () => {
    const writer = await fundedWriter(2);
    const [a, b] = await Promise.all([post(writer.token), post(writer.token)]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([201, 409]);
    const errored = a.statusCode === 409 ? a : b;
    expect(errored.json().error).toBe("insufficient_credits");
    const rows = await pool.query(`SELECT count(*)::int AS n FROM submissions WHERE id IN (SELECT submission_id FROM authorship WHERE account_id = $1)`, [writer.accountId]);
    expect(rows.rows[0].n).toBe(1);
    expect(await balanceOf(writer.token)).toBe(0);
  });

  it("the ceiling is checked before credits: a 7,501-word queue post burns nothing", async () => {
    const writer = await register(); // zero credits
    const bigText = `${Array.from({ length: 7501 }, (_, i) => `w${i}`).join(" ")}\n`;
    const res = await post(writer.token, { text: bigText });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("queue_ceiling_exceeded");
    expect(await balanceOf(writer.token)).toBe(0);
  });

  it("insufficient credits leaves zero rows", async () => {
    const writer = await register(); // zero credits
    const res = await post(writer.token);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "insufficient_credits", needed: 2, held: 0 });
    const counts = await pool.query(
      `SELECT (SELECT count(*) FROM submissions) AS s, (SELECT count(*) FROM deposits) AS d, (SELECT count(*) FROM credit_ledger) AS c`,
    );
    expect(counts.rows[0]).toMatchObject({ s: "0", d: "0", c: "0" });
  });

  it("non-UUID path params are 404, not a Postgres 500", async () => {
    const reader = await fundedWriter();
    expect((await app.inject({ method: "GET", url: "/api/v1/workshop/pieces/not-a-uuid/readings", headers: auth(reader.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/v1/workshop/readings/not-a-uuid/rate", headers: auth(reader.token), payload: { value: "useful" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/v1/workshop/pieces/nope/readings", headers: auth(reader.token) })).statusCode).toBe(404);
  });

  it("a missing snapshot is a loud 500, never silent empty text", async () => {
    const nullGet: Storage = { put: async () => {}, get: async () => null };
    const brittle = build({ pool, storage: nullGet });
    const author = await fundedWriter();
    const submissionId = (await post(author.token, {}, brittle)).json().submission_id;
    const reader = await register();
    await brittle.inject({ method: "POST", url: "/api/v1/workshop/claims", headers: auth(reader.token), payload: { submission_id: submissionId } });
    const res = await brittle.inject({ method: "GET", url: `/api/v1/workshop/pieces/${submissionId}`, headers: auth(reader.token) });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("snapshot_missing");
  });
});
