import { useState } from "react";
import { naira } from "../lib/format";
import { Sheet } from "./Dialogs";

export function Skills({ skills }) {
  return (
    <section className="slab p-4" aria-labelledby="skills-h">
      <h2 id="skills-h" className="font-bold">
        Skills
      </h2>
      <p className="text-xs text-muted">Ten bars each. Fill a bar to reach the next level. Higher levels pay more and unlock bigger jobs.</p>
      <ul className="mt-3 space-y-3">
        {skills.map((s) => {
          const max = s.max || 10;
          const pct = s.next === null ? 1 : (s.xp - s.floor) / (s.next - s.floor);
          return (
            <li key={s.id}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-bold">{s.name}</span>
                <span className="text-xs text-muted">
                  Level <span className="font-bold text-ink">{s.level}</span>/{max}
                </span>
              </div>
              <div className="mt-1 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${max}, minmax(0, 1fr))` }}
                role="img" aria-label={`${s.name}: level ${s.level} of ${max}, ${Math.round(pct * 100)}% of the way to the next`}>
                {Array.from({ length: max }, (_, i) => {
                  const fill = i < s.level - 1 ? 1 : i === s.level - 1 ? pct : 0;
                  return (
                    <span key={i} className="h-2 overflow-hidden rounded-sm bg-line/70">
                      <span className={`block h-full ${i < s.level - 1 ? "bg-ife-500" : "bg-bulb"}`} style={{ width: `${fill * 100}%` }} />
                    </span>
                  );
                })}
              </div>
              {s.blurb && <p className="mt-0.5 text-xs text-muted">{s.blurb}</p>}
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
