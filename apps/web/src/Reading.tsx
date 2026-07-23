import { useEffect, useState } from "react";
import { api, ApiError, type Piece } from "./api";
import { wordsLabel } from "./format";

// The Reading Table — read-only this ticket. The composer's seat is a quiet placeholder; no dead
// buttons (brief §4).
export function Reading({
  token,
  submissionId,
  onBack,
}: {
  token: string;
  submissionId: string;
  onBack: () => void;
}) {
  const [piece, setPiece] = useState<Piece | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setPiece(null);
    setError(null);
    api
      .piece(token, submissionId)
      .then((p) => live && setPiece(p))
      .catch((err) =>
        live && setError(err instanceof ApiError && err.code === "not_claimant" ? "Your hold on this piece has ended." : "Could not open this piece."),
      );
    return () => {
      live = false;
    };
  }, [token, submissionId]);

  async function release() {
    try {
      await api.release(token, submissionId);
    } finally {
      onBack();
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
  if (!piece) return <p className="empty">Setting the table…</p>;

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
          <button className="btn" type="button" onClick={release}>
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

      <div className="composer-seat">Your reading — arrives with the next ticket.</div>
    </div>
  );
}
