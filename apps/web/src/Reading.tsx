import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Piece, type Seal } from "./api";
import { READING_FLOOR, wordsLabel } from "./format";

// The Reading Table with the composer and the live seal (brief §7). A claimant reads the piece,
// files a reading through the paste-railed composer, and the floor's other readings unseal in
// place — rating controls render where eligible.
export function Reading({
  token,
  submissionId,
  onBack,
  onFiled,
}: {
  token: string;
  submissionId: string;
  onBack: () => void;
  onFiled: () => void;
}) {
  const [piece, setPiece] = useState<Piece | null>(null);
  const [seal, setSeal] = useState<Seal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [body, setBody] = useState("");
  const [railFlare, setRailFlare] = useState(false);
  const [filing, setFiling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, s] = await Promise.all([api.piece(token, submissionId), api.readings(token, submissionId)]);
      setPiece(p);
      setSeal(s);
    } catch (err) {
      if (err instanceof ApiError && err.code === "not_claimant") {
        setError("Your hold on this piece has returned to the floor. Claim it again from the Pile to read on.");
      } else if (err instanceof ApiError && err.code === "snapshot_missing") {
        setError("The Archive could not retrieve this piece's text and has flagged it. Nothing is lost — the deposit still stands.");
      } else {
        setError("Could not open this piece.");
      }
    }
  }, [token, submissionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const canFile = words >= READING_FLOOR && !filing;

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault(); // the paste rail — the floor reads human
    setRailFlare(true);
    window.setTimeout(() => setRailFlare(false), 1800);
  }

  async function fileIt() {
    setFiling(true);
    setNotice(null);
    try {
      await api.fileReading(token, submissionId, body);
      setBody("");
      onFiled(); // the credit chip ticks +1
      await load(); // the seal opens in place
    } catch (err) {
      setNotice(err instanceof ApiError ? fileMessage(err.code) : "Could not file your reading.");
    } finally {
      setFiling(false);
    }
  }

  async function doRate(readingId: string, value: "useful" | "somewhat") {
    try {
      await api.rate(token, readingId, value);
      await load();
    } catch {
      setNotice("Could not record that rating.");
    }
  }

  if (error) {
    return (
      <div className="table-view">
        <button className="btn" type="button" onClick={onBack}>
          ← Back to the floor
        </button>
        <p className="notice">{error}</p>
      </div>
    );
  }
  if (!piece || !seal) return <p className="empty">Setting the table…</p>;

  const { card, text, board_bundle, provenance } = piece;

  return (
    <div className="table-view">
      <button className="btn" type="button" onClick={onBack}>
        ← Back to the floor
      </button>

      <header className="table-head">
        <div className="tags">
          {[...card.rooms, ...card.hands].map((t) => (
            <span className="tag" key={t}>
              {t}
            </span>
          ))}
        </div>
        <h2 className="table-title">{card.title}</h2>
        <p className="provenance">
          by the Scriptor · {wordsLabel(card.word_count)} · composed across {provenance.sessions}{" "}
          session{provenance.sessions === 1 ? "" : "s"} over {provenance.span_weeks} week
          {provenance.span_weeks === 1 ? "" : "s"} in Wrizo · Write
        </p>
        {card.kind === "queue" ? (
          <button className="btn" type="button" onClick={() => void api.release(token, submissionId).finally(onBack)}>
            Release this hold
          </button>
        ) : null}
      </header>

      {board_bundle ? (
        <section className="board">
          <button className="btn ghost" type="button" onClick={() => setBoardOpen((v) => !v)} aria-expanded={boardOpen}>
            {boardOpen ? "Hide the Board" : `The Board · ${board_bundle.cards.length} card${board_bundle.cards.length === 1 ? "" : "s"}`}
          </button>
          {boardOpen ? (
            <div className="board-cards">
              {board_bundle.cards.map((b, i) => (
                <div className="board-card" key={i}>
                  <div className="board-card-title">{b.title}</div>
                  <div className="board-card-body">{b.body}</div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <article className="prose">
        {text.split(/\n{2,}/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </article>

      {seal.sealed ? (
        <section className="readings">
          <div className="sealbox">
            {seal.count === 0
              ? "No readings yet — be the first. Yours unseals the rest."
              : `${seal.count} reading${seal.count === 1 ? "" : "s"} here, sealed. File yours and they open — the floor reads blind until you have too.`}
          </div>
          <div className={railFlare ? "composer rail-flare" : "composer"}>
            <label className="field">
              Your reading
              <textarea
                className="composer-input"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onPaste={onPaste}
                rows={8}
                placeholder="Write where you stopped believing, and where you were carried."
              />
            </label>
            <p className="railnote">
              {railFlare ? "Paste is closed on the floor — the floor reads human." : "The floor reads human; write it here."}
            </p>
            <div className="composer-foot">
              <span className="wcline">
                {words} word{words === 1 ? "" : "s"} — the floor asks at least {READING_FLOOR}
              </span>
              <button className="btn solid" type="button" disabled={!canFile} onClick={fileIt}>
                File your reading
              </button>
            </div>
            {notice ? <p className="notice">{notice}</p> : null}
          </div>
        </section>
      ) : (
        <section className="readings">
          <div className="roomhead">
            <h2 className="roomtitle">Readings</h2>
          </div>
          <ul className="readinglist">
            {seal.readings.map((r) => (
              <li className={r.own ? "reading own" : "reading"} key={r.reading_id}>
                <div className="reading-head">
                  <span className="reading-name">{r.reader_name}</span>
                  {r.own ? <span className="reading-badge">your reading</span> : null}
                  <span className="reading-meta">{wordsLabel(r.word_count)}</span>
                </div>
                <p className="reading-body">{r.body}</p>
                {r.own && r.ratings ? (
                  <p className="reading-meta">
                    {r.ratings.useful} found this useful · {r.ratings.somewhat} somewhat
                  </p>
                ) : null}
                {!r.own ? (
                  <div className="rateline">
                    <span className="reading-meta">Was this useful?</span>
                    <button className="btn ghost" type="button" onClick={() => doRate(r.reading_id, "useful")}>
                      Useful
                    </button>
                    <button className="btn ghost" type="button" onClick={() => doRate(r.reading_id, "somewhat")}>
                      Somewhat
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {notice ? <p className="notice">{notice}</p> : null}
        </section>
      )}
    </div>
  );
}

function fileMessage(code: string): string {
  switch (code) {
    case "reading_too_short":
      return "The floor asks at least 120 words. Stay a little longer.";
    case "already_filed":
      return "You've already filed your reading on this piece.";
    case "own_piece":
      return "That piece is yours — you can read the floor's readings, but not file on your own.";
    case "not_claimant":
      return "Your hold has returned to the floor. Claim the piece again to file.";
    default:
      return "Could not file your reading.";
  }
}
