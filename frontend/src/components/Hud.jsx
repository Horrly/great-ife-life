// Everything drawn over the 3D campus: clock, needs, money, joystick, and the sheets you open.
import { useEffect, useMemo, useRef, useState } from "react";
import { clockText, duration, effectChips, naira, NEED_LABELS, needTone } from "../lib/format";

const NEED_ORDER = ["hunger", "energy", "hygiene", "fun", "social"];
const BAR = { ok: "bg-ife-500", low: "bg-bulb", critical: "bg-danger" };

const NEED_ICON = { hunger: "🍲", energy: "⚡", hygiene: "🚿", fun: "🎉", social: "💬" };
const RING = { ok: "#3fbf7f", low: "#f2c230", critical: "#ff5a4a" };

const SHORT = { hygiene: "Clean" };

function NeedRing({ need, value }) {
  const tone = needTone(value);
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex min-w-0 flex-col items-center" title={`${NEED_LABELS[need]}: ${value}`}>
      <span className="relative grid h-11 w-11 place-items-center" role="img" aria-label={`${NEED_LABELS[need]} ${value} of 100`}>
        <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
          <circle cx="20" cy="20" r={r} fill="none" stroke="rgb(255 255 255 / 0.16)" strokeWidth="4" />
          <circle cx="20" cy="20" r={r} fill="none" stroke={RING[tone]} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} style={{ transition: "stroke-dashoffset .7s" }} />
        </svg>
        <span aria-hidden className={`text-[1.05rem] ${tone === "critical" ? "animate-pulse" : ""}`}>{NEED_ICON[need]}</span>
      </span>
      <span className={`mt-0.5 max-w-full truncate text-[0.7rem] font-semibold tracking-tight ${tone === "critical" ? "text-[#ff8a7e]" : "text-white/75"}`}>{SHORT[need] ?? NEED_LABELS[need]}</span>
    </div>
  );
}

export function TopBar({ game, minute, onOpenMe, onMap, onToday, buttons = true }) {
  const night = minute < 360 || minute >= 1140;
  const done = game.missions?.filter((m) => m.done).length ?? 0;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-2 sm:p-3">
      <div className="glass pointer-events-auto mx-auto flex max-w-3xl items-stretch gap-3 rounded-2xl px-3 py-2.5">
        <button
          onClick={onOpenMe}
          className="shrink-0 text-left"
          aria-label={`It's ${clockText(minute)}, ${game.weekday}. Open your timetable and stats`}
        >
          <span className="flex items-baseline gap-1.5">
            <span className="num text-[2.15rem] leading-none" aria-hidden>
              {clockText(minute).replace(/ (AM|PM)/, "")}
            </span>
            <span className="text-sm font-bold text-bulb" aria-hidden>
              {minute < 720 ? "am" : "pm"} {night ? "☾" : "☀"}
            </span>
          </span>
          <span className="mt-1 block text-sm font-semibold text-white/80">
            {game.strike_days ? "ASUU strike" : `${game.weekday}, day ${game.day} of ${game.days_in_semester}`}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="ml-auto grid max-w-[21rem] grid-cols-5 gap-1.5">
            {NEED_ORDER.map((k) => <NeedRing key={k} need={k} value={game.needs[k]} />)}
          </div>
        </div>
      </div>
      <div className="mx-auto mt-2 flex max-w-3xl items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="glass pointer-events-auto inline-flex max-w-full items-center gap-3 rounded-full px-3.5 py-1.5">
            <span className="num text-lg leading-none">{naira(game.money)}</span>
            <span className="text-sm font-semibold text-white/80">📖 {game.prep}%</span>
            {game.rep && <span className="truncate text-sm font-semibold text-bulb">⭐ {game.rep.title}</span>}
          </div>
          {game.moodlets?.length > 0 && (
            <div className="pointer-events-auto flex flex-wrap gap-1" aria-label="How you feel">
              {game.moodlets.slice(0, 4).map((m) => (
                <span key={m.id} title={`${m.name} (${m.value > 0 ? "+" : ""}${m.value} mood)`}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold shadow ${m.value > 0 ? "bg-[#e3f5ea] text-ife-700" : "bg-[#fde2dd] text-danger"}`}>
                  {m.emoji} {m.name}
                </span>
              ))}
            </div>
          )}
          {game.upcoming[0] && (
            <p className="glass inline-block max-w-full truncate rounded-full px-3 py-1.5 text-sm font-medium">
              {game.upcoming[0]}
            </p>
          )}
        </div>
        {buttons && (
          <div className="pointer-events-auto flex shrink-0 flex-col items-end gap-2">
            <button className="flex items-center gap-1.5 rounded-full bg-bulb px-4 py-2.5 text-base font-bold text-ink shadow-lg" onClick={onMap}>
              <span aria-hidden>🗺</span> Map
            </button>
            {game.missions?.length > 0 && (
              <button className="glass flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold" onClick={onToday}>
                📋 Today {done}/{game.missions.length}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Joystick({ onMove }) {
  const base = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, on: false });
  const id = useRef(null);
  function update(e) {
    const r = base.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    setKnob({ x: dx, y: dy, on: true });
    onMove(dx, -dy);
  }
  function end() {
    id.current = null;
    setKnob({ x: 0, y: 0, on: false });
    onMove(0, 0);
  }
  return (
    <div
      ref={base}
      className="pointer-events-auto absolute bottom-5 left-5 z-10 h-32 w-32 touch-none rounded-full border-2 border-white/60 bg-ink/25 backdrop-blur-sm sm:bottom-6 sm:left-6"
      onPointerDown={(e) => {
        id.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => id.current === e.pointerId && update(e)}
      onPointerUp={end}
      onPointerCancel={end}
      role="application"
      aria-label="Joystick: drag to walk. On a keyboard use W A S D or the arrow keys."
    >
      <span
        className={`absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/80 shadow ${knob.on ? "" : "transition-transform"}`}
        style={{ transform: `translate(calc(-50% + ${knob.x * 36}px), calc(-50% + ${knob.y * 36}px))` }}
      />
    </div>
  );
}

export function RoundButton({ label, icon, onClick, className = "", badge }) {
  return (
    <button
      onClick={onClick}
      className={`glass pointer-events-auto relative flex h-16 w-16 flex-col items-center justify-center rounded-2xl ${className}`}
    >
      <span aria-hidden className="text-2xl leading-none">{icon}</span>
      <span className="mt-1 text-xs font-semibold">{label}</span>
      {badge ? <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-danger" aria-label="New" /> : null}
    </button>
  );
}

/** A panel that slides up from the bottom but leaves the campus visible above it. */
export function Panel({ title, subtitle, onClose, children, tall = false, label }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector("button, a")?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      ref={ref}
      role="dialog"
      aria-label={label || title}
      className={`reveal pointer-events-auto absolute inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-xl flex-col rounded-t-2xl bg-slab shadow-2xl sm:bottom-3 sm:rounded-2xl ${tall ? "max-h-[88%]" : "max-h-[58%]"}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 pb-2 pt-3">
        <div className="min-w-0">
          <h2 className="display truncate text-[1.7rem] text-ife-900">{title}</h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {onClose && (
          <button className="btn-ghost shrink-0 px-3 py-1.5 text-sm" onClick={onClose}>
            Close
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">{children}</div>
    </section>
  );
}

const CHIP = { good: "bg-ife-50 text-ife-700", bad: "bg-concrete text-muted", cost: "bg-bulb-soft text-ink" };

export function ActionList({ actions, onAct, busy }) {
  const sorted = [...actions].sort((a, b) => (b.test ? 2 : 0) + b.enabled - ((a.test ? 2 : 0) + a.enabled));
  if (!sorted.length) return <p className="text-sm text-muted">Nothing to do here right now.</p>;
  return (
    <ul className="space-y-2">
      {sorted.map((a) => {
        const chips = effectChips(a);
        return (
          <li key={a.id}>
            <button
              onClick={() => onAct(a)}
              disabled={busy || !a.enabled}
              className={`w-full rounded-lg border px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed ${
                a.test && a.enabled ? "border-ife-600 bg-ife-600 text-white" : "border-line bg-white hover:border-ife-500 disabled:bg-slab"
              }`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className={`text-base font-bold ${a.enabled ? "" : "text-muted"}`}>{a.label}</span>
                <span className={`shrink-0 text-sm font-semibold ${a.test && a.enabled ? "text-bulb" : "text-muted"}`}>
                  {duration(a.minutes)}
                </span>
              </span>
              <span className={`mt-0.5 block text-sm ${a.test && a.enabled ? "text-ife-100" : "text-muted"}`}>
                {a.enabled ? `${a.blurb} Done by ${a.ends}.` : a.reason}
              </span>
              {a.enabled && (chips.length > 0 || a.xp > 0 || a.hustle) && (
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {a.hustle && <span className="rounded bg-bulb px-1.5 py-0.5 text-xs font-bold text-ink">Hustle</span>}
                  {chips.map((c) => (
                    <span key={c.text} className={`rounded px-1.5 py-0.5 text-xs font-bold ${CHIP[c.tone]}`}>
                      {c.text}
                    </span>
                  ))}
                  {a.xp > 0 && (
                    <span className="rounded bg-bulb-soft px-1.5 py-0.5 text-xs font-bold text-ink">
                      +{a.xp} {a.skill} XP
                    </span>
                  )}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// --- Getting around -------------------------------------------------------------------------------

const MODE_ICON = { trek: "🚶", bus: "🚌", keke: "🛺", cab: "🚕", bike: "🚲", car: "🚗" };
const KIND_COLOR = { lecture: "#f2c230", faculty: "#f4d27a", hall: "#c4dfcf", home: "#ffffff", food: "#f7c6a3", campus: "#e8e2d4" };

/** A tappable map of campus. */
export function CampusMap({ world, game, selected, onSelect, playerPos }) {
  const { x0, x1, z0, z1 } = world.bounds;
  const short = (name) => name.replace(/ \(.*\)/, "").replace("Your self-con", "Self-con").replace(" Building", "")
    .replace("Faculty of ", "").replace("Social Sciences & Admin", "Soc Sci");
  return (
    <svg viewBox={`${x0} ${z0} ${x1 - x0} ${z1 - z0}`} className="w-full rounded-lg bg-[#7ea551]" role="group" aria-label="Campus map">
      {world.edges.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={world.nodes[a][0]} y1={world.nodes[a][1]} x2={world.nodes[b][0]} y2={world.nodes[b][1]}
          stroke="#4a4d50" strokeWidth="7" strokeLinecap="round" />
      ))}
      <polyline points={world.bus_route.map((n) => world.nodes[n].join(",")).join(" ")} fill="none" stroke="#f2c230"
        strokeWidth="1.6" strokeDasharray="5 4" />
      {world.bus_stops.map((s) => (
        <g key={s} style={{ pointerEvents: "none" }}>
          <circle cx={world.nodes[s][0]} cy={world.nodes[s][1]} r="4" fill="#1f6f4a" stroke="#fff" strokeWidth="1.5" />
          <text x={world.nodes[s][0] + 6} y={world.nodes[s][1] - 5} fontSize="7.5" fontWeight="700" fill="#fff">
            🚌 {world.stop_names[s]}
          </text>
        </g>
      ))}
      {Object.entries(world.buildings).map(([id, b]) => {
        const here = game.at === id;
        const sel = selected === id;
        const open = game.open[id];
        const next = game.next_venue === id;
        const exam = game.exam_venue === id && game.upcoming.some((u) => /CA test|Exams/.test(u));
        return (
          <g key={id} onClick={() => onSelect(id)} className="cursor-pointer" role="button" tabIndex={0}
            aria-label={`${b.name}${open ? "" : " (closed now)"}${next ? ", your next lecture" : ""}`}
            onKeyDown={(e) => e.key === "Enter" && onSelect(id)}>
            <rect x={b.x - b.w / 2} y={b.z - b.d / 2} width={b.w} height={b.d} rx="3"
              fill={sel ? "#f2c230" : here ? "#ffffff" : KIND_COLOR[b.kind] || "#f4efe4"} opacity={open ? 1 : 0.6}
              stroke={sel || next ? "#16201a" : "#5a5040"} strokeWidth={sel || next ? 2.4 : 1} />
            <text x={b.x} y={b.z + 3} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#16201a" style={{ pointerEvents: "none" }}>
              {short(b.name)}
            </text>
            {(next || exam) && (
              <text x={b.x} y={b.z - b.d / 2 - 3} textAnchor="middle" fontSize="8" fontWeight="800" fill="#fff" style={{ pointerEvents: "none" }}>
                {next ? "NEXT CLASS" : "EXAM HALL"}
              </text>
            )}
          </g>
        );
      })}
      {playerPos && (
        <g>
          <circle cx={playerPos[0]} cy={playerPos[1]} r="7" fill="#b03a2e" stroke="#fff" strokeWidth="2.5" />
          <text x={playerPos[0]} y={playerPos[1] - 11} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">YOU</text>
        </g>
      )}
    </svg>
  );
}

export function TravelPanel({ world, game, plan, onPlan, onGo, onClose, busy, playerPos, initial }) {
  const [selected, setSelected] = useState(initial || null);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!selected) return;
    let live = true;
    setQuote(null);
    setError("");
    onPlan(selected)
      .then((q) => live && setQuote(q))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [selected, onPlan]);
  const groups = useMemo(() => {
    const out = {};
    for (const [id, b] of Object.entries(world.buildings)) {
      if (id === game.at || (b.kind === "home" && id !== game.home)) continue;
      (out[b.kind] ||= []).push([id, b]);
    }
    return Object.entries(world.kinds).filter(([k]) => out[k]).map(([k, label]) => [label, out[k]]);
  }, [world, game.at, game.home]);
  return (
    <Panel title={selected ? `To ${world.buildings[selected].name}` : "Where to?"} subtitle={`Now ${clockText(game.minute)}`}
      onClose={onClose} tall label="Travel">
      <CampusMap world={world} game={game} selected={selected} onSelect={setSelected} playerPos={playerPos} />
      {!selected && (
        <div className="mt-3 space-y-3">
          {groups.map(([label, list]) => (
            <section key={label}>
              <h3 className="text-sm font-bold text-ink">{label}</h3>
              <ul className="mt-1 grid grid-cols-2 gap-1.5">
                {list.map(([id, b]) => (
                  <li key={id}>
                    <button className="btn-ghost w-full justify-start px-3 py-2 text-left text-sm" onClick={() => setSelected(id)}>
                      {id === game.home ? "🏠 " : ""}
                      {b.name}
                      {game.next_venue === id && <span className="ml-auto rounded bg-bulb px-1 text-xs">next class</span>}
                      {!game.open[id] && game.next_venue !== id && <span className="ml-auto text-xs font-normal text-muted">closed</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {selected && (
        <div className="mt-3">
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          {!quote && !error && <p className="text-sm text-muted" role="status">Checking the roads…</p>}
          {quote && (
            <>
              {!quote.open_on_arrival && quote.hours && (
                <p className="mb-2 rounded-lg bg-bulb-soft px-3 py-2 text-sm font-bold">
                  It'll be closed when you get there (open {quote.hours[0]} to {quote.hours[1]}).
                </p>
              )}
              <ul className="space-y-2">
                {quote.options.map((o) => (
                  <li key={o.mode}>
                    <button
                      className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-left hover:border-ife-500 disabled:cursor-not-allowed disabled:bg-slab"
                      disabled={!o.available || busy}
                      onClick={() => onGo(selected, o)}
                    >
                      <span className="flex items-center gap-3">
                        <span aria-hidden className="text-2xl">{MODE_ICON[o.mode]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={`font-bold ${o.available ? "" : "text-muted"}`}>{o.name}</span>
                            {o.available && <span className="num text-lg">{o.cost ? naira(o.cost) : "Free"}</span>}
                          </span>
                          <span className="block text-sm text-muted">
                            {o.available
                              ? `${duration(o.minutes)}, there by ${o.arrive}${o.wait ? ` · ${o.wait} min waiting` : ""}${o.walk && o.mode !== "trek" ? ` · ${o.walk} min walk` : ""}`
                              : o.reason}
                          </span>
                          {o.rush && o.available && <span className="block text-xs font-bold text-danger">Rush hour: long queue at the park</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button className="mt-3 text-sm font-bold text-ife-600 underline" onClick={() => setSelected(null)}>
                Somewhere else
              </button>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

const SEGMENT_TEXT = {
  walk: "Trekking",
  wait: "Waiting",
  ride: { bus: "On the CNG bus", keke: "In a keke", cab: "In a night cab", town_bus: "On the town bus", bike: "Cycling",
    car: "Driving" },
};

export function JourneyBar({ journey, progress, segment, onSkip }) {
  const minute = journey.depart + (journey.arrive - journey.depart) * progress;
  const text = segment ? (segment.kind === "ride" ? SEGMENT_TEXT.ride[segment.mode] : segment.label || SEGMENT_TEXT[segment.kind]) : "";
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto max-w-xl p-3" aria-live="polite">
      <div className="rounded-2xl bg-ife-900/92 p-4 text-white shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-bulb">▶▶ {journey.name} to {journey.toName}</p>
            <p className="truncate font-bold">{text}</p>
          </div>
          <p className="num shrink-0 text-3xl">{clockText(minute)}</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-bulb" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-ife-100">
          <span>
            {clockText(journey.depart)} → {clockText(journey.arrive)}
          </span>
          <button className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-bold text-white hover:bg-white/25" onClick={onSkip}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shown while an activity's time passes: the clock spins forward. */
export function TimeLapse({ lapse, progress }) {
  const minute = lapse.from + (lapse.to - lapse.from) * progress;
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-ife-900/70 p-6 text-center text-white backdrop-blur-sm"
      role="status" aria-live="polite">
      <div>
        <p className="text-sm font-bold text-bulb">{lapse.label}</p>
        <p className="num mt-2 text-7xl">{clockText(minute)}</p>
        <div className="mx-auto mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-white/20">
          <div className="h-full bg-bulb" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="mt-3 text-sm text-ife-100">{duration(lapse.to - lapse.from)} later…</p>
      </div>
    </div>
  );
}

export function Toasts({ messages, error, onDismiss }) {
  if (!messages.length && !error) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[13rem] z-20 mx-auto flex max-w-md flex-col gap-1.5 px-3" aria-live="polite">
      {error && (
        <p className="pointer-events-auto rounded-lg bg-danger px-3 py-2 text-sm font-bold text-white shadow-lg" role="alert">
          {error}{" "}
          <button className="underline" onClick={onDismiss}>
            OK
          </button>
        </p>
      )}
      {messages.slice(0, 3).map((m, i) => (
        <p key={`${m}-${i}`} className={`bump rounded-lg px-3 py-2 text-sm shadow-lg ${i === 0 ? "bg-ife-600 font-bold text-white" : "bg-slab/95"}`}>
          {m}
        </p>
      ))}
    </div>
  );
}

export function Timetable({ game }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted">
          <th className="py-1 font-bold">Day</th>
          <th className="py-1 font-bold">Lectures and where</th>
        </tr>
      </thead>
      <tbody>
        {game.timetable.map((row, i) => (
          <tr key={i} className={`border-t border-line ${game.dow === i ? "bg-bulb-soft" : ""}`}>
            <td className="py-1.5 font-bold">{days[i]}</td>
            <td className="py-1.5">
              {row.map((l) => (
                <span key={l.start} className="block">
                  {l.time} <b>{l.code}</b> · {l.venue_name}
                </span>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


/** "Today on campus": three missions, the all-three bonus, and your daily streak. */
export function TodayPanel({ game, onClose }) {
  const done = game.missions.filter((m) => m.done).length;
  return (
    <Panel title="Today on campus" subtitle={`${done} of ${game.missions.length} done · new missions every morning`} onClose={onClose} label="Today's missions">
      <ul className="space-y-2">
        {game.missions.map((m) => (
          <li key={m.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${m.done ? "border-ife-500 bg-ife-50" : "border-line bg-white"}`}>
            <span aria-hidden className={`grid h-7 w-7 place-items-center rounded-full text-sm font-black ${m.done ? "bg-ife-600 text-white" : "bg-concrete text-muted"}`}>
              {m.done ? "✓" : ""}
            </span>
            <span className="flex-1">
              <span className="block font-bold">{m.label}</span>
              <span className="block text-xs text-muted">{m.tier === "easy" ? "Easy" : m.tier === "campus" ? "Around campus" : "Hustle"}</span>
            </span>
            <span className="num text-lg">+{naira(m.reward)}</span>
          </li>
        ))}
      </ul>
      <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-bold ${game.missions_bonus ? "bg-ife-600 text-white" : "bg-bulb-soft"}`}>
        {game.missions_bonus ? "All three done: bonus collected!" : "Finish all three for a ₦1,500 bonus and +80 Rep"}
      </p>
      <div className="mt-4">
        <h3 className="font-bold">Daily streak</h3>
        <p className="text-xs text-muted">Come back every day. Day 7 opens the Sunday chest.</p>
        <ol className="mt-2 grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, i) => (
            <li key={i} className={`rounded-md py-2 text-center text-xs font-bold ${i < game.streak ? "bg-bulb text-ink" : "bg-concrete text-muted"}`}>
              {i === 6 ? "🎁" : i + 1}
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}
