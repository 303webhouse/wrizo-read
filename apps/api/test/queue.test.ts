import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { build } from "../src/server";
import { createPool } from "../src/db";
import { MemoryStorage } from "../src/storage";

// DB-backed AX2 property suite (brief §6). Gated on DATABASE_URL; runs in CI against Postgres.
const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

suite("the Queue — serving, claims, text access (requires Postgres)", () => {
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

  async function writer() {
    const email = `u${Date.now()}${Math.random().toString(36).slice(2)}@x.test`;
    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "password123" },
    });
    const { token, account_id } = reg.json();
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
    return { token: token as string, accountId: account_id as string };
  }

  function envelope(over: Record<string, unknown> = {}) {
    return {
      contract: "wrizo-bridge/1",
      kind: "queue",
      title: "A Piece",
      text: "hello world\n",
      rooms: ["essay"],
      hands: ["plain"],
      provenance: { sessions: 3, span_weeks: 2, composed_in_wrizo: true },
      ...over,
    };
  }

  async function post(token: string, over: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/workshop/submissions",
      headers: { authorization: `Bearer ${token}` },
      payload: envelope(over),
    });
    return res.json().submission_id as string;
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  function claim(token: string, submissionId: string) {
    return app.inject({
      method: "POST",
      url: "/api/v1/workshop/claims",
      headers: auth(token),
      payload: { submission_id: submissionId },
    });
  }

  it("card serializer emits no linkage and no pseudonym", async () => {
    const author = await writer();
    await post(author.token, { title: "Sealed Card" });
    const reader = await writer();
    const res = await app.inject({ method: "GET", url: "/api/v1/workshop/queue", headers: auth(reader.token) });
    expect(res.statusCode).toBe(200);
    const cards = res.json();
    expect(cards).toHaveLength(1);
    expect(Object.keys(cards[0])).toEqual(
      expect.arrayContaining(["submission_id", "title", "kind", "word_count", "rooms", "hands", "provenance", "created_at", "readers_so_far"]),
    );
    expect(Object.keys(cards[0])).not.toContain("account_id");
    const body = JSON.stringify(cards);
    expect(body).not.toContain(author.accountId);
    expect(body.toLowerCase()).not.toContain("pseudonym");
  });

  it("claimant-only text access, with the Volume exception and board bundle", async () => {
    const author = await writer();
    const queuePiece = await post(author.token, {
      title: "Queue Piece",
      board_bundle: { format: "wrizo-board/1", cards: [{ title: "beat", body: "the turn" }] },
    });
    const volume = await post(author.token, { kind: "volume", title: "A Volume", rooms: ["essay"] });

    const reader = await writer();
    // Non-claimant cannot read a queue piece's text.
    const denied = await app.inject({ method: "GET", url: `/api/v1/workshop/pieces/${queuePiece}`, headers: auth(reader.token) });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toBe("not_claimant");

    // Claim, then the text (and board bundle) is served.
    expect((await claim(reader.token, queuePiece)).statusCode).toBe(201);
    const granted = await app.inject({ method: "GET", url: `/api/v1/workshop/pieces/${queuePiece}`, headers: auth(reader.token) });
    expect(granted.statusCode).toBe(200);
    expect(granted.json().text).toContain("hello world");
    expect(granted.json().board_bundle.cards[0].title).toBe("beat");

    // Volumes are open by choice — any writer reads them, no claim.
    const vol = await app.inject({ method: "GET", url: `/api/v1/workshop/pieces/${volume}`, headers: auth(reader.token) });
    expect(vol.statusCode).toBe(200);
    expect(vol.json().text).toContain("hello world");
  });

  it("self-claim is blocked and the check is audited (reason claim_self_check)", async () => {
    const author = await writer();
    const piece = await post(author.token);
    const res = await claim(author.token, piece);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("own_piece");

    const audit = await pool.query(
      `SELECT actor, reason FROM archive_access_log WHERE submission_id = $1 AND reason = 'claim_self_check'`,
      [piece],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].actor).toBe(author.accountId);
  });

  it("enforces the 3-active-claim cap", async () => {
    const author = await writer();
    const pieces = await Promise.all([0, 1, 2, 3].map((i) => post(author.token, { title: `P${i}` })));
    const reader = await writer();
    for (const id of pieces.slice(0, 3)) expect((await claim(reader.token, id)).statusCode).toBe(201);
    const fourth = await claim(reader.token, pieces[3]!);
    expect(fourth.statusCode).toBe(409);
    expect(fourth.json().error).toBe("claim_limit");
  });

  it("rejects a duplicate active claim on the same piece", async () => {
    const author = await writer();
    const piece = await post(author.token);
    const reader = await writer();
    expect((await claim(reader.token, piece)).statusCode).toBe(201);
    const again = await claim(reader.token, piece);
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe("already_claimed");
  });

  it("lazy expiry: an expired hold neither blocks re-claim nor grants text", async () => {
    const author = await writer();
    const piece = await post(author.token);
    const reader = await writer();
    expect((await claim(reader.token, piece)).statusCode).toBe(201);

    // Simulate the four hours elapsing.
    await pool.query(`UPDATE claims SET expires_at = now() - interval '1 hour' WHERE submission_id = $1`, [piece]);

    // Text no longer served; the hold is not listed.
    const stale = await app.inject({ method: "GET", url: `/api/v1/workshop/pieces/${piece}`, headers: auth(reader.token) });
    expect(stale.statusCode).toBe(403);
    const mine = await app.inject({ method: "GET", url: "/api/v1/workshop/claims/mine", headers: auth(reader.token) });
    expect(mine.json()).toHaveLength(0);

    // Re-claim succeeds — the expired hold does not block it.
    expect((await claim(reader.token, piece)).statusCode).toBe(201);
  });

  it("tail-weighted ordering is deterministic: least-claimed then oldest", async () => {
    const author = await writer();
    const a = await post(author.token, { title: "A oldest" });
    const b = await post(author.token, { title: "B middle" });
    const c = await post(author.token, { title: "C newest" });
    const r1 = await writer();
    const r2 = await writer();
    const observer = await writer();
    // A claimed twice, B once, C zero -> counts invert creation order.
    await claim(r1.token, a);
    await claim(r2.token, a);
    await claim(r1.token, b);

    const res = await app.inject({ method: "GET", url: "/api/v1/workshop/queue", headers: auth(observer.token) });
    const order = res.json().map((card: { submission_id: string }) => card.submission_id);
    expect(order).toEqual([c, b, a]); // C(0) < B(1) < A(2)
  });

  it("filters the queue by room and hand (any-match)", async () => {
    const author = await writer();
    await post(author.token, { title: "Poem", rooms: ["poetry"], hands: ["lyric"] });
    await post(author.token, { title: "Essay", rooms: ["essay"], hands: ["plain"] });
    const reader = await writer();
    const poems = await app.inject({ method: "GET", url: "/api/v1/workshop/queue?rooms=poetry", headers: auth(reader.token) });
    const titles = poems.json().map((c: { title: string }) => c.title);
    expect(titles).toEqual(["Poem"]);
  });

  it("volumes are excluded from the queue list and from deal", async () => {
    const author = await writer();
    await post(author.token, { kind: "volume", title: "Big Volume" });
    await post(author.token, { title: "Queue Piece" });
    const reader = await writer();

    const queue = await app.inject({ method: "GET", url: "/api/v1/workshop/queue", headers: auth(reader.token) });
    expect(queue.json().every((c: { kind: string }) => c.kind === "queue")).toBe(true);

    const volumes = await app.inject({ method: "GET", url: "/api/v1/workshop/volumes", headers: auth(reader.token) });
    expect(volumes.json().every((c: { kind: string }) => c.kind === "volume")).toBe(true);

    const dealt = await app.inject({ method: "GET", url: "/api/v1/workshop/queue/deal", headers: auth(reader.token) });
    expect(dealt.json().kind).toBe("queue");
  });

  it("deal-me-one never returns the requester's own piece or one they hold", async () => {
    const author = await writer();
    const own = await post(author.token, { title: "Author's own" });
    const other = await post((await writer()).token, { title: "Someone else's" });
    // Author asks to be dealt one: their own piece is excluded, so they get the other.
    const dealt = await app.inject({ method: "GET", url: "/api/v1/workshop/queue/deal", headers: auth(author.token) });
    expect(dealt.statusCode).toBe(200);
    expect(dealt.json().submission_id).toBe(other);
    expect(dealt.json().submission_id).not.toBe(own);
  });

  it("release returns the hold and requires an active claim", async () => {
    const author = await writer();
    const piece = await post(author.token);
    const reader = await writer();
    await claim(reader.token, piece);
    const released = await app.inject({ method: "POST", url: `/api/v1/workshop/claims/${piece}/release`, headers: auth(reader.token), payload: {} });
    expect(released.json()).toEqual({ released: true });
    const again = await app.inject({ method: "POST", url: `/api/v1/workshop/claims/${piece}/release`, headers: auth(reader.token), payload: {} });
    expect(again.statusCode).toBe(404);
  });

  it("requires the writer role on queue endpoints", async () => {
    const anon = await app.inject({ method: "GET", url: "/api/v1/workshop/queue" });
    expect(anon.statusCode).toBe(401);
  });
});
