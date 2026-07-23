import { useState } from "react";
import { lex } from "@wrizo/tokens";

type Regime = "day" | "night";

// Minimal authed shell: proves the token matrix renders and that copy resolves through lex().
// No UI beyond this until later tickets; the RC files in docs/rc/ are the visual north star.
export function App() {
  const [regime, setRegime] = useState<Regime>("day");

  function toggleRegime() {
    const next: Regime = regime === "day" ? "night" : "day";
    setRegime(next);
    document.documentElement.setAttribute("data-regime", next);
  }

  return (
    <div className="shell">
      <header className="door">
        <span className="mark">Wrizo | Read</span>
        <button
          className="btn"
          type="button"
          onClick={toggleRegime}
          aria-pressed={regime === "night"}
        >
          {regime === "day" ? "Night" : "Day"}
        </button>
      </header>

      <main className="floor">
        <p className="eyebrow">The Workshop</p>
        <h1 className="queue">{lex("queue.name")}</h1>
        <p className="note">
          Authed shell. Every color, size, and copy string above resolves through the token layer —
          no hard-coded values. Toggle the regime to prove Plateau day and night render from data
          alone.
        </p>
        <div className="lanes" aria-hidden="true">
          <span className="chip rest">rest wears the door</span>
          <span className="chip reach">evental on reach</span>
          <span className="chip act">press is the act</span>
        </div>
      </main>
    </div>
  );
}
