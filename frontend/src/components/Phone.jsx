// Your phone, drawn as the phone you actually have: an iPhone, an Android (Tecno, Infinix, Samsung, itel)
// or a torchlight Nokia. Cracked screens look cracked. Apps open the things you can do from your phone.
import { useState } from "react";
import { clockText, duration, naira } from "../lib/format";

const WALLPAPER = {
  ios: "linear-gradient(160deg, #1f6f4a 0%, #0e4a30 40%, #f2a65a 100%)",
  tecno: "linear-gradient(170deg, #0b3d91 0%, #1c6dd0 55%, #7fd1ff 100%)",
  infinix: "linear-gradient(165deg, #1a0b2e 0%, #4b1d7a 55%, #c04dff 100%)",
  samsung: "linear-gradient(170deg, #c9c3f2 0%, #8f86d6 50%, #f3d6e8 100%)",
  itel: "linear-gradient(170deg, #ff7a18 0%, #d64b0f 60%, #3b1606 100%)",
};

const APPS = [
  { id: "portal", name: "OAU Portal", icon: "🎓", color: "#14603f", actions: ["pay_fees"], always: true },
  { id: "call", name: "Phone", icon: "📞", color: "#2fb34a", actions: ["call_home"] },
  { id: "data", name: "Data Plug", icon: "📶", color: "#f2c230", actions: ["sell_data"] },
  { id: "canva", name: "Canva", icon: "🎨", color: "#19a7ce", actions: ["design_gig", "logo_gig"] },
  { id: "gigs", name: "Gigs", icon: "💼", color: "#6b4f2a", actions: ["bug_fix", "website_gig", "bridal_hair", "barb_wedding"] },
  { id: "social", name: "Socials", icon: "💬", color: "#d6336c", actions: ["scroll", "brand_deal"] },
  { id: "biz", name: "Business", icon: "🏪", color: "#b5482a", match: (id) => id.startsWith("buy_") && id !== "buy_car" || id.startsWith("sell_") && id !== "sell_data" },
  { id: "jiji", name: "Jiji", icon: "🚗", color: "#3db83a", actions: ["buy_car"] },
  { id: "bank", name: "Bank", icon: "🏦", color: "#2f5f9e", screen: "bank" },
  { id: "timetable", name: "Timetable", icon: "🗓", color: "#7a3e9d", screen: "timetable" },
  { id: "maps", name: "Maps", icon: "🗺", color: "#e9c227", screen: "maps" },
];

function Crack() {
  return (
    <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full" viewBox="0 0 100 200" preserveAspectRatio="none" aria-hidden>
      <g stroke="rgba(255,255,255,0.75)" strokeWidth="0.45" fill="none">
        <path d="M70 40 L55 62 L58 80 L40 110 L44 130 L30 160" />
        <path d="M70 40 L88 52 L96 50" />
        <path d="M70 40 L76 20 L74 4" />
        <path d="M70 40 L50 34 L30 40 L10 33" />
        <path d="M55 62 L75 75 L90 100" />
        <path d="M58 80 L80 92" />
        <path d="M40 110 L20 118 L4 130" />
        <path d="M44 130 L62 150 L70 196" />
      </g>
      <circle cx="70" cy="40" r="3" fill="rgba(255,255,255,0.35)" />
    </svg>
  );
}

function StatusBar({ minute, dark = false }) {
  return (
    <div className={`flex items-center justify-between px-5 pt-2 text-[11px] font-bold ${dark ? "text-ink" : "text-white"}`}>
      <span>{clockText(minute).replace(/ (AM|PM)/, "")}</span>
      <span aria-hidden>▂▄▆ 4G ▮▮▮▯</span>
    </div>
  );
}

function AppActions({ actions, onAct, busy }) {
  if (!actions.length) return <p className="p-4 text-sm text-white/80">Nothing here yet.</p>;
  return (
    <ul className="space-y-2 p-3">
      {actions.map((a) => (
        <li key={a.id}>
          <button
            onClick={() => onAct(a)}
            disabled={busy || !a.enabled}
            className="w-full rounded-xl bg-white/95 px-3 py-2.5 text-left text-ink shadow disabled:bg-white/55"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className={`text-sm font-bold ${a.enabled ? "" : "text-muted"}`}>{a.label}</span>
              <span className="shrink-0 text-[11px] font-bold text-muted">{duration(a.minutes)}</span>
            </span>
            <span className="mt-0.5 block text-xs text-muted">{a.enabled ? a.blurb : a.reason}</span>
            {a.enabled && (a.earn > 0 || a.cost > 0) && (
              <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${a.earn ? "bg-ife-50 text-ife-700" : "bg-bulb-soft"}`}>
                {a.earn ? `+${naira(a.earn)}` : `−${naira(a.cost)}`}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function AppScreen({ app, game, onAct, busy, onBack }) {
  let body;
  if (app.screen === "bank") {
    body = (
      <div className="space-y-3 p-4 text-white">
        <div className="rounded-2xl bg-white/15 p-4">
          <p className="text-xs opacity-80">Available balance</p>
          <p className="num text-4xl">{naira(game.money)}</p>
        </div>
        <p className="text-xs opacity-80">Businesses have paid you {naira(game.business_income)} so far.</p>
        <ul className="space-y-1 text-xs">
          {game.log.filter((l) => /₦/.test(l.text)).slice(0, 6).map((l, i) => (
            <li key={i} className="rounded-lg bg-black/20 px-2 py-1.5">{l.text}</li>
          ))}
        </ul>
      </div>
    );
  } else if (app.screen === "timetable") {
    body = (
      <ul className="space-y-1.5 p-3 text-sm text-white">
        {game.timetable.map((row, i) => (
          <li key={i} className={`rounded-xl px-3 py-2 ${game.dow === i ? "bg-white/30" : "bg-black/20"}`}>
            <b>{["Mon", "Tue", "Wed", "Thu", "Fri"][i]}</b>
            {row.map((l) => (
              <span key={l.start} className="block text-xs">
                {l.time} · {l.code} · {l.venue_name}
              </span>
            ))}
          </li>
        ))}
      </ul>
    );
  } else {
    const list = game.phone.filter((a) => (app.match ? app.match(a.id) : app.actions.includes(a.id)));
    body = (
      <>
        {app.id === "portal" && (
          <p className="mx-3 mt-3 rounded-xl bg-white/90 px-3 py-2 text-xs text-ink">
            {game.fees_covered ? "School charges are covered for you." : game.fees_paid ? "School charges: PAID. Exam card ready." : `School charges: unpaid (${naira(10000)}).`}
            {game.cgpa !== null && ` CGPA ${game.cgpa.toFixed(2)}.`}
          </p>
        )}
        <AppActions actions={list} onAct={onAct} busy={busy} />
      </>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 py-2 text-white">
        <button className="rounded-full bg-black/25 px-3 py-1 text-sm font-bold" onClick={onBack}>
          ‹ Back
        </button>
        <span className="font-bold">{app.name}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  );
}

function SmartPhone({ info, game, minute, onAct, busy, onMaps }) {
  const [app, setAppState] = useState(null);
  const setApp = (a) => (a?.screen === "maps" ? onMaps() : setAppState(a));
  const ios = info.os === "ios";
  const wall = ios ? WALLPAPER.ios : WALLPAPER[info.brand] || WALLPAPER.tecno;
  const visible = APPS.filter((a) => a.screen || a.always || game.phone.some((x) => (a.match ? a.match(x.id) : a.actions.includes(x.id))));
  const dock = ios ? visible.slice(0, 4) : [];
  const grid = ios ? visible.slice(4) : visible;
  return (
    <div
      className={`relative mx-auto flex h-[min(78vh,640px)] aspect-[9/19] flex-col overflow-hidden border-[10px] border-[#111] bg-black shadow-2xl ${ios ? "rounded-[3rem]" : "rounded-[2rem]"}`}
    >
      <div className="relative flex min-h-0 flex-1 flex-col" style={{ background: wall }}>
        {ios ? (
          <div className="absolute left-1/2 top-1.5 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-black" aria-hidden />
        ) : (
          <div className="absolute left-1/2 top-2 z-10 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-black" aria-hidden />
        )}
        <StatusBar minute={minute} />
        {app ? (
          <AppScreen app={app} game={game} onAct={onAct} busy={busy} onBack={() => setApp(null)} />
        ) : (
          <>
            <div className="px-5 pb-2 pt-6 text-white">
              <p className="num text-5xl drop-shadow">{clockText(minute).replace(/ (AM|PM)/, "")}</p>
              <p className="text-xs font-bold opacity-90">
                {game.weekday} · {naira(game.money)}
              </p>
            </div>
            {!ios && (
              <div className="mx-4 mb-3 rounded-full bg-white/90 px-4 py-2 text-xs text-muted">🔍 Search</div>
            )}
            <ul className="grid flex-1 grid-cols-4 content-start gap-x-2 gap-y-4 px-4">
              {grid.map((a) => (
                <li key={a.id} className="text-center">
                  <button onClick={() => setApp(a)} className="w-full" aria-label={a.name}>
                    <span
                      className={`mx-auto grid h-12 w-12 place-items-center text-2xl shadow-md ${ios ? "rounded-[0.9rem]" : "rounded-full"}`}
                      style={{ background: a.color }}
                      aria-hidden
                    >
                      {a.icon}
                    </span>
                    <span className="mt-1 block truncate text-[10px] font-bold text-white drop-shadow">{a.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            {ios && (
              <div className="mx-3 mb-3 grid grid-cols-4 gap-2 rounded-[1.6rem] bg-white/25 p-2.5 backdrop-blur">
                {dock.map((a) => (
                  <button key={a.id} onClick={() => setApp(a)} aria-label={a.name}
                    className="mx-auto grid h-12 w-12 place-items-center rounded-[0.9rem] text-2xl shadow" style={{ background: a.color }}>
                    {a.icon}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {info.cracked && <Crack />}
      </div>
      {ios ? (
        <div className="flex justify-center bg-transparent py-1.5" style={{ background: wall }}>
          <span className="h-1 w-28 rounded-full bg-white/80" aria-hidden />
        </div>
      ) : (
        <div className="flex justify-around bg-black py-1.5 text-sm text-white/80" aria-hidden>
          <span>◁</span>
          <span>○</span>
          <span>□</span>
        </div>
      )}
    </div>
  );
}

function KeypadPhone({ info, game, minute, onAct, busy }) {
  const [screen, setScreen] = useState("menu");
  const [torch, setTorch] = useState(false);
  const call = game.phone.find((a) => a.id === "call_home");
  const snake = game.phone.find((a) => a.id === "snake");
  const items = [
    { label: "Call Mummy", run: () => call && onAct(call), disabled: !call?.enabled, note: call?.enabled ? null : call?.reason },
    { label: "Snake", run: () => snake && onAct(snake), disabled: !snake?.enabled },
    { label: "Messages", run: () => setScreen("sms") },
    { label: torch ? "Torchlight: ON" : "Torchlight", run: () => setTorch((t) => !t) },
  ];
  return (
    <div className="relative mx-auto flex h-[min(74vh,560px)] w-[min(68vw,250px)] flex-col items-center rounded-[2.5rem] bg-gradient-to-b from-[#3a3f47] to-[#1f2228] p-4 shadow-2xl">
      <span className={`mb-2 h-2 w-8 rounded-full ${torch ? "bg-white shadow-[0_0_25px_10px_rgba(255,255,230,0.9)]" : "bg-[#555]"}`} aria-hidden />
      <p className="text-[10px] font-black tracking-[0.3em] text-white/70">NOKIA</p>
      <div className="relative mt-2 h-[42%] w-full overflow-hidden rounded-md bg-[#b9d3a5] p-2 font-mono text-[12px] text-[#1d2b14] shadow-inner">
        <div className="flex justify-between text-[10px]">
          <span>▂▄▆</span>
          <span>{clockText(minute)}</span>
          <span>▮▮▮</span>
        </div>
        {screen === "menu" ? (
          <ul className="mt-1 space-y-0.5">
            {items.map((it) => (
              <li key={it.label}>
                <button className="w-full rounded px-1 text-left hover:bg-[#1d2b14] hover:text-[#b9d3a5] disabled:opacity-50"
                  disabled={busy || it.disabled} onClick={it.run}>
                  › {it.label}
                </button>
              </li>
            ))}
            <li className="pt-1 text-[10px]">No data. Pay fees at a SUB business centre.</li>
          </ul>
        ) : (
          <div className="mt-1 h-[80%] space-y-1 overflow-y-auto text-[10px]">
            <button className="underline" onClick={() => setScreen("menu")}>‹ Back</button>
            {game.log.slice(0, 6).map((l, i) => (
              <p key={i}>✉ {l.text}</p>
            ))}
          </div>
        )}
        {info.cracked && <Crack />}
      </div>
      <div className="mt-4 grid w-full grid-cols-3 gap-2" aria-hidden>
        {["1", "2 abc", "3 def", "4 ghi", "5 jkl", "6 mno", "7 pqrs", "8 tuv", "9 wxyz", "*", "0", "#"].map((k) => (
          <span key={k} className="rounded-xl bg-[#2a2e35] py-1.5 text-center text-[11px] font-bold text-white/80 shadow">
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The phone overlay. */
export default function Phone({ game, minute, onAct, busy, onClose, onMaps, onMarket }) {
  const info = game.phone_info;
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-ink/60 p-4 backdrop-blur-sm"
      role="dialog" aria-label={info ? `Your phone: ${info.name}` : "No phone"}>
      {info ? (
        <>
          {info.os === "keypad" ? (
            <KeypadPhone info={info} game={game} minute={minute} onAct={onAct} busy={busy} />
          ) : (
            <SmartPhone info={info} game={game} minute={minute} onAct={onAct} busy={busy} onMaps={onMaps} />
          )}
          <p className="text-center text-xs font-bold text-white">
            {info.name}
            {info.cracked && " · cracked screen (fix it at Ojaja)"}
          </p>
        </>
      ) : (
        <div className="max-w-xs rounded-2xl bg-slab p-5 text-center">
          <p className="text-4xl" aria-hidden>📵</p>
          <h2 className="display mt-2 text-3xl font-black text-ife-900">No phone</h2>
          <p className="mt-2 text-sm text-muted">
            You lost your phone. New Market (Ojaja) sells everything from a ₦15,000 torchlight Nokia to a UK-used iPhone.
          </p>
          <button className="btn-primary mt-4 w-full" onClick={onMarket}>
            Go to Ojaja market
          </button>
        </div>
      )}
      <button className="btn-ghost px-6" onClick={onClose}>
        Put phone away
      </button>
    </div>
  );
}
