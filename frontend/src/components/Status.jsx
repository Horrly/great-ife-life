import { NEED_LABELS, naira, needTone } from "../lib/format";

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
