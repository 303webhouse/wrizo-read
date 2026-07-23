import { useCallback, useEffect, useState } from "react";
import { api, type Hold } from "./api";
import { remainingLabel, useNow } from "./format";

// My holds — the reader's active four-hour holds, with live countdowns and release.
export function Holds({ token, onOpen }: { token: string; onOpen: (id: string) => void }) {
  const [holds, setHolds] = useState<Hold[]>([]);
  const [loading, setLoading] = useState(true);
  const now = useNow();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setHolds(await api.mine(token));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function release(id: string) {
    await api.release(token, id);
    await refresh();
  }

  if (loading) return <p className="empty">Counting your holds…</p>;
  if (holds.length === 0)
    return <p className="empty">No holds right now. Claim a piece from the Pile and it will wait here for four hours.</p>;

  return (
    <div>
      <div className="roomhead">
        <h2 className="roomtitle">My holds</h2>
      </div>
      <ul className="holds">
        {holds.map((h) => (
          <li className="hold" key={h.submission_id}>
            <span className="hold-time">{remainingLabel(h.expires_at, now)}</span>
            <span className="hold-actions">
              <button className="btn solid" type="button" onClick={() => onOpen(h.submission_id)}>
                Read
              </button>
              <button className="btn" type="button" onClick={() => release(h.submission_id)}>
                Release
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
