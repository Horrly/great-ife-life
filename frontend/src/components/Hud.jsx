// Everything drawn over the 3D campus, arranged like a phone game should be: status at the top in dark
// pills you read, and everything you press in the bottom thumb zone. The middle of the screen stays campus.
import { useEffect, useMemo, useRef, useState } from "react";
import { clockText, duration, naira, nairaShort } from "../lib/format";
import Portrait from "./Portrait";
import { setSound, sfx, soundOn } from "../lib/sfx";
import { BottomSheet, Ring } from "./ui";

export const NEEDS = {
  hunger: { label: "Food", icon: "🍲", color: "var(--color-need-hunger)", tint: "#fde9d3" },
  energy: { label: "Energy", icon: "⚡", color: "var(--color-need-energy)", tint: "#dfeafe" },
  hygiene: { label: "Hygiene", icon: "🚿", color: "var(--color-need-hygiene)", tint: "#d5f1ee" },
  fun: { label: "Fun", icon: "🎉", color: "var(--color-need-fun)", tint: "#fbf0c8" },
  social: { label: "Social", icon: "💬", color: "var(--color-need-social)", tint: "#fbdde8" },
};
const TAG = { ...NEEDS, prep: { label: "Readiness", color: "#1c9a5e", tint: "#dcf3e6" } };

export function moodOf(mood) {
  if (mood >= 80) return { label: "Very happy", face: "😄", color: "#22c55e" };
  if (mood >= 62) return { label: "Happy", face: "🙂", color: "#4ade80" };
  if (mood >= 45) return { label: "Fine", face: "😐", color: "#facc15" };
  if (mood >= 30) return { label: "Uneasy", face: "😕", color: "#fb923c" };
  return { label: "Miserable", face: "😫", color: "#ef4444" };
}

function needTone(v) {
  return v < 20 ? "#d64535" : v < 40 ? "#c98a00" : "#1c9a5e";
}

// --- Top band: what you read ---------------------------------------------------------------------

export function ClockPill({ game, minute, onClick }) {
  const night = minute < 360 || minute >= 1140;
  const m = moodOf(game.mood);
  const [time, ampm] = clockText(minute).split(" ");
  return (
    <button onClick={onClick} className="glass pointer-events-auto flex h-[38px] items-center gap-1.5 rounded-full pl-3 pr-2"
      aria-label={`Game time ${clockText(minute)}, ${game.weather?.label || ""}, ${m.label}. More`}>
      <span aria-hidden className="text-sm" title={game.weather?.label}>{game.weather?.icon && (game.weather.rain || !night) ? game.weather.icon : night ? "🌙" : "☀️"}</span>
      <span className="num text-[1.05rem] leading-none">{time}</span>
      <span className="text-[0.7rem] font-bold text-white/70">{ampm}</span>
      <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full text-sm" style={{ background: m.color }}>{m.face}</span>
    </button>
  );
}

export function WalletPill({ game, onClick }) {
  return (
    <button onClick={onClick} className="glass pointer-events-auto flex h-[38px] items-center gap-2 rounded-full pl-3.5 pr-1.5"
      aria-label={`Cash ${naira(game.cash ?? game.money)}${game.bank ? `, ${game.bank.name} ${naira(game.bank.balance)}` : ""}. Open your bank`}>
      <span className="num text-[1.05rem] leading-none">{nairaShort(game.cash ?? game.money)}</span>
      {game.bank && <span className="num text-xs text-white/70">🏦 {nairaShort(game.bank.balance)}</span>}
      <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-go text-base font-black leading-none text-white">+</span>
    </button>
  );
}

export function Chevron({ open, onClick }) {
  return (
    <button onClick={onClick} aria-expanded={open} aria-label={open ? "Close" : "More: date, wallet, sound"}
      className={`pointer-events-auto flex h-8 items-center rounded-full px-3 text-sm font-bold ${open ? "bg-white text-ink shadow" : "glass"}`}>
      {open ? "Close" : <span aria-hidden className="text-xs">⌄</span>}
    </button>
  );
}

/** The drawer under the chevron: everything you sometimes want to know, out of the way the rest of the time. */
export function StatusDrawer({ game, minute, onNeeds, onBank, onStudies }) {
  const [sound, setS] = useState(soundOn());
  const m = moodOf(game.mood);
  const [time, ampm] = clockText(minute).split(" ");
  const Row = ({ icon, title, sub, onClick, right }) => (
    <button onClick={onClick} disabled={!onClick} className="flex w-full items-center gap-3 border-t border-white/10 py-2.5 text-left">
      <span aria-hidden className="w-6 text-center text-lg">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        {sub && <span className="block truncate text-xs text-white/60">{sub}</span>}
      </span>
      {right ?? (onClick && <span aria-hidden className="text-white/50">›</span>)}
    </button>
  );
  return (
    <div className="drop-down glass pointer-events-auto absolute inset-x-4 top-14 z-[26] mx-auto max-w-md rounded-3xl px-4 pb-2 pt-4">
      <p className="num text-5xl leading-none">{time}<span className="ml-1 text-lg text-white/70">{ampm}</span></p>
      <p className="mt-1 text-sm text-white/75">
        {game.weekday} · {game.strike_days ? "ASUU strike" : game.day === 0 ? "no lectures today" : `Day ${game.day} of ${game.days_in_semester}`} · {game.level}
      </p>
      <div className="mt-3">
        <Row icon={m.face} title={m.label} sub="See what you need" onClick={onNeeds} />
        <Row icon="💵" title={`${naira(game.cash ?? game.money)} cash`}
          sub={game.bank ? `${game.bank.name}: ${naira(game.bank.balance)}` : "No bank account yet"} onClick={onBank} />
        <Row icon="📖" title={`Readiness ${game.prep}%${game.cgpa != null ? ` · CGPA ${game.cgpa.toFixed(2)}` : ""}`}
          sub={game.upcoming[0]} onClick={onStudies} />
        <Row icon="🟢" title={`${game.online ?? 1} student${game.online === 1 ? "" : "s"} on campus now`} sub={`Streak: day ${game.streak} of 7`} />
        <Row icon="🔊" title="Sounds" sub="Taps, credit alerts and warnings"
          right={
            <span role="switch" aria-checked={sound} tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setSound(!sound);
                setS(!sound);
              }}
              className={`relative h-6 w-11 rounded-full ${sound ? "bg-go" : "bg-white/25"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${sound ? "left-[1.4rem]" : "left-0.5"}`} />
            </span>
          } />
      </div>
    </div>
  );
}

export function InboxButton({ count, onClick }) {
  return (
    <button onClick={onClick} className="float pointer-events-auto relative grid h-10 w-12 shrink-0 place-items-center rounded-full text-lg"
      aria-label={`Inbox${count ? `, ${count} new` : ""}`}>
      <span aria-hidden>✉️</span>
      {count > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-black text-white">{count > 9 ? "9+" : count}</span>}
    </button>
  );
}

/** A running action: icon in a progress ring, top-left. You can keep looking around while it plays. */
export function ActionChip({ lapse, progress, onSkip }) {
  return (
    <button type="button" onClick={onSkip} title="Tap to skip: the result is the same"
      className="float pointer-events-auto flex h-11 max-w-[60vw] items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-left" role="status" aria-live="polite">
      <Ring value={progress} size={36} stroke={3.5}>
        <span className="text-base">{lapse.icon || "⏳"}</span>
      </Ring>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{lapse.label}</span>
        <span className="block text-[11px] text-muted">{progress < 1 ? "× tap to skip" : "Done"}</span>
      </span>
    </button>
  );
}

export function RoundIcon({ icon, label, onClick, badge, dark = false, active = false }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className={`pointer-events-auto relative grid h-11 w-11 place-items-center rounded-full text-lg shadow ${dark ? "glass" : active ? "bg-ink text-white" : "float"}`}>
      <span aria-hidden>{icon}</span>
      {badge ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-black text-white">{badge}</span> : null}
    </button>
  );
}

export function NextClassPill({ game, onClick }) {
  const next = game.today?.find((l) => !l.attended && !l.missed);
  const text = game.test ? `✍️ ${game.test.label}` : next ? `📚 ${next.code} · ${next.time} · ${next.venue_name}` : null;
  if (!text) return null;
  return (
    <button onClick={onClick} className="float pointer-events-auto h-11 min-w-0 max-w-[26rem] shrink truncate rounded-full px-3.5 text-sm font-semibold">
      {text}
    </button>
  );
}

// --- Bottom band: what you press ------------------------------------------------------------------

export function AvatarButton({ game, onClick }) {
  const female = game.look?.hall === 1;
  return (
    <button onClick={onClick} aria-label="You: profile, needs, studies and skills"
      className="float pointer-events-auto grid h-[50px] w-[50px] shrink-0 place-items-center overflow-hidden rounded-full ring-[3px] ring-go">
      <Portrait look={game.look} size={50} fallback={<span className="text-2xl">{female ? "👩🏾‍🎓" : "🧑🏾‍🎓"}</span>} />
    </button>
  );
}

/** One pill with your lowest need. The rest are one tap away. */
export function NeedsPill({ needs, onClick, flash }) {
  const [key, value] = Object.entries(needs).sort((a, b) => a[1] - b[1])[0];
  const n = NEEDS[key];
  return (
    <button onClick={onClick} aria-label={`${n.label} ${value}%. Open needs`}
      className={`float pointer-events-auto flex h-11 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 ${flash ? "bump" : ""}`}>
      <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full text-base" style={{ background: n.tint }}>{n.icon}</span>
      <span className="num text-[0.95rem]" style={{ color: needTone(value) }}>{value}%</span>
    </button>
  );
}

/** All five needs as mini bars: on wide screens this sits in the left column. */
export function NeedsCard({ needs, onClick }) {
  return (
    <button onClick={onClick} className="float pointer-events-auto grid w-[230px] grid-cols-5 gap-2 rounded-2xl p-2.5" aria-label="Your needs">
      {Object.entries(NEEDS).map(([k, n]) => (
        <span key={k} className="flex flex-col items-center gap-1" title={`${n.label} ${needs[k]}%`}>
          <span aria-hidden className="text-base">{n.icon}</span>
          <span className="h-1.5 w-full overflow-hidden rounded-full bg-chip">
            <span className="block h-full rounded-full" style={{ width: `${needs[k]}%`, background: n.color }} />
          </span>
        </span>
      ))}
    </button>
  );
}

export function NavBar({ items }) {
  return (
    <nav className="float pointer-events-auto flex items-center gap-1 rounded-[26px] p-1.5" aria-label="Go to">
      {items.map((it) => (
        <button key={it.id} onClick={() => {
          sfx("tap");
          it.onClick();
        }} disabled={it.disabled} aria-current={it.active ? "page" : undefined}
          className={`flex h-12 min-w-[4.6rem] flex-col items-center justify-center rounded-[20px] px-2 disabled:opacity-35 ${it.active ? "bg-ink text-white" : "text-muted"}`}>
          <span aria-hidden className="text-lg leading-none">{it.icon}</span>
          <span className="mt-0.5 text-[11px] font-semibold">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function PhoneButton({ game, onClick }) {
  const n = game.chat_unread || 0;
  return (
    <button onClick={() => {
      sfx("open");
      onClick();
    }} aria-label={`Phone${n ? `, ${n} unread messages` : ""}`}
      className="float pointer-events-auto relative grid h-[54px] w-[54px] place-items-center rounded-full text-2xl">
      <span aria-hidden>{game.phone_info ? "📱" : "📵"}</span>
      {n > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-black text-white">{n > 9 ? "9+" : n}</span>}
    </button>
  );
}

/** The ⋯ button and its little menu of rarely used things. */
export function MoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-auto relative">
      {open && (
        <div className="drop-down float absolute bottom-14 right-0 w-56 rounded-2xl p-1.5">
          {items.map((it) => (
            <button key={it.label} onClick={() => {
              setOpen(false);
              it.onClick();
            }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-chip">
              <span aria-hidden>{it.icon}</span>
              {it.label}
            </button>
          ))}
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "More"} aria-expanded={open}
        className={`grid h-11 w-11 place-items-center rounded-full text-lg font-black shadow ${open ? "bg-ink text-white" : "float"}`}>
        {open ? "×" : "⋯"}
      </button>
    </div>
  );
}

export function Joystick({ onMove }) {
  const base = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, on: false });
  const id = useRef(null);
  function update(e) {
    const r = base.current.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
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
    <div ref={base}
      className="pointer-events-auto relative h-[7.5rem] w-[7.5rem] touch-none rounded-full border-2 border-white/70 bg-ink/20 backdrop-blur-sm"
      onPointerDown={(e) => {
        id.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => id.current === e.pointerId && update(e)}
      onPointerUp={end}
      onPointerCancel={end}
      role="application"
      aria-label="Joystick: drag to walk. On a keyboard use W A S D or the arrow keys.">
      <span className={`absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white shadow ${knob.on ? "" : "transition-transform"}`}
        style={{ transform: `translate(calc(-50% + ${knob.x * 34}px), calc(-50% + ${knob.y * 34}px))` }} />
    </div>
  );
}

// --- Places: the place card, stations and action cards -------------------------------------------

export const STATIONS = {
  room: ["👥", "Roommates"], class: ["🎓", "Class"], study: ["📚", "Study"], food: ["🍲", "Food"], care: ["🚿", "Wash"],
  rest: ["🛏", "Rest"], fun: ["🎉", "Gist & fun"], hustle: ["💼", "Hustle"], shop: ["🛍", "Shop"], money: ["🏦", "Money"],
};

const ICONS = [
  [/lecture|class/, "🎓"], [/write|exam|ca test|test/, "✍️"], [/tdb|night/, "🌙"], [/tutorial|teach/, "🧑🏾‍🏫"],
  [/group/, "👥"], [/read|study|hol/, "📖"], [/cook|noodle/, "🍳"], [/amala|ewedu/, "🍲"], [/rice|jollof/, "🍛"],
  [/garri/, "🥣"], [/puff|snack|meat pie/, "🥟"], [/foodstuff/, "🛒"], [/bath|water/, "🚿"], [/sleep|lights/, "🛏"],
  [/nap/, "😴"], [/check|nurse|health/, "🩺"], [/gist/, "💬"], [/hang|owambe|party/, "🎉"], [/show|concert|amphi/, "🎤"],
  [/football|ball/, "⚽"], [/jog|gym|run/, "🏃"], [/scroll|twitter|tiktok/, "📱"], [/snake/, "🐍"], [/chin/, "🍪"],
  [/barb|clipper/, "💈"], [/braid|hair/, "💇🏾‍♀️"], [/shoe|cobbler|slipper/, "👞"], [/data/, "📶"], [/logo|design|flyer|canva/, "🎨"],
  [/bug|code|coding|website|landing/, "💻"], [/article|write-up|blog/, "✍️"], [/transcri/, "🎧"], [/business centre|print/, "🖨"],
  [/kiosk|shop|stall|business/, "🏪"], [/phone|iphone|tecno|infinix|samsung|itel|nokia/, "📱"], [/bike|bicycle/, "🚲"],
  [/car|corolla/, "🚗"], [/laptop/, "💻"], [/screen/, "🔧"], [/fees|charges|portal/, "🧾"], [/skit|video/, "🎬"],
  [/brand/, "📸"], [/clearance|sweep|clean/, "🧹"], [/assistant/, "🧾"], [/wake/, "⏰"],
];

export function iconFor(a) {
  const text = `${a.id} ${a.label}`.toLowerCase();
  for (const [re, icon] of ICONS) if (re.test(text)) return icon;
  return STATIONS[a.station]?.[0] || "✨";
}

const AMBIENT = {
  hall: ["📻 Somebody's radio is playing Fuji", "🪣 The queue for the tap is long today", "🍳 Someone is frying plantain on the corridor"],
  home: ["🔌 NEPA just brought light", "🐓 A neighbour's cock won't stop crowing"],
  lecture: ["🪑 People are keeping seats with bags", "📢 The class rep is shouting about attendance"],
  faculty: ["📌 New results on the notice board", "📚 Final years are arguing about projects"],
  food: ["🔥 Fresh ewedu just came out of the pot", "🧾 Mama is collecting transfers today", "🥤 Zobo is cold"],
  bank: ["🏧 The ATM queue is moving small small", "💳 Someone's card just got swallowed"],
  campus: ["🌳 It's breezy under the trees", "🎶 Choir practice somewhere close"],
};

export function ambientFor(kind, minute) {
  const list = AMBIENT[kind] || AMBIENT.campus;
  return list[Math.floor(minute / 3) % list.length];
}

/** The collapsed place card above the controls: tap to see what you can do here. */
export function PlaceCard({ name, sub, onOpen, here }) {
  return (
    <button onClick={() => {
      sfx("open");
      onOpen();
    }} className="float pointer-events-auto flex w-full items-center gap-3 rounded-3xl px-4 py-3 text-left">
      <span className="min-w-0 flex-1">
        <span className="display block truncate text-xl text-ink">{name} <span className="text-muted">›</span></span>
        <span className="mt-0.5 block truncate text-sm text-muted">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-go align-middle" aria-hidden />
          {here > 1 ? `${here} here · ` : ""}{sub}
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-sm font-bold text-white">Things to do</span>
    </button>
  );
}

function Tag({ k, v }) {
  const t = TAG[k];
  if (!t || !v) return null;
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: v > 0 ? t.tint : "#eef1ee", color: v > 0 ? "#16201a" : "#56635b" }}>
      {v > 0 ? "+" : "−"}{t.label}
    </span>
  );
}

/** Action cards in a two-column grid: icon, real seconds, price, name, and +/− need tags. */
export function ActionCards({ actions, onAct, busy }) {
  if (!actions.length) return <p className="py-6 text-center text-sm text-muted">Nothing to do here right now.</p>;
  const sorted = [...actions].sort((a, b) => (b.test ? 2 : 0) + b.enabled - ((a.test ? 2 : 0) + a.enabled));
  return (
    <ul className="grid grid-cols-2 gap-2.5">
      {sorted.map((a) => (
        <li key={a.id}>
          <button onClick={() => {
            sfx("tap");
            onAct(a);
          }} disabled={busy || !a.enabled}
            className={`flex h-full min-h-[8.5rem] w-full flex-col rounded-[20px] bg-white p-3 text-left shadow-[0_2px_10px_rgb(10_44_29/0.08)] ring-1 disabled:cursor-not-allowed ${
              a.test && a.enabled ? "ring-2 ring-go" : "ring-black/5"} ${a.enabled ? "" : "opacity-60"}`}>
            <span className="flex items-start justify-between gap-1">
              <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-chip text-2xl">{iconFor(a)}</span>
              <span className="text-right">
                {a.seconds > 0 && <span className="block rounded-full bg-chip px-1.5 py-0.5 text-[11px] font-semibold text-muted">🕒 {Math.round(a.seconds)}s</span>}
                <span className={`mt-0.5 block text-sm font-black ${a.earn ? "text-go" : a.cost ? "text-ink" : "text-go"}`}>
                  {a.earn ? `Earns ${nairaShort(a.earn)}` : a.cost ? naira(a.cost) : "Free"}
                </span>
              </span>
            </span>
            <span className="mt-2 line-clamp-2 text-[0.95rem] font-semibold leading-snug">{a.label}</span>
            {a.enabled ? (
              <span className="mt-auto flex flex-wrap gap-1 pt-2">
                {Object.entries(a.effects || {}).filter(([k]) => TAG[k]).slice(0, 3).map(([k, v]) => <Tag key={k} k={k} v={v} />)}
                {a.xp > 0 && <span className="rounded-full bg-bulb-soft px-2 py-0.5 text-[11px] font-bold">+{a.skill}</span>}
              </span>
            ) : (
              <span className="mt-auto pt-2 text-xs font-semibold text-muted">{a.reason}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

// --- The campus map and getting somewhere ------------------------------------------------------------

const MODE_ICON = { trek: "🚶", bus: "🚌", keke: "🛺", cab: "🚕", bike: "🚲", car: "🚗", town_bus: "🚐" };
const KIND_ICON = { lecture: "🎓", faculty: "🏛", hall: "🛏", home: "🏠", food: "🍲", bank: "🏦", campus: "📍" };
const PLACE_ICON = { hol: "📚", health: "🏥", sports: "⚽", amphi: "🎭", senate: "🏛", oduduwa: "🎤", market: "🛒", sub: "🛍", buka: "🍲", banks: "🏦", offcampus: "🏠", staff: "🏠" };

export function placeIcon(id, b) {
  return PLACE_ICON[id] || KIND_ICON[b.kind] || "📍";
}

/** The campus as a map with pins. Tap a pin to see that place. On a tall phone screen the map stands upright. */
const MAP_GROUPS = [
  ["all", "All"], ["class", "📚 Classes"], ["food", "🍲 Food"], ["home", "🛏 Halls"], ["money", "🏦 Money"], ["campus", "🏛 Campus"],
];
function mapGroup(b) {
  if (b.kind === "lecture" || b.kind === "faculty") return "class";
  if (b.kind === "food") return "food";
  if (b.kind === "hall" || b.kind === "home") return "home";
  if (b.kind === "bank") return "money";
  return "campus";
}

export function CampusMap({ world, game, selected, onSelect, playerPos, filter = "all", query = "" }) {
  const [portrait] = useState(() => typeof window !== "undefined" && window.innerHeight > window.innerWidth * 1.15);
  const shown = Object.entries(world.buildings).filter(([id, b]) => !(b.kind === "home" && id !== game.home));
  // fit the map to the places on it (and you), not to the roads that run off to town
  const pts = shown.map(([, b]) => [b.x, b.z]);
  if (playerPos) pts.push(playerPos);
  const pad = 34;
  const x0 = Math.min(...pts.map((p) => p[0])) - pad;
  const x1 = Math.max(...pts.map((p) => p[0])) + pad;
  const z0 = Math.min(...pts.map((p) => p[1])) - pad;
  const z1 = Math.max(...pts.map((p) => p[1])) + pad;
  // portrait: turn the map a quarter so the long side runs down the screen
  const P = (x, z) => (portrait ? [z1 - z + z0, x] : [x, z]);
  const box = portrait ? `${z0} ${x0} ${z1 - z0} ${x1 - x0}` : `${x0} ${z0} ${x1 - x0} ${z1 - z0}`;
  const pin = portrait ? 15 : 11;
  const q = query.trim().toLowerCase();
  const match = (id, b) => (filter === "all" || mapGroup(b) === filter) && (!q || b.name.toLowerCase().includes(q));
  // where the road to town leaves the map: an arrow on the edge
  const town = world.nodes.town;
  let exit = null;
  if (town && (town[0] < x0 || town[0] > x1 || town[1] < z0 || town[1] > z1)) {
    const tx = Math.max(x0 + 8, Math.min(x1 - 8, town[0]));
    const tz = Math.max(z0 + 8, Math.min(z1 - 8, town[1]));
    exit = P(tx, tz);
  }
  return (
    <svg viewBox={box} className="w-full rounded-2xl" role="group" aria-label="Campus map" style={{ background: "linear-gradient(160deg,#9cc46b,#7aa653)" }}>
      <defs>
        <filter id="pinShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodOpacity="0.35" />
        </filter>
      </defs>
      {world.edges.map(([a, b]) => {
        const [ax, ay] = P(...world.nodes[a]);
        const [bx, by] = P(...world.nodes[b]);
        return (
          <g key={`${a}-${b}`}>
            <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#4a4d50" strokeWidth="9" strokeLinecap="round" />
            <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#f2d24a" strokeWidth="0.8" strokeDasharray="5 6" />
          </g>
        );
      })}
      {(world.footpaths || []).map((f) => (
        <polyline key={f.name} points={f.points.map((pt) => P(...pt).join(",")).join(" ")} fill="none" stroke="#e6dcc4"
          strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {shown.map(([id, b]) => {
        const [cx, cy] = P(b.x, b.z);
        const [w, h] = portrait ? [b.d, b.w] : [b.w, b.d];
        return <rect key={id} x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx="3" fill="#f3eee2" opacity={match(id, b) ? 0.85 : 0.4} />;
      })}
      {exit && (
        <text x={exit[0]} y={exit[1]} textAnchor="middle" fontSize="10" fontWeight="900" fill="#fff" stroke="#16201a" strokeWidth="2.5" paintOrder="stroke">
          ◀ To town
        </text>
      )}
      {shown.map(([id, b]) => {
        const on = match(id, b);
        const sel = selected === id;
        const next = game.next_venue === id;
        const here = game.at === id;
        const [cx, cy] = P(b.x, b.z);
        const r = sel ? pin + 3 : pin;
        return (
          <g key={id} onClick={() => onSelect(id)} className="cursor-pointer" role="button" tabIndex={0} opacity={on ? 1 : 0.3}
            aria-label={`${b.name}${game.open[id] ? "" : " (closed now)"}${next ? ", your next lecture" : ""}`}
            onKeyDown={(e) => e.key === "Enter" && onSelect(id)}>
            <circle cx={cx} cy={cy} r={r} fill={sel ? "#f2c230" : "#ffffff"} filter="url(#pinShadow)"
              stroke={next ? "#1c9a5e" : here ? "#16201a" : "rgba(0,0,0,.18)"} strokeWidth={next || here ? 3 : 1} />
            {!game.open[id] && <circle cx={cx + r * 0.72} cy={cy - r * 0.72} r={r * 0.36} fill="#16201a" />}
            {!game.open[id] && <text x={cx + r * 0.72} y={cy - r * 0.6} textAnchor="middle" fontSize={r * 0.42} style={{ pointerEvents: "none" }}>🔒</text>}
            <text x={cx} y={cy + r * 0.38} textAnchor="middle" fontSize={r * 1.05} style={{ pointerEvents: "none" }}>{placeIcon(id, b)}</text>
            {(on || sel) && (
              <text x={cx} y={cy + r + 10} textAnchor="middle" fontSize={portrait ? 9.5 : 7.5} fontWeight="800" fill="#16201a" stroke="#fff" strokeWidth="2.6"
                paintOrder="stroke" style={{ pointerEvents: "none" }}>
                {b.name.replace(/ \(.*\)/, "").replace("Faculty of ", "").replace("Your self-con", "Self-con").replace(" Seater LT", " Seater")}
              </text>
            )}
            {next && <text x={cx} y={cy - r - 4} textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#fff" stroke="#1c9a5e" strokeWidth="3" paintOrder="stroke">NEXT CLASS</text>}
          </g>
        );
      })}
      {playerPos && (() => {
        const [px, py] = P(playerPos[0], playerPos[1]);
        return (
          <g style={{ pointerEvents: "none" }}>
            <circle cx={px} cy={py} r="11" fill="rgba(214,69,53,.25)" />
            <circle cx={px} cy={py} r="6.5" fill="#d64535" stroke="#fff" strokeWidth="2.5" />
            <text x={px} y={py - 12} textAnchor="middle" fontSize="9" fontWeight="900" fill="#fff" stroke="#d64535" strokeWidth="2.5" paintOrder="stroke">YOU</text>
          </g>
        );
      })()}
    </svg>
  );
}

export function MapSheet({ world, game, onPick, onClose, playerPos, on3d }) {
  const [view, setView] = useState("map");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const groups = useMemo(() => {
    const out = {};
    for (const [id, b] of Object.entries(world.buildings)) {
      if (id === game.at || (b.kind === "home" && id !== game.home)) continue;
      if (q && !b.name.toLowerCase().includes(q.toLowerCase())) continue;
      if (filter !== "all" && mapGroup(b) !== filter) continue;
      (out[b.kind] ||= []).push([id, b]);
    }
    return Object.entries(world.kinds).filter(([k]) => out[k]).map(([k, label]) => [label, out[k]]);
  }, [world, game.at, game.home, q, filter]);
  return (
    <BottomSheet title="📍 Where to?" subtitle="Tap a place to see how to get there" onClose={onClose} label="Map">
      {on3d && (
        <button className="mb-2 w-full rounded-full bg-chip py-2 text-sm font-bold" onClick={on3d}>🏙 Show the 3D map</button>
      )}
      <div className="mb-2 flex gap-2">
        <input className="min-w-0 flex-1 rounded-full bg-chip px-4 py-2.5 text-sm outline-none" placeholder="Search a place" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Search a place" />
        <div className="grid shrink-0 grid-cols-2 gap-1 rounded-full bg-chip p-1">
          {[["map", "Map"], ["list", "List"]].map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} aria-pressed={view === id}
              className={`rounded-full px-3 py-1.5 text-sm font-bold ${view === id ? "bg-white shadow" : "text-muted"}`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="chip-row -mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4" role="tablist" aria-label="Show">
        {MAP_GROUPS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${filter === id ? "bg-ink text-white" : "bg-chip"}`}>{label}</button>
        ))}
      </div>
      {view === "map" ? (
        <CampusMap world={world} game={game} onSelect={onPick} playerPos={playerPos} filter={filter} query={q} />
      ) : (
        <>
          {groups.length === 0 && <p className="py-6 text-center text-sm text-muted">No place matches “{q}”.</p>}
          {groups.map(([label, list]) => (
            <section key={label} className="mb-3">
              <h3 className="mb-1 text-xs font-bold text-muted">{label}</h3>
              <ul className="divide-y divide-line/60 rounded-2xl bg-slab">
                {list.map(([id, b]) => (
                  <li key={id}>
                    <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left" onClick={() => onPick(id)}>
                      <span aria-hidden className="text-xl">{placeIcon(id, b)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{id === game.home ? `${b.name} (home)` : b.name}</span>
                        <span className="block text-xs text-muted">
                          {game.next_venue === id ? "Your next class" : game.open[id] ? "Open now" : `🔒 Closed now${b.hours ? ` · opens ${clockText(b.hours[0])}` : ""}`}
                        </span>
                      </span>
                      <span aria-hidden className="text-muted">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </BottomSheet>
  );
}

export function PlaceSheet({ world, game, to, onPlan, onGo, onClose, onBack, busy, people = [] }) {
  const planRef = useRef(onPlan);
  planRef.current = onPlan;
  const b = world.buildings[to];
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(null);
  useEffect(() => {
    let live = true;
    setQuote(null);
    setError("");
    planRef.current(to).then((qq) => {
      if (!live) return;
      setQuote(qq);
      const first = qq.options.find((o) => o.available);
      setMode(first?.mode || null);
    }).catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [to]); // only when the destination changes, so the options never reload while you choose
  const opt = quote?.options.find((o) => o.mode === mode);
  return (
    <BottomSheet onClose={onClose} label={`To ${b.name}`} height="80%"
      header={
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-chip text-2xl">{placeIcon(to, b)}</span>
          <span className="min-w-0">
            <span className="display block truncate text-[1.45rem] text-ife-900">{b.name}</span>
            <span className="block text-sm text-muted">{world.kinds[b.kind]}{b.hours ? ` · open ${clockText(b.hours[0])} to ${clockText(b.hours[1])}` : " · open all day"}</span>
          </span>
        </div>
      }
      footer={
        <button className="btn w-full rounded-full bg-go py-4 text-lg text-white" disabled={!opt?.available || busy}
          onClick={() => {
            sfx("tap");
            onGo(to, opt);
          }}>
          {opt ? `Go · ${opt.cost ? naira(opt.cost) : "Free"}` : "Go"}
        </button>
      }>
      <div className="flex flex-wrap gap-1.5">
        {game.next_venue === to && <span className="rounded-full bg-ife-50 px-2.5 py-1 text-xs font-bold text-ife-700">📚 Your next class is here</span>}
        {game.exam_venue === to && <span className="rounded-full bg-bulb-soft px-2.5 py-1 text-xs font-bold">✍️ Exam hall</span>}
        {!game.open[to] && (
          <span className="rounded-full bg-danger-soft px-2.5 py-1 text-xs font-bold text-danger">
            🔒 Closed now{b.hours ? ` · opens ${clockText(b.hours[0])}` : ""}
          </span>
        )}
        {onBack && <button className="ml-auto text-sm font-bold text-ife-600" onClick={onBack}>‹ Map</button>}
      </div>
      {b.blurb && <p className="mt-2 text-[0.95rem] leading-snug text-ink">{b.blurb}</p>}
      {b.things?.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Things to do there">
          {b.things.map((t) => <li key={t} className="rounded-full bg-chip px-2.5 py-1 text-xs font-semibold">{t}</li>)}
        </ul>
      )}
      {people.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="flex -space-x-2" aria-hidden>
            {people.slice(0, 4).map((p, i) => (
              <span key={i} className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-black text-white ring-2 ring-white ${p.kind === "player" ? "bg-[#2f7de1]" : "bg-ink/80"}`}>
                {p.name.slice(0, 1)}
              </span>
            ))}
          </span>
          <span className="text-sm text-muted">
            <b className="text-ink">Here now:</b> {people.slice(0, 2).map((p) => p.name).join(", ")}{people.length > 2 ? ` and ${people.length - 2} more` : ""}
          </span>
        </div>
      )}
      {error && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {!quote && !error && <p className="mt-4 text-sm text-muted" role="status">Checking the roads…</p>}
      {quote && (
        <>
          {!quote.open_on_arrival && quote.hours && (
            <p className="mt-3 rounded-xl bg-bulb-soft px-3 py-2 text-sm font-semibold">It'll be closed when you get there (open {quote.hours[0]} to {quote.hours[1]}).</p>
          )}
          <h3 className="mt-4 text-xs font-bold text-muted">HOW YOU'LL GET THERE</h3>
          <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Transport">
            {quote.options.map((o) => (
              <button key={o.mode} role="radio" aria-checked={mode === o.mode} disabled={!o.available}
                onClick={() => {
                  sfx("tap");
                  setMode(o.mode);
                }}
                className={`flex h-[5.4rem] flex-col items-center justify-center rounded-[22px] px-1 text-center disabled:opacity-40 ${
                  mode === o.mode ? "bg-[#e3f3ea] ring-2 ring-go" : "bg-chip"}`}>
                <span aria-hidden className="text-2xl leading-none">{MODE_ICON[o.mode] || "🚶"}</span>
                <span className="mt-1 text-xs font-semibold">{o.name.replace("CNG campus bus", "CNG bus").replace("Night cab", "Cab")}</span>
                <span className="text-xs font-black">{o.available ? (o.cost ? naira(o.cost) : "Free") : o.mode === "cab" ? "9 PM+" : "Not now"}</span>
              </button>
            ))}
          </div>
          {opt ? (
            <p className="mt-3 text-sm text-muted">
              {duration(opt.minutes)} trip{opt.wait >= 10 ? " · long queue" : ""}{opt.walk && opt.mode !== "trek" ? ` · ${opt.walk} min walk` : ""}
              {opt.rush ? " · rush hour" : ""}{opt.rain ? " · rain price 🌧️" : ""}. Plays in about {Math.round(opt.seconds)} seconds.
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted">{quote.options.find((o) => !o.available)?.reason}</p>
          )}
          {quote.options.filter((o) => !o.available).map((o) => (
            <p key={o.mode} className="mt-1 text-xs text-muted">{MODE_ICON[o.mode]} {o.name}: {o.reason}</p>
          ))}
        </>
      )}
    </BottomSheet>
  );
}

const SEGMENT_TEXT = {
  walk: "Trekking", wait: "Waiting at the park",
  ride: { bus: "On the CNG bus", keke: "In a keke", cab: "In a night cab", town_bus: "On the town bus", bike: "Cycling", car: "Driving" },
};

/** The ride: a pill at the top and a progress card at the bottom. */
export function JourneyBar({ journey, progress, segment, fromName, onSkip }) {
  const text = segment ? (segment.kind === "ride" ? SEGMENT_TEXT.ride[segment.mode] : segment.label || SEGMENT_TEXT[segment.kind]) : "Moving";
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-[max(3.5rem,calc(env(safe-area-inset-top)+3rem))] z-20 mx-auto flex max-w-5xl justify-start pl-3 pr-20">
        <p className="float min-w-0 truncate rounded-full px-4 py-2 text-sm font-semibold">{MODE_ICON[journey.mode] || "🚶"} On the way to {journey.toName}…</p>
      </div>
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex justify-center p-3" aria-live="polite">
        <div className="float w-full max-w-[560px] rounded-3xl p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="truncate">{fromName}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-chip">
              <span className="block h-full rounded-full bg-[#3b82f6]" style={{ width: `${progress * 100}%` }} />
            </span>
            <span className="truncate">{journey.toName}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-sm text-muted">{text} · {duration(journey.minutes)} trip</p>
            <span className="flex gap-1.5">
              <button className="rounded-full bg-chip px-3 py-1 text-xs font-bold" onClick={() => sfx("horn")}>📯 Horn</button>
              {onSkip && <button className="rounded-full bg-chip px-3 py-1 text-xs font-bold" onClick={onSkip}>Skip ⏭</button>}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

export function Timetable({ game }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return (
    <table className="w-full text-sm">
      <tbody>
        {game.timetable.map((row, i) => (
          <tr key={i} className={`border-t border-line/60 ${game.dow === i ? "bg-bulb-soft" : ""}`}>
            <td className="py-1.5 pl-2 font-bold">{days[i]}</td>
            <td className="py-1.5">
              {row.map((l) => (
                <span key={l.start} className="block">{l.time} <b>{l.code}</b> · {l.venue_name}</span>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
