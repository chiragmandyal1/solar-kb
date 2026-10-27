import { useCallback, useEffect, useState } from "react";
import { ask, getTopics, type Answer, type Topics } from "./api";
import { STARTERS, byId } from "./bodies";
import { Scene } from "./Scene";
import { TopicPanel, moonNames } from "./TopicPanel";

type Focus = { body: string; moon: string | null };

function useNarrow() {
  const [n, setN] = useState(() => window.matchMedia("(max-width: 860px)").matches);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 860px)");
    const f = () => setN(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return n;
}

export function App() {
  const narrow = useNarrow();
  const [topics, setTopics] = useState<Topics | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [compact, setCompact] = useState(false);
  const [text, setText] = useState("");
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { getTopics().then(setTopics).catch((e) => setError(e.message)); }, []);

  // an answer belongs to the place it zoomed to: navigating elsewhere drops it
  const clearAnswer = () => { setAnswer(null); setAsked(""); setError(""); };
  const pick = useCallback((id: string) => { setFocus({ body: id, moon: null }); setOpen(id); clearAnswer(); }, []);
  const home = useCallback(() => { setFocus(null); clearAnswer(); }, []);

  const send = useCallback(async (q: string, moonOf?: { body: string; moon: string }) => {
    q = q.trim();
    if (!q || busy) return;
    if (moonOf) { setFocus(moonOf); setOpen(moonOf.body); }
    setAnswer(null); setBusy(true); setError(""); setAsked(q); setText(""); setDrawer(false);
    try {
      const a = await ask(q);
      setAnswer(a);
      const body = a.focus?.body;
      if (body && byId[body]) {
        const sub = a.focus?.subject?.toLowerCase();
        const moon = moonNames(topics, body).find((m) => m.toLowerCase() === sub) ?? null;
        setFocus({ body, moon });
        setOpen(body);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [busy, topics]);

  const fb = focus ? byId[focus.body] : null;
  const moons = focus && focus.body !== "earth" ? moonNames(topics, focus.body) : [];
  const t = focus ? topics?.[focus.body] : null;
  const stats = t
    ? [
        moons.length && `${moons.length} ${moons.length === 1 ? "moon" : "moons"}`,
        t.mission?.length && `${t.mission.length} ${t.mission.length === 1 ? "mission" : "missions"}`,
        `${t.news?.length ?? 0} news`,
      ].filter(Boolean).join(" · ") + " in this dataset"
    : "";

  return (
    <div className={"app" + (narrow ? " narrow" : "") + (compact && !narrow ? " compact" : "")}>
      <Scene
        focus={focus?.body ?? null}
        moons={moons}
        moon={focus?.moon ?? null}
        narrow={narrow}
        onPick={pick}
        onMoon={(m) => focus && send(`Tell me about ${m}`, { body: focus.body, moon: m })}
      />

      {narrow && (
        <button className="menu-btn" aria-label="Show topics" onClick={() => setDrawer(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      )}
      {narrow && drawer && <div className="scrim" onClick={() => setDrawer(false)} />}
      <aside className={"topics glass" + (drawer ? " show" : "")} aria-label="Topics in this dataset">
        <TopicPanel
          topics={topics}
          focus={focus?.body ?? null}
          open={open}
          setOpen={setOpen}
          onPick={pick}
          onBack={home}
          compact={compact && !narrow}
          onToggle={() => setCompact((c) => !c)}
          onMoon={(b, m) => send(`Tell me about ${m}`, { body: b, moon: m })}
        />
      </aside>

      {fb && (
        <>
          <nav className="crumb" aria-label="Breadcrumb">
            <button className="pill" onClick={home}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
              Solar system
            </button>
            <span>/</span>
            <span style={{ color: fb.dot }}>{fb.name}</span>
            {focus?.moon && <><span>/</span><span className="cur">{focus.moon}</span></>}
          </nav>
          <div className="info glass">
            <span className="kind">{focus?.moon ? `Moon of ${fb.name}` : fb.kind}</span>
            <span className="title">{focus?.moon ?? fb.name}</span>
            <span className="stats">{stats}</span>
          </div>
        </>
      )}

      <main className="chat">
        {!fb && <h1>Ask the solar system</h1>}
        {!fb && <p className="hint">Click any body or ask a question to zoom in</p>}

        {(answer || busy || error) && (
          <section className="answer glass" aria-label="Answer" aria-live="polite">
            {asked && <span className="q">{asked}</span>}
            {busy ? <p className="thinking">Searching NASA’s pages…</p> : error ? <p className="err">{error}</p> : answer && (
              <>
                <p>{answer.answer}</p>
                {answer.sources.length > 0 && (
                  <div className="srcs">
                    {answer.sources.map((s) => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 17L17 7M8 7h9v9" /></svg>
                        {s.title} {s.nums.map((n) => `[${n}]`).join("")}
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <form className="ask glass" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <label htmlFor="ask" className="sr">Ask a question</label>
          <input id="ask" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={fb ? `Ask about ${fb.name}…` : "Ask anything about our solar system…"} autoComplete="off" />
          <button type="submit" aria-label="Send" disabled={busy || !text.trim()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </form>

        {!answer && !busy && (
          <div className="starters">
            <span className="label">Try asking</span>
            {STARTERS.map((s) => (
              <button key={s.q} className="glass" onClick={() => send(s.q)}>
                <span>{s.q}</span>
                <small>{s.tag}</small>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
