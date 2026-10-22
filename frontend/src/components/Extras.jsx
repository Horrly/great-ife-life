// Daily rituals and campus moments: the daily riddle, the SUG election, big-spender banners, and the
// till slip of what you spent at a place.
import { useEffect, useState } from "react";
import { naira } from "../lib/format";
import { useGame } from "../lib/game";
import { sfx } from "../lib/sfx";
import { BottomSheet } from "./ui";

export function RiddleSheet({ game, onClose, onSearch, busy }) {
  const { riddle } = useGame();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    riddle().then(setData).catch((e) => setErr(e.message));
  }, [riddle, game.turn]);
  const here = game.at;
  return (
    <BottomSheet onClose={onClose} label="Campus riddle" height="auto"
      header={<span className="display block text-[1.4rem] text-ife-900">🔎 Campus riddle</span>}>
      {err && <p className="text-sm text-danger">{err}</p>}
      {!data && !err && <p className="text-sm text-muted">Reading today's clue…</p>}
      {data && (
        <div className="space-y-3">
          <blockquote className="rounded-2xl bg-[#1d2f6b] px-4 py-4 text-[1.05rem] font-semibold leading-relaxed text-white">“{data.clue}”</blockquote>
          {data.found ? (
            <p className="rounded-xl bg-[#e3f3ea] px-3 py-2 text-sm font-semibold text-ife-900">
              You found it at {data.place}: finder #{data.rank}, +{naira(data.prize)}. A new riddle comes at midnight.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">Go to the place the clue describes and search it. {data.finders} {data.finders === 1 ? "student has" : "students have"} found it today.</p>
              <button className="btn w-full rounded-full bg-go py-3.5 text-white" disabled={!here || busy} onClick={onSearch}>
                {here ? "Search here" : "Go inside a place to search it"}
              </button>
            </>
          )}
          <ul className="grid grid-cols-4 gap-1.5 text-center text-xs">
            {[["1st", data.ladder[0].prize], ["2nd–3rd", data.ladder[1].prize], ["4th–10th", data.ladder[2].prize], ["After", data.ladder[3].prize]].map(([k, v]) => (
              <li key={k} className="rounded-xl bg-chip px-1 py-2">
                <span className="block font-bold">{k}</span>
                <span className="num text-ife-700">{naira(v)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </BottomSheet>
  );
}

/** The SUG election, inside the OAU Portal app on your phone. */
export function SugCard() {
  const { sug, vote } = useGame();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    sug().then(setData).catch((e) => setErr(e.message));
  }, [sug]);
  if (err) return <p className="mx-3 mt-3 rounded-xl bg-white/90 px-3 py-2 text-xs text-danger">{err}</p>;
  if (!data) return null;
  return (
    <section className="mx-3 mt-3 rounded-2xl bg-white/95 p-3 text-ink">
      <p className="text-sm font-black">✊🏾 SUG election</p>
      <p className="text-xs text-muted">Polls close {data.closes} · {data.total.toLocaleString("en-NG")} votes · last week: {data.last_winner.name} ({data.last_winner.slogan})</p>
      <ul className="mt-2 space-y-2">
        {data.candidates.map((c) => (
          <li key={c.id} className={`rounded-xl px-3 py-2 ${data.voted === c.id ? "bg-[#e3f3ea] ring-1 ring-go" : "bg-chip"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{c.name}</span>
                <span className="block text-[11px] text-muted">“{c.promise}”</span>
              </span>
              {!data.voted && (
                <button className="shrink-0 rounded-full bg-go px-3 py-1.5 text-xs font-bold text-white" onClick={async () => {
                  try {
                    setData(await vote(c.id));
                    sfx("levelup");
                  } catch (e) {
                    setErr(e.message);
                  }
                }}>Vote ✊🏾</button>
              )}
            </div>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white">
              <span className="block h-full rounded-full bg-go" style={{ width: `${c.pct}%` }} />
            </span>
            <span className="num text-[11px] text-muted">{c.pct}% · {c.votes.toLocaleString("en-NG")}</span>
          </li>
        ))}
      </ul>
      {data.voted && <p className="mt-2 text-xs font-semibold text-ife-700">Your vote is in. Aluta continua!</p>}
    </section>
  );
}

/** Gold banner when someone does something big where you are. Each one shows once. */
export function Spectacle({ events }) {
  const [show, setShow] = useState(null);
  const [seen, setSeen] = useState(() => new Set());
  useEffect(() => {
    const next = (events || [])[0];
    if (!next || seen.has(next.id)) return;
    setSeen((s) => new Set([...s, ...events.map((e) => e.id)]));
    setShow(next);
    sfx("levelup");
    navigator.vibrate?.([60, 80, 60]);
    const t = setTimeout(() => setShow(null), 6500);
    return () => clearTimeout(t);
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[22%] z-40 flex flex-col items-center px-4" role="status">
      <div className="pop relative w-full max-w-md overflow-hidden rounded-3xl bg-gradient-to-b from-[#f9d65c] to-[#c9921f] px-5 py-5 text-center shadow-2xl ring-4 ring-[#fff3c4]">
        <p className="text-5xl" aria-hidden>{show.emoji}</p>
        <p className="display mt-2 text-[1.35rem] leading-tight text-[#3b2604]">{show.you ? "You did that! " : ""}{show.text}</p>
      </div>
      <div className="rain" aria-hidden>
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.25}s` }}>{show.emoji}</span>
        ))}
      </div>
    </div>
  );
}

/** What you've spent at this place on this visit, like a till slip. */
export function Receipt({ items, place }) {
  const [open, setOpen] = useState(false);
  const total = items.reduce((a, b) => a + b.cost, 0);
  if (!total) return null;
  return (
    <span className="relative">
      <button className="rounded-full bg-[#fff6dc] px-2.5 py-1 text-xs font-bold text-[#7a5600]" onClick={() => setOpen((o) => !o)}
        aria-label={`Your tab here: ${naira(total)}`}>🧾 {naira(total)}</button>
      {open && (
        <span className="pop absolute left-0 top-8 z-10 block w-56 rounded-lg bg-[#fffdf6] p-3 font-mono text-[11px] text-ink shadow-xl ring-1 ring-line">
          <span className="block text-center font-bold">{place.toUpperCase()}</span>
          <span className="block border-b border-dashed border-line pb-1 text-center text-muted">THANK YOU, COME AGAIN</span>
          {items.map((it, i) => (
            <span key={i} className="flex justify-between gap-2 py-0.5">
              <span className="truncate">{it.label}</span>
              <span>{naira(it.cost)}</span>
            </span>
          ))}
          <span className="mt-1 flex justify-between border-t border-dashed border-line pt-1 font-bold">
            <span>TOTAL</span>
            <span>{naira(total)}</span>
          </span>
        </span>
      )}
    </span>
  );
}
