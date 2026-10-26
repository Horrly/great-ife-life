// Where you live: picking a hall bunk or an off-campus place, your room and roommates, and sleeping.
import { useCallback, useEffect, useState } from "react";
import { clockText, naira } from "../lib/format";

const KIND_ORDER = ["single", "self_con", "flat"];

function Quote({ q }) {
  if (!q.pay) return <span className="text-sm font-bold text-ife-700">No extra cost</span>;
  return (
    <span className="text-sm">
      <b className="num text-base">{naira(q.you)}</b>
      {q.cover > 0 && <span className="text-ife-700"> · parents pay {naira(q.cover)}</span>}
    </span>
  );
}

/** Choose where to live. Used on the admission letter and in the Houses app. */
export function HousingChooser({ game, load, onMove, onJoin, busy }) {
  const [opts, setOpts] = useState(null);
  const [tab, setTab] = useState("halls");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const refresh = useCallback(() => {
    load().then(setOpts).catch((e) => setErr(e.message));
  }, [load]);
  useEffect(() => {
    refresh();
  }, [refresh, game.housing.room]);
  const h = game.housing;
  const tabs = [["halls", "Halls"], ["off", "Off campus"], ["join", "Join a friend"]];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-white p-3">
        <p className="text-xs text-muted">You live in</p>
        <p className="text-lg font-bold">{game.room?.label || game.home_name}</p>
        <p className="text-sm text-muted">
          {h.name}
          {h.share > 0 && ` · ${naira(h.share)} a session${h.tenants > 1 ? " (your share)" : ""}`}
          {h.due_session && " · rent due"}
        </p>
      </div>
      <p className="text-sm text-muted">
        Halls take 4 to a room. Off campus, landlords allow 2 tenants at most. Rent is for a whole session (two
        semesters).{opts?.settling && !opts.parents_used && ` As a ${game.profile.name}, your parents put up to ${naira(opts.rent_budget)} towards your first year.`}
      </p>
      <div className="flex gap-1.5" role="tablist">
        {tabs.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`flex-1 rounded-lg px-2 py-2 text-sm font-bold ${tab === id ? "bg-ife-600 text-white" : "bg-concrete"}`}>
            {name}
          </button>
        ))}
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      {!opts && !err && <p className="text-sm text-muted">Checking what's available…</p>}
      {opts && tab === "halls" && (
        <ul className="space-y-2">
          {opts.halls.map((hall) => (
            <li key={hall.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3">
              <div className="min-w-0">
                <p className="font-bold">{hall.name}</p>
                <p className="text-xs text-muted">
                  {hall.rooms_with_space ? `${hall.rooms_with_space} room${hall.rooms_with_space > 1 ? "s" : ""} with players and a free bed` : "Fresh rooms available"}
                </p>
                <Quote q={hall} />
              </div>
              {hall.current ? (
                <span className="shrink-0 rounded-full bg-ife-50 px-3 py-1 text-xs font-bold text-ife-700">You're here</span>
              ) : (
                <button className="btn-primary shrink-0 px-3 py-2 text-sm" disabled={busy || game.money < hall.you}
                  onClick={() => onMove({ kind: "hostel", hall: hall.id })}>
                  Move in
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {opts && tab === "off" && (
        <div className="space-y-4">
          {KIND_ORDER.map((kind) => {
            const info = opts.housing[kind];
            const list = opts.listings.filter((l) => l.kind === kind);
            return (
              <section key={kind}>
                <h3 className="font-bold">{info.emoji} {info.name} <span className="text-sm font-normal text-muted">· {naira(info.rent[0])} to {naira(info.rent[1])} a session</span></h3>
                <p className="text-xs text-muted">{info.blurb}</p>
                <ul className="mt-2 space-y-2">
                  {list.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3">
                      <div className="min-w-0">
                        <p className="font-bold">{l.area}</p>
                        <p className="text-xs text-muted">Rent {naira(l.rent)}</p>
                        <Quote q={l} />
                      </div>
                      <button className="btn-primary shrink-0 px-3 py-2 text-sm" disabled={busy || game.money < l.you}
                        title={game.money < l.you ? "Not enough money" : undefined}
                        onClick={() => onMove({ kind: l.kind, listing: l.id })}>
                        {game.money < l.you ? "Can't afford" : "Rent it"}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <p className="text-xs text-muted">New listings every week. Off campus, every trip to lectures starts outside the gate.</p>
        </div>
      )}
      {tab === "join" && (
        <form className="space-y-2" onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) onJoin(code.trim());
        }}>
          <p className="text-sm">
            Got a friend's room code? Move in with them. In a hall it's free if there's a bed; off campus you pay them half the rent.
          </p>
          <label className="block text-sm font-bold" htmlFor="room-code">Room code</label>
          <input id="room-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8}
            autoCapitalize="characters" autoComplete="off" placeholder="e.g. K7P2QX"
            className="w-full rounded-lg border border-line bg-white px-3 py-2.5 font-mono text-lg tracking-[0.2em]" />
          <button className="btn-primary w-full" disabled={busy || code.trim().length < 6}>Join their room</button>
          {game.room && <p className="text-xs text-muted">Your own room code is <b className="font-mono">{game.room.code}</b>.</p>}
        </form>
      )}
    </div>
  );
}

const WHERE = { in: ["🟢", "In the room"], asleep: ["😴", "Sleeping"], out: ["⚪", "Out"] };

/** Your room: who lives here, who's in, the room code and the notice board. */
export function RoomCard({ room, onNote }) {
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);
  if (!room) return null;
  const free = room.capacity - room.people.length;
  return (
    <section className="mb-3 rounded-xl border border-line bg-white p-3" aria-label="Your room">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-bold">{room.label}</h3>
        <span className="text-xs text-muted">{room.people.length}/{room.capacity}</span>
      </div>
      <ul className="mt-2 space-y-1">
        {room.people.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              <span aria-hidden>{WHERE[p.where][0]}</span> <b>{p.you ? "You" : p.name}</b>
              <span className="text-muted"> · {p.department}</span>
            </span>
            <span className="shrink-0 text-xs text-muted">{WHERE[p.where][1]}</span>
          </li>
        ))}
        {free > 0 && (
          <li className="text-sm text-muted">
            {free} free {room.kind === "hostel" ? `bed${free > 1 ? "s" : ""}` : "space (landlord allows 2)"}
          </li>
        )}
      </ul>
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-concrete px-3 py-2 text-sm">
        <span className="min-w-0 flex-1">Room code <b className="font-mono tracking-widest">{room.code}</b></span>
        <button className="text-xs font-bold text-ife-600 underline" onClick={async () => {
          try {
            await navigator.clipboard.writeText(room.code);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">Give it to a friend so they can move in with you.</p>
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold">Notice board</h4>
          <button className="text-xs font-bold text-ife-600 underline" onClick={() => setPicking((v) => !v)}>
            {picking ? "Cancel" : "Post a note"}
          </button>
        </div>
        {picking && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {room.note_options.map((n, i) => (
              <button key={n} className="rounded-full bg-ife-50 px-2.5 py-1 text-xs font-bold text-ife-700"
                onClick={() => {
                  onNote(i);
                  setPicking(false);
                }}>
                {n}
              </button>
            ))}
          </div>
        )}
        {room.notes.length ? (
          <ul className="mt-2 space-y-1">
            {room.notes.slice(0, 4).map((n, i) => (
              <li key={i} className="rounded-lg bg-bulb-soft px-2.5 py-1.5 text-sm">
                <b>{n.you ? "You" : n.by}:</b> {n.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted">No notes yet.</p>
        )}
      </div>
    </section>
  );
}

/** Asleep (real hours pass) or resting at the Health Centre. */
/** Sleeping: the night plays out in about 15 seconds while your energy bar fills up. Tap anywhere to wake. */
export function SleepingOverlay({ from, seconds, start, minute, onWake }) {
  // this overlay ticks on its own, so the rest of the game isn't re-drawn every frame
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let raf = 0;
    const step = () => {
      const p = Math.min(1, (performance.now() - start) / 1000 / seconds);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [start, seconds]);
  const energy = Math.round(from + (100 - from) * progress);
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-[#05100b]/92 p-6 text-center text-white"
      role="dialog" aria-label="Sleeping" onClick={onWake}>
      <button type="button" className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full bg-white/15 text-xl"
        aria-label="Wake up now" onClick={(e) => { e.stopPropagation(); onWake(); }}>×</button>
      <div className="w-full max-w-sm">
        <p className="text-6xl" aria-hidden>😴</p>
        <p className="num mt-3 text-6xl">{clockText(minute)}</p>
        <h2 className="display mt-2 text-3xl">{progress < 1 ? "Sleeping…" : "Fully rested"}</h2>
        <p className="mt-2 text-white/80">A full night's rest in a few seconds. Tap anywhere to wake up.</p>
        <div className="mx-auto mt-5 max-w-xs text-left">
          <div className="flex justify-between text-sm font-bold">
            <span>⚡ Energy</span>
            <span className="num">{energy}</span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-bulb" style={{ width: `${energy}%` }} />
          </div>
        </div>
        <button type="button" className="btn-bulb mt-6 w-full py-3 text-lg" onClick={(e) => { e.stopPropagation(); onWake(); }}>
          Wake up now
        </button>
      </div>
    </div>
  );
}

/** While you rest at the Health Centre: a small card, not a full-screen block, so the phone and bank still work. */
export function RestingBanner({ game }) {
  return (
    <div role="status" className="pointer-events-auto flex max-w-[270px] items-center gap-3 rounded-2xl bg-[#05100b]/85 p-3 text-white shadow-lg">
      <span className="text-3xl" aria-hidden>🏥</span>
      <div className="min-w-0 text-sm">
        <p className="font-bold">Resting at the Health Centre</p>
        <p className="text-white/80">Discharged at {game.asleep.until_text}. Rest, eat, and use your phone meanwhile.</p>
      </div>
    </div>
  );
}

export function SleepOverlay({ game, minute, onWake, busy }) {
  const a = game.asleep;
  const energy = game.needs.energy;
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-[#05100b]/85 p-6 text-center text-white"
      role="dialog" aria-label={a.until ? "Resting" : "Asleep"}>
      <div className="w-full max-w-sm">
        <p className="text-6xl" aria-hidden>{a.until ? "🏥" : "😴"}</p>
        <p className="num mt-3 text-6xl">{clockText(minute)}</p>
        <h2 className="display mt-2 text-3xl">{a.until ? "Resting at the Health Centre" : "Asleep"}</h2>
        <p className="mt-2 text-white/80">
          {a.until
            ? `The nurse will discharge you at ${a.until_text}.`
            : "Sleep takes real hours. Close the game and come back: your alarm goes off at 6:30 AM once you've rested."}
        </p>
        <div className="mx-auto mt-5 max-w-xs text-left">
          <div className="flex justify-between text-sm font-bold">
            <span>⚡ Energy</span>
            <span className="num">{energy}</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-bulb transition-all duration-700" style={{ width: `${energy}%` }} />
          </div>
        </div>
        {!a.until && (
          <button className="btn-bulb mt-6 w-full py-3 text-lg" onClick={onWake} disabled={busy}>
            Wake up now
          </button>
        )}
      </div>
    </div>
  );
}
