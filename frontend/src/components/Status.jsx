import { NEED_LABELS, naira, needTone } from "../lib/format";

const SKY = ["bg-sky-morning", "bg-sky-afternoon", "bg-sky-evening", "bg-sky-night"];
const SLOT_NAMES = ["Morning", "Afternoon", "Evening", "Night"];

/** The day as four slots of sky: you can see how much of today is left. */
export function TimeBand({ slotIndex, strike }) {
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Time of day">
      {SLOT_NAMES.map((name, i) => {
        const past = i < slotIndex;
        const now = i === slotIndex;
        return (
          <li
            key={name}
            aria-current={now ? "true" : undefined}
            className={`rounded-md px-2 py-1.5 text-center text-xs font-bold transition-all ${SKY[i]} ${
              i === 3 ? "text-white" : "text-ink"
            } ${past ? "opacity-25" : ""} ${now ? "ring-2 ring-ink ring-offset-2 ring-offset-concrete" : ""}`}
          >
            {name}
            {now && strike ? <span className="sr-only"> (strike)</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

const TONE = {
  ok: { bar: "bg-ife-500", text: "text-ink" },
  low: { bar: "bg-bulb", text: "text-ink" },
  critical: { bar: "bg-danger", text: "text-danger" },
};

export function Meter({ label, value, max = 100, tone }) {
  const t = TONE[tone || needTone(value)];
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className={`font-bold ${t.text}`}>
          {label}
          {tone !== "ok" && needTone(value) === "critical" && <span className="sr-only"> (very low)</span>}
        </span>
        <span className={`num text-xs ${t.text}`}>{value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-line/70" role="img" aria-label={`${label}: ${value} of ${max}`}>
        <div className={`h-full rounded-full ${t.bar} transition-[width] duration-500`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  );
}

export function Needs({ needs, mood }) {
  return (
    <section className="slab p-4" aria-labelledby="needs-h">
      <div className="flex items-baseline justify-between">
        <h2 id="needs-h" className="font-bold">
          How you're doing
        </h2>
        <p className="text-sm text-muted">
          Mood <span className="num font-bold text-ink">{mood}</span>
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        {Object.entries(needs).map(([key, value]) => (
          <Meter key={key} label={NEED_LABELS[key]} value={value} />
        ))}
      </div>
      {mood < 40 && <p className="mt-3 text-xs text-danger">Low mood makes studying and exams harder.</p>}
    </section>
  );
}

export function Academics({ game }) {
  return (
    <section className="slab p-4" aria-labelledby="acad-h">
      <h2 id="acad-h" className="font-bold">
        Academics
      </h2>
      <div className="mt-3">
        <Meter label="Readiness for exams" value={game.prep} tone={game.prep >= 60 ? "ok" : game.prep >= 35 ? "low" : "critical"} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-concrete/70 px-2 py-2">
          <dt className="text-xs text-muted">Attendance</dt>
          <dd className="num font-bold">{game.attendance === null ? "–" : `${game.attendance}%`}</dd>
        </div>
        <div className="rounded-lg bg-concrete/70 px-2 py-2">
          <dt className="text-xs text-muted">CGPA</dt>
          <dd className="num font-bold">{game.cgpa === null ? "–" : game.cgpa.toFixed(2)}</dd>
        </div>
        <div className="rounded-lg bg-concrete/70 px-2 py-2">
          <dt className="text-xs text-muted">Courses</dt>
          <dd className="num font-bold">
            {game.courses.length}
            {game.carryovers.length > 0 && <span className="text-danger"> ({game.carryovers.length} CO)</span>}
          </dd>
        </div>
      </dl>
      {game.upcoming.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {game.upcoming.map((note) => (
            <li key={note} className="rounded-md bg-bulb-soft px-2.5 py-1.5 text-sm font-bold">
              {note}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Money({ value }) {
  return (
    <p className={`num display text-3xl font-black ${value < 1000 ? "text-danger" : "text-ink"}`} aria-label={`Money: ${naira(value)}`}>
      {naira(value)}
    </p>
  );
}
