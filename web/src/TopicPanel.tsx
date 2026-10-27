import { useState } from "react";
import { BODIES, clean } from "./bodies";
import type { Topics } from "./api";

type Props = {
  topics: Topics | null;
  focus: string | null;
  open: string | null;
  setOpen: (id: string | null) => void;
  onPick: (id: string) => void;
  onBack: () => void;
  compact: boolean;
  onToggle: () => void;
  onMoon: (body: string, name: string) => void;
};

export const moonNames = (topics: Topics | null, body: string) =>
  [...new Set((topics?.[body]?.moon ?? []).map((m) => clean(m.title)).filter((n) => !/^all\b/i.test(n)))];

export function TopicPanel({ topics, focus, open, setOpen, onPick, onBack, compact, onToggle, onMoon }: Props) {
  const [filter, setFilter] = useState("");
  const [allNews, setAllNews] = useState<string | null>(null);
  const q = compact ? "" : filter.trim().toLowerCase();
  const total = topics ? Object.values(topics).reduce((n, t) => n + Object.values(t).reduce((m, a) => m + a.length, 0), 0) : 0;

  const rows = BODIES.filter((b) => {
    if (!q) return true;
    const t = topics?.[b.id];
    return b.name.toLowerCase().includes(q) || Object.values(t ?? {}).some((a) => a.some((i) => clean(i.title).toLowerCase().includes(q)));
  });

  return (
    <div className="topics-inner">
      <div className="topics-head">
        <div className="head-row">
          <span className="brand">Solar-kb</span>
          <button className="collapse" aria-label={compact ? "Expand topics" : "Collapse topics"} onClick={onToggle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${compact ? 180 : 0}deg)` }}>
              <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
            </svg>
          </button>
        </div>
        {!compact && (
          <>
            <span className="sub">{topics ? `${total} NASA pages · ${BODIES.length} bodies · moons, missions, news` : "Loading topics…"}</span>
            <input aria-label="Filter topics" placeholder="Filter topics" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </>
        )}
      </div>
      <div className="topics-list">
        {rows.map((b) => {
          const t = topics?.[b.id] ?? {};
          const pages = Object.values(t).reduce((n, a) => n + a.length, 0);
          const moons = moonNames(topics, b.id);
          const missions = [...new Set((t.mission ?? []).map((m) => clean(m.title)))];
          const news = t.news ?? [];
          const isOpen = !compact && (open === b.id || (!!q && pages > 0));
          const shown = allNews === b.id ? news : news.slice(0, 3);
          return (
            <div key={b.id} className={"row" + (isOpen ? " open" : "")}>
              <button
                className="row-head"
                aria-expanded={isOpen}
                onClick={() => {
                  if (compact) { if (focus === b.id) onBack(); else onPick(b.id); return; }
                  if (isOpen) { setOpen(null); if (focus === b.id) onBack(); } // re-click closes and zooms back out
                  else onPick(b.id);
                }}
              >
                <span className="dot" style={{ background: b.dot }} />
                <span className="row-name">
                  <span className={focus === b.id ? "on" : ""}>{b.name}</span>
                  {!compact && <small>{b.kind}</small>}
                </span>
                {!compact && (
                  <>
                    <span className="mono">{pages}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: `rotate(${isOpen ? 90 : 0}deg)` }}>
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </>
                )}
              </button>
              {isOpen && (
                <div className="row-body">
                  {moons.length > 0 && (
                    <div>
                      <h4>Moons · {moons.length}</h4>
                      <div className="chips">
                        {moons.map((m) => <button key={m} onClick={() => onMoon(b.id, m)}>{m}</button>)}
                      </div>
                    </div>
                  )}
                  {missions.length > 0 && (
                    <div>
                      <h4>Missions · {missions.length}</h4>
                      {missions.map((m) => <span key={m} className="line">{m}</span>)}
                    </div>
                  )}
                  <div>
                    <h4>News · {news.length}</h4>
                    {shown.map((n) => (
                      <a key={n.url} href={n.url} target="_blank" rel="noreferrer" className="news">
                        <span>{clean(n.title)}</span>
                        <span className="mono">{n.date}</span>
                      </a>
                    ))}
                    {news.length > 3 && (
                      <button className="more" onClick={() => setAllNews(allNews === b.id ? null : b.id)}>
                        {allNews === b.id ? "Show less" : `View all ${news.length} news`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <p className="empty">Nothing matches “{filter}”.</p>}
      </div>
    </div>
  );
}
