import { useState } from "react";
import { lex } from "@wrizo/tokens";
import { api, ApiError } from "./api";
import { Queue } from "./Queue";
import { Reading } from "./Reading";
import { Holds } from "./Holds";

type Regime = "day" | "night";
type Session = { token: string; pseudonym: string };
type Route = { name: "queue" } | { name: "holds" } | { name: "table"; id: string };

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [route, setRoute] = useState<Route>({ name: "queue" });
  const [regime, setRegime] = useState<Regime>("day");

  function toggleRegime() {
    const next: Regime = regime === "day" ? "night" : "day";
    setRegime(next);
    document.documentElement.setAttribute("data-regime", next);
  }

  if (!session) return <Door onEnter={setSession} regime={regime} onToggleRegime={toggleRegime} />;

  return (
    <div className="shell">
      <header className="door">
        <span className="mark">Wrizo | Read</span>
        <nav className="topnav">
          <button
            className={route.name === "queue" ? "navlink on" : "navlink"}
            type="button"
            onClick={() => setRoute({ name: "queue" })}
          >
            {lex("queue.name")}
          </button>
          <button
            className={route.name === "holds" ? "navlink on" : "navlink"}
            type="button"
            onClick={() => setRoute({ name: "holds" })}
          >
            My holds
          </button>
        </nav>
        <span className="deskline">
          <span className="id">
            <b>{session.pseudonym}</b>
          </span>
          <button className="btn" type="button" onClick={toggleRegime} aria-pressed={regime === "night"}>
            {regime === "day" ? "Night" : "Day"}
          </button>
          <button className="btn ghost" type="button" onClick={() => setSession(null)}>
            Sign out
          </button>
        </span>
      </header>

      <main className="floor">
        {route.name === "queue" ? (
          <Queue token={session.token} onOpen={(id) => setRoute({ name: "table", id })} />
        ) : route.name === "holds" ? (
          <Holds token={session.token} onOpen={(id) => setRoute({ name: "table", id })} />
        ) : (
          <Reading token={session.token} submissionId={route.id} onBack={() => setRoute({ name: "queue" })} />
        )}
      </main>
    </div>
  );
}

// The Door: minimal register/login + writer-grant (dev). The session token lives in memory only
// (brief §4) — a refresh returns you here, by design this ticket.
function Door({
  onEnter,
  regime,
  onToggleRegime,
}: {
  onEnter: (s: Session) => void;
  regime: Regime;
  onToggleRegime: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter(mode: "register" | "login") {
    setBusy(true);
    setError(null);
    try {
      const auth = mode === "register" ? await api.register(email, password) : await api.login(email, password);
      const me = await api.me(auth.token);
      const pseudonym =
        me.roles.includes("writer") && me.pseudonym
          ? me.pseudonym
          : (await api.becomeWriter(auth.token)).pseudonym;
      onEnter({ token: auth.token, pseudonym });
    } catch (err) {
      setError(err instanceof ApiError ? doorMessage(err.code) : "Could not reach the floor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <header className="door">
        <span className="mark">Wrizo | Read</span>
        <button className="btn" type="button" onClick={onToggleRegime} aria-pressed={regime === "night"}>
          {regime === "day" ? "Night" : "Day"}
        </button>
      </header>
      <main className="floor door-floor">
        <p className="eyebrow">The Workshop</p>
        <h1 className="queue">Come in</h1>
        <p className="note">
          The floor reads blind and honestly. Enter with an email and a passphrase; a reviewer name
          is minted for you at the door.
        </p>
        <form
          className="doorform"
          onSubmit={(e) => {
            e.preventDefault();
            void enter("login");
          }}
        >
          <label className="field">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </label>
          <label className="field">
            Passphrase
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              minLength={8}
              required
            />
          </label>
          {error ? <p className="notice">{error}</p> : null}
          <div className="doorbtns">
            <button className="btn solid" type="submit" disabled={busy}>
              Sign in
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => void enter("register")}>
              Create an account
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function doorMessage(code: string): string {
  switch (code) {
    case "email_taken":
      return "That email already has an account — sign in instead.";
    case "unauthorized":
      return "Email or passphrase not recognised.";
    case "invalid_credentials":
      return "A passphrase needs at least eight characters.";
    default:
      return "Could not reach the floor.";
  }
}
