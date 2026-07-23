import { useCallback, useEffect, useMemo, useState } from "react";
import { lex } from "@wrizo/tokens";
import { api, ApiError, type Card, type Hold } from "./api";
import { readersLabel, remainingLabel, useNow, waitingLabel, wordsLabel } from "./format";

type Sort = "tail" | "newest" | "shortest";

export function Queue({ token, onOpen }: { token: string; onOpen: (id: string) => void }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [volumes, setVolumes] = useState<Card[]>([]);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [rooms, setRooms] = useState<string[]>([]);
  const [hands, setHands] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>("tail");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const now = useNow();

  const held = useMemo(() => new Set(holds.map((h) => h.submission_id)), [holds]);
  const holdBy = useMemo(() => new Map(holds.map((h) => [h.submission_id, h])), [holds]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (rooms.length) p.set("rooms", rooms.join(","));
    if (hands.length) p.set("hands", hands.join(","));
    p.set("sort", sort);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [rooms, hands, sort]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [q, v, m] = await Promise.all([api.queue(token, query), api.volumes(token), api.mine(token)]);
      setCards(q);
      setVolumes(v);
      setHolds(m);
    } finally {
      setLoading(false);
    }
  }, [token, query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Filter chips are derived from what the floor actually holds — no invented taxonomy.
  const [allRooms, allHands] = useMemo(() => {
    const r = new Set<string>();
    const h = new Set<string>();
    for (const c of [...cards, ...volumes]) {
      c.rooms.forEach((x) => r.add(x));
      c.hands.forEach((x) => h.add(x));
    }
    return [[...r].sort(), [...h].sort()];
  }, [cards, volumes]);

  function toggle(list: string[], value: string, set: (v: string[]) => void) {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  async function doClaim(id: string) {
    setNotice(null);
    try {
      await api.claim(token, id);
      await refresh(); // the card flips to its held state — countdown + Read — in place
    } catch (err) {
      setNotice(err instanceof ApiError ? claimMessage(err.code) : "Something went wrong.");
    }
  }

  async function dealMeOne() {
    setNotice(null);
    try {
      const card = await api.deal(token);
      await api.claim(token, card.submission_id);
      onOpen(card.submission_id); // dealt: claimed and opened straight to the table
    } catch (err) {
      setNotice(
        err instanceof ApiError && err.code === "pile_empty"
          ? `${lex("queue.name")} is empty right now.`
          : "Could not deal a piece.",
      );
    }
  }

  return (
    <div>
      <div className="roomhead">
        <h2 className="roomtitle">{lex("queue.name")}</h2>
        <button className="btn" type="button" onClick={dealMeOne}>
          Deal me one
        </button>
      </div>

      <div className="filters" role="group" aria-label="Filters">
        {allRooms.map((r) => (
          <button
            key={r}
            type="button"
            className={rooms.includes(r) ? "fchip on" : "fchip"}
            aria-pressed={rooms.includes(r)}
            onClick={() => toggle(rooms, r, setRooms)}
          >
            {r}
          </button>
        ))}
        {allHands.map((h) => (
          <button
            key={h}
            type="button"
            className={hands.includes(h) ? "fchip on" : "fchip"}
            aria-pressed={hands.includes(h)}
            onClick={() => toggle(hands, h, setHands)}
          >
            {h}
          </button>
        ))}
        <label className="sortsel">
          sorted
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="tail">oldest &amp; least-read</option>
            <option value="newest">newest</option>
            <option value="shortest">shortest</option>
          </select>
        </label>
      </div>

      {notice ? <p className="notice">{notice}</p> : null}

      {loading ? (
        <p className="empty">Reading the floor…</p>
      ) : cards.length === 0 ? (
        <p className="empty">
          {lex("queue.name")} is quiet — nothing waiting. Either the floor is caught up, or the
          writing is still happening in the rooms behind it.
        </p>
      ) : (
        <div className="qgrid">
          {cards.map((c) => {
            const hold = holdBy.get(c.submission_id);
            return (
              <article className="qcard" key={c.submission_id}>
                <div className="tags">
                  {[...c.rooms, ...c.hands].map((t) => (
                    <span className="tag" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
                <h3>{c.title}</h3>
                <div className="sealedline">by the Scriptor · {wordsLabel(c.word_count)}</div>
                <div className="foot">
                  {held.has(c.submission_id) && hold ? (
                    <>
                      <span>You hold this · {remainingLabel(hold.expires_at, now)}</span>
                      <button className="btn solid" type="button" onClick={() => onOpen(c.submission_id)}>
                        Read
                      </button>
                    </>
                  ) : (
                    <>
                      <span>
                        {waitingLabel(c.created_at, now)} · {readersLabel(c.readers_so_far)}
                      </span>
                      <button className="btn solid claim" type="button" onClick={() => doClaim(c.submission_id)}>
                        Claim · 4h hold
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {volumes.length > 0 ? (
        <>
          <div className="roomhead">
            <h2 className="roomtitle">Volumes</h2>
          </div>
          <div className="qgrid">
            {volumes.map((c) => (
              <article className="qcard volume" key={c.submission_id}>
                <div className="tags">
                  {[...c.rooms, ...c.hands].map((t) => (
                    <span className="tag" key={t}>
                      {t}
                    </span>
                  ))}
                  <span className="tag">Volume</span>
                </div>
                <h3>{c.title}</h3>
                <div className="sealedline">by the Scriptor · {wordsLabel(c.word_count)} · a whole book</div>
                <div className="vol-note">
                  Volumes live outside the quota — never served, only chosen. Reading one is a gift.
                </div>
                <div className="foot">
                  <span>{readersLabel(c.readers_so_far)}</span>
                  <button className="btn" type="button" onClick={() => onOpen(c.submission_id)}>
                    Open by choice
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function claimMessage(code: string): string {
  switch (code) {
    case "own_piece":
      return "That piece is yours — the floor reads blind, but not that blind.";
    case "already_claimed":
      return "You already hold this one.";
    case "claim_limit":
      return "You hold three already. Read or release one before claiming another.";
    case "not_claimable":
      return "That piece isn't in the queue.";
    default:
      return "Could not claim that piece.";
  }
}
