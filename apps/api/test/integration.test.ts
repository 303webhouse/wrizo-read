import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { build } from "../src/server";
import { createPool } from "../src/db";
import { MemoryStorage, type Storage } from "../src/storage";

// DB-backed property suite. Gated on DATABASE_URL: runs in CI against the Postgres service
// (migrations applied first); skipped on machines without a database.
const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

suite("intake integration (requires Postgres)", () => {
  const pool = createPool(DATABASE_URL ?? "");
  let storage: MemoryStorage;
  let app: ReturnType<typeof build>;

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE reading_ratings, readings, credit_ledger, deposits, authorship, submissions, sessions, credentials, roles, pseudonyms, accounts, archive_access_log CASCADE`,
    );
    storage = new MemoryStorage();
    app = build({ pool, storage });
  });

  afterAll(async () => {
    await pool.end();
  });

  const envelope = (over: Record<string, unknown> = {}) => ({
    contract: "wrizo-bridge/1",
    kind: "queue",
    title: "A Piece",
    text: "hello world\n",
    rooms: ["essay"],
    hands: ["plain"],
    provenance: { sessions: 3, span_weeks: 2, composed_in_wrizo: true },
    ...over,
  });

  async function register(role: "reader" | "writer") {
    const email = `u${Date.now()}${Math.random().toString(36).slice(2)}@x.test`;
    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "password123" },
    });
    const { token, account_id } = reg.json();
    if (role === "writer") {
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/writer",
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      // AX3: posting now costs credits — fund the writer via the dev faucet so intake succeeds.
      await app.inject({
        method: "POST",
        url: "/api/v1/dev/credits",
        headers: { authorization: `Bearer ${token}` },
        payload: { amount: 100 },
      });
    }
    return { token, accountId: account_id as string };
  }

  function submit(token: string, body: Record<string, unknown>, injectApp = app) {
    return injectApp.inject({
      method: "POST",
      url: "/api/v1/workshop/submissions",
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    });
  }

  it("round-trips the contract and returns a receipt with no linkage data", async () => {
    const { token, accountId } = await register("writer");
    const res = await submit(token, envelope());
    expect(res.statusCode).toBe(201);
    const receipt = res.json();
    expect(receipt).toMatchObject({
      submission_id: expect.any(String),
      deposit_id: expect.any(String),
      content_sha256: expect.any(String),
      deposited_at: expect.any(String),
    });
    expect(Object.keys(receipt)).not.toContain("account_id");
    expect(JSON.stringify(receipt)).not.toContain(accountId);
  });

  it("stores linkage in BOTH tables server-side but no endpoint returns it (sealed-linkage)", async () => {
    const { token, accountId } = await register("writer");
    const { submission_id } = (await submit(token, envelope())).json();

    const authorship = await pool.query(`SELECT account_id FROM authorship WHERE submission_id = $1`, [submission_id]);
    const deposits = await pool.query(`SELECT account_id FROM deposits WHERE submission_id = $1`, [submission_id]);
    expect(authorship.rows[0].account_id).toBe(accountId); // linkage exists, sealed
    expect(deposits.rows[0].account_id).toBe(accountId);

    // /me is the caller's own civic view; it must not map any piece to an account.
    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(JSON.stringify(me.json())).not.toContain(submission_id);
  });

  it("rejects a queue piece over the 7,500-word ceiling with a typed error", async () => {
    const { token } = await register("writer");
    const bigText = `${Array.from({ length: 7501 }, (_, i) => `w${i}`).join(" ")}\n`;
    const res = await submit(token, envelope({ text: bigText }));
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("queue_ceiling_exceeded");
  });

  it("deposit atomicity: submissions, authorship, deposits stay one-to-one", async () => {
    const { token } = await register("writer");
    for (let i = 0; i < 3; i += 1) await submit(token, envelope({ text: `piece ${i}\n` }));
    const counts = await pool.query(
      `SELECT (SELECT count(*) FROM submissions) AS s,
              (SELECT count(*) FROM authorship)  AS a,
              (SELECT count(*) FROM deposits)     AS d`,
    );
    expect(counts.rows[0]).toMatchObject({ s: "3", a: "3", d: "3" });
  });

  it("a storage failure leaves no rows (snapshot precedes commit)", async () => {
    const { token } = await register("writer");
    const throwing: Storage = {
      put: async () => {
        throw new Error("storage down");
      },
      get: async () => null,
    };
    const brittle = build({ pool, storage: throwing });
    const res = await submit(token, envelope(), brittle);
    expect(res.statusCode).toBe(500);
    const s = await pool.query(`SELECT count(*)::int AS n FROM submissions`);
    expect(s.rows[0].n).toBe(0);
  });

  it("canonicalization stability yields the same deposit hash across encodings", async () => {
    const { token } = await register("writer");
    const crlf = (await submit(token, envelope({ text: "para one\r\nsecond  \r\n" }))).json();
    const lf = (await submit(token, envelope({ text: "para one\nsecond\n" }))).json();
    expect(crlf.content_sha256).toBe(lf.content_sha256);
  });

  it("the stored snapshot reproduces the receipt hash (verify-deposit parity)", async () => {
    const { token } = await register("writer");
    const receipt = (await submit(token, envelope({ text: "reproduce me\r\n" }))).json();
    const snapshot = await storage.get(`submissions/${receipt.submission_id}/snapshot.txt`);
    const recomputed = createHash("sha256").update(snapshot!.toString("utf8"), "utf8").digest("hex");
    expect(recomputed).toBe(receipt.content_sha256);
  });

  it("rejects a finer-than-session provenance field at the endpoint (seeing law)", async () => {
    const { token } = await register("writer");
    const res = await submit(
      token,
      envelope({ provenance: { sessions: 2, span_weeks: 1, composed_in_wrizo: true, keystroke_ms: [1, 2] } }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_envelope");
  });

  it("requires the writer role (bearer auth)", async () => {
    const { token } = await register("reader");
    expect((await submit(token, envelope())).statusCode).toBe(403);
    const anon = await app.inject({ method: "POST", url: "/api/v1/workshop/submissions", payload: envelope() });
    expect(anon.statusCode).toBe(401);
  });

  it("enforces regenerate-once on the pseudonym", async () => {
    const { token } = await register("writer");
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/auth/pseudonym/regenerate",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/pseudonym/regenerate",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(second.statusCode).toBe(409);
  });
});
