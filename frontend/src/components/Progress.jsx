import { useState } from "react";
import { naira } from "../lib/format";
import { Sheet } from "./Dialogs";

export function Skills({ skills }) {
  return (
    <section className="slab p-4" aria-labelledby="skills-h">
      <h2 id="skills-h" className="font-bold">
        Skills
      </h2>
      <p className="text-xs text-muted">Gigs and practice level you up. Higher levels pay more and unlock bigger jobs.</p>
      <ul className="mt-3 space-y-2.5">
        {skills.map((s) => {
          const pct = s.next === null ? 100 : Math.round(((s.xp - s.floor) / (s.next - s.floor)) * 100);
          return (
            <li key={s.id}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-bold">{s.name}</span>
                <span className="text-xs text-muted">
                  Level <span className="font-bold text-ink">{s.level}</span>
                  {s.next === null && " (max)"}
                </span>
              </div>
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-line/70"
                role="img"
                aria-label={`${s.name}: level ${s.level}, ${pct}% to next level`}
              >
                <div className="h-full rounded-full bg-bulb" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Businesses({ businesses, income }) {
  if (!businesses.length && !income) return null;
  return (
    <section className="slab p-4" aria-labelledby="biz-h">
      <h2 id="biz-h" className="font-bold">
        Your businesses
      </h2>
      <ul className="mt-2 space-y-1 text-sm">
        {businesses.map((b) => (
          <li key={b.id} className="flex items-center gap-2">
            <span className="text-ife-600" aria-hidden>
              ▸
            </span>
            {b.name}
          </li>
        ))}
        {!businesses.length && <li className="text-muted">You sold all your businesses.</li>}
      </ul>
      <p className="mt-2 text-sm text-muted">
        Made so far: <span className="num text-base text-ink">{naira(income)}</span>
      </p>
    </section>
  );
}

export function BadgesButton({ badges }) {
  const [open, setOpen] = useState(false);
  const earned = badges.filter((b) => b.earned).length;
  return (
    <>
      <button className="slab flex w-full items-center justify-between p-4 text-left hover:bg-white" onClick={() => setOpen(true)}>
        <span>
          <span className="block font-bold">Badges</span>
          <span className="block text-xs text-muted">Little goals for the road</span>
        </span>
        <span className="num display text-3xl font-black text-ife-600">
          {earned}
          <span className="text-lg text-muted">/{badges.length}</span>
        </span>
      </button>
      {open && <BadgesSheet badges={badges} onClose={() => setOpen(false)} />}
    </>
  );
}

export function BadgesSheet({ badges, onClose }) {
  return (
    <Sheet title="Badges">
      <ul className="mt-4 grid grid-cols-1 gap-2">
        {badges.map((b) => (
          <li
            key={b.id}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${b.earned ? "border-bulb bg-bulb-soft" : "border-line bg-slab"}`}
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg font-black ${b.earned ? "bg-bulb text-ink" : "bg-concrete text-muted"}`}
              aria-hidden
            >
              {b.earned ? "★" : "?"}
            </span>
            <span>
              <span className={`block font-bold ${b.earned ? "" : "text-muted"}`}>{b.name}</span>
              <span className="block text-xs text-muted">{b.description}</span>
            </span>
            <span className="sr-only">{b.earned ? "Earned" : "Not earned yet"}</span>
          </li>
        ))}
      </ul>
      <button className="btn-ghost mt-5 w-full" onClick={onClose}>
        Close
      </button>
    </Sheet>
  );
}
