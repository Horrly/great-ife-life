// Your phone, drawn as the phone you actually have: an iPhone, an Android (Tecno, Infinix, Samsung, itel)
// or a torchlight Nokia. Cracked screens look cracked. Apps open the things you can do from your phone.
import { useEffect, useState } from "react";
import { clockText, duration, naira } from "../lib/format";
import { BankApp } from "./Banking";
import ChatApp from "./Chat";
import { SugCard } from "./Extras";

const WALLPAPER = {
  ios: "linear-gradient(160deg, #1f6f4a 0%, #0e4a30 40%, #f2a65a 100%)",
  tecno: "linear-gradient(170deg, #0b3d91 0%, #1c6dd0 55%, #7fd1ff 100%)",
  infinix: "linear-gradient(165deg, #1a0b2e 0%, #4b1d7a 55%, #c04dff 100%)",
  samsung: "linear-gradient(170deg, #c9c3f2 0%, #8f86d6 50%, #f3d6e8 100%)",
  itel: "linear-gradient(170deg, #ff7a18 0%, #d64b0f 60%, #3b1606 100%)",
};

const APPS = [
  { id: "portal", name: "OAU Portal", icon: "🎓", color: "#14603f", actions: ["pay_fees"], always: true },
  { id: "chat", name: "Gist", icon: "🗨️", color: "#25a35a", screen: "chat" },
  { id: "bank", name: "Bank", icon: "🏦", color: "#2f5f9e", screen: "bank" },
  { id: "call", name: "Call Mummy", icon: "📞", color: "#2fb34a", screen: "parents" },
  { id: "houses", name: "Houses", icon: "🏠", color: "#c0612b", screen: "houses" },
  { id: "freelance", name: "Freelance", icon: "🧑‍💻", color: "#1dbf73", actions: ["fl_article", "design_gig"], day: 2 },
  { id: "bet", name: "OgaBet", icon: "⚽", color: "#0f2f1f", screen: "bet", smart: true, day: 3 },
  { id: "data", name: "Data Plug", icon: "📶", color: "#f2c230", actions: ["sell_data"], day: 2 },
  { id: "canva", name: "Canva", icon: "🎨", color: "#19a7ce", actions: ["logo_gig"], day: 3 },
  { id: "gigs", name: "Gigs", icon: "💼", color: "#6b4f2a", actions: ["bug_fix", "website_gig", "bridal_hair", "barb_wedding"], day: 3 },
  { id: "social", name: "Socials", icon: "💬", color: "#d6336c", actions: ["scroll", "brand_deal"], day: 2 },
  { id: "biz", name: "Business", icon: "🏪", color: "#b5482a", match: (id) => (id.startsWith("buy_") && id !== "buy_car") || (id.startsWith("sell_") && id !== "sell_data") || id.startsWith("promo_"), day: 4 },
  { id: "jiji", name: "Jiji", icon: "🚗", color: "#3db83a", actions: ["buy_car"], day: 5 },
  { id: "timetable", name: "Timetable", icon: "🗓", color: "#7a3e9d", screen: "timetable" },
  { id: "maps", name: "Maps", icon: "🗺", color: "#e9c227", screen: "maps" },
];

// New students get the basics; more apps open over their first days, so nobody drowns on day one.
function seenApps() {
  try {
    return new Set(JSON.parse(localStorage.getItem("gil.apps.seen") || "[]"));
  } catch {
    return new Set();
  }
}
function markSeen(id) {
  try {
    const s = seenApps();
    s.add(id);
    localStorage.setItem("gil.apps.seen", JSON.stringify([...s]));
  } catch {
    /* fine: the NEW tag just stays */
  }
}

function Crack() {
  // a hairline crack from one corner, the way real dropped phones look
  return (
    <svg className="pointer-events-none absolute right-0 top-0 z-20 h-1/3 w-1/2" viewBox="0 0 100 100" aria-hidden>
      <g stroke="rgba(255,255,255,0.55)" strokeWidth="0.6" fill="none" strokeLinecap="round">
        <path d="M100 6 L82 18 L78 30 L62 41 L57 58" />
        <path d="M82 18 L70 14 L58 17" />
        <path d="M78 30 L90 40 L96 52" />
        <path d="M62 41 L48 44" />
      </g>
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

const ASK_LABEL = (n) => (n >= 1000 ? `₦${n / 1000}k` : `₦${n}`);

function ParentsScreen({ game, busy, onParents }) {
  const p = game.parents;
  return (
    <div className="space-y-3 p-4 text-white">
      <div className="rounded-2xl bg-white/15 p-4">
        <p className="text-xs opacity-80">Calling</p>
        <p className="display text-3xl">Mummy 📞</p>
        <p className="mt-1 text-xs opacity-90">
          You're a {game.profile.name}. However much you ask, they won't send more than {naira(p.cap)}.
        </p>
      </div>
      {!game.bank ? (
        <p className="rounded-xl bg-black/25 px-3 py-2 text-sm">"Send me your account number." Open a bank account first so they can send money.</p>
      ) : p.called ? (
        <p className="rounded-xl bg-black/25 px-3 py-2 text-sm">You've called this week. Call again next Monday.</p>
      ) : (
        <>
          <p className="text-sm font-bold">How much will you ask for?</p>
          <div className="grid grid-cols-3 gap-2">
            {p.asks.map((n) => (
              <button key={n} disabled={busy} onClick={() => onParents(n)}
                className="rounded-xl bg-white/95 px-2 py-3 text-base font-black text-ink shadow disabled:opacity-60">
                {ASK_LABEL(n)}
              </button>
            ))}
          </div>
          <p className="text-xs opacity-80">Once a week, between 7 AM and 10 PM. Parents rarely send everything you ask for.</p>
        </>
      )}
    </div>
  );
}

function BetScreen({ game, busy, onBet }) {
  const b = game.betting;
  const [adult, setAdult] = useState(b.adult);
  const [stake, setStake] = useState(b.stakes[1]);
  const net = b.won - b.staked;
  if (!adult) {
    return (
      <div className="space-y-3 p-4 text-white">
        <p className="display text-3xl">OgaBet ⚽</p>
        <p className="text-sm">Virtual football: matches finish in seconds. The bookie keeps about 12% of every naira, so over time the app wins.</p>
        <label className="flex items-start gap-2 rounded-xl bg-white/15 p-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4" onChange={(e) => setAdult(e.target.checked)} />
          I'm 18 or older
        </label>
      </div>
    );
  }
  return (
    <div className="space-y-2.5 p-3 text-white">
      <div className="flex items-baseline justify-between rounded-xl bg-white/10 px-3 py-2 text-xs">
        <span>Bets today: {b.today}/10</span>
        <span className={net < 0 ? "font-bold text-[#ff9a8a]" : "font-bold text-[#8fe3a8]"}>
          {b.staked ? `${net < 0 ? "Down" : "Up"} ${naira(Math.abs(net))} overall` : "No bets yet"}
        </span>
      </div>
      {b.last && (
        <p className={`rounded-xl px-3 py-2 text-sm font-bold ${b.last.won ? "bg-[#1f7a46]" : "bg-[#7a1f1f]"}`}>
          {b.last.score} · {b.last.won ? "Won" : "Lost"}
        </p>
      )}
      <div className="flex gap-1.5" role="radiogroup" aria-label="Stake">
        {b.stakes.map((n) => (
          <button key={n} role="radio" aria-checked={stake === n} onClick={() => setStake(n)}
            className={`flex-1 rounded-lg px-1 py-1.5 text-xs font-black ${stake === n ? "bg-bulb text-ink" : "bg-white/15"}`}>
            {ASK_LABEL(n)}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {b.fixtures.map((f) => (
          <li key={f.index} className="rounded-xl bg-white/95 p-2.5 text-ink">
            <p className="text-sm font-bold">{f.home} <span className="text-muted">vs</span> {f.away}</p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {["1", "X", "2"].map((k) => (
                <button key={k} disabled={busy || (game.bank?.balance ?? 0) < stake || b.today >= 10}
                  onClick={() => onBet(f.index, k, stake, true)}
                  className="rounded-lg bg-[#0f2f1f] px-1 py-1.5 text-white disabled:opacity-50">
                  <span className="block text-[10px] opacity-70">{k === "1" ? "Home" : k === "X" ? "Draw" : "Away"}</span>
                  <span className="num text-base">{f.odds[k].toFixed(2)}</span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] opacity-75">New matches every 10 minutes. Only bet what you can afford to lose.</p>
    </div>
  );
}

function AppScreen({ app, game, onAct, busy, onBack, onParents, onBet, run }) {
  let body;
  if (app.screen === "chat") {
    body = <ChatApp />;
  } else if (app.screen === "parents") {
    body = <ParentsScreen game={game} busy={busy} onParents={onParents} />;
  } else if (app.screen === "bet") {
    body = <BetScreen game={game} busy={busy} onBet={onBet} />;
  } else if (app.screen === "bank") {
    body = <BankApp game={game} run={run} />;
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
        {app.id === "portal" && <SugCard />}
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
      <div className={`min-h-0 flex-1 ${app.screen === "chat" ? "flex flex-col" : "overflow-y-auto"}`}>{body}</div>
    </div>
  );
}

function SmartPhone({ info, game, minute, onAct, busy, onMaps, onHousing, onParents, onBet, run }) {
  const [app, setAppState] = useState(null);
  const [seen, setSeen] = useState(seenApps);
  const setApp = (a) => {
    if (a && !seen.has(a.id)) {
      markSeen(a.id);
      setSeen(seenApps());
    }
    return a?.screen === "maps" ? onMaps() : a?.screen === "houses" ? onHousing() : setAppState(a);
  };
  const daysIn = game.total_days || 1;
  const isNew = (a) => a.day && daysIn - a.day < 2 && !seen.has(a.id);
  const ios = info.os === "ios";
  const wall = ios ? WALLPAPER.ios : WALLPAPER[info.brand] || WALLPAPER.tecno;
  const usable = APPS.filter((a) => a.screen || a.always || game.phone.some((x) => (a.match ? a.match(x.id) : a.actions.includes(x.id))));
  const visible = usable.filter((a) => !a.day || daysIn >= a.day);
  const locked = usable.filter((a) => a.day && daysIn < a.day);
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
          <AppScreen app={app} game={game} onAct={onAct} busy={busy} onBack={() => setApp(null)} onParents={onParents} onBet={onBet} run={run} />
        ) : (
          <>
            <div className="px-5 pb-2 pt-6 text-white">
              <p className="num text-5xl drop-shadow">{clockText(minute).replace(/ (AM|PM)/, "")}</p>
              <p className="text-xs font-bold opacity-90">
                {game.weekday} · {naira(game.total_money ?? game.money)}
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
                      className={`relative mx-auto grid h-12 w-12 place-items-center text-2xl shadow-md ${ios ? "rounded-[0.9rem]" : "rounded-full"}`}
                      style={{ background: a.color }}
                      aria-hidden
                    >
                      {a.icon}
                      {isNew(a) && (
                        <span className="absolute -right-2 -top-1 rounded-full bg-danger px-1 text-[9px] font-black text-white">NEW</span>
                      )}
                      {a.id === "chat" && game.chat_unread > 0 && (
                        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-danger px-1 text-[11px] font-black text-white">
                          {game.chat_unread}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-[10px] font-bold text-white drop-shadow">{a.name}</span>
                  </button>
                </li>
              ))}
              {locked.length > 0 && (
                <li className="text-center" title="More apps open over your first days on campus">
                  <span className={`relative mx-auto grid h-12 w-12 place-items-center bg-black/30 text-lg text-white ${ios ? "rounded-[0.9rem]" : "rounded-full"}`} aria-hidden>
                    🔒
                  </span>
                  <span className="mt-1 block truncate text-[10px] font-bold text-white drop-shadow">
                    {(() => {
                      const d = Math.min(...locked.map((a) => a.day));
                      return `+${locked.filter((a) => a.day === d).length} on day ${d}`;
                    })()}
                  </span>
                </li>
              )}
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

function KeypadPhone({ info, game, minute, onAct, busy, onParents }) {
  const [screen, setScreen] = useState("menu");
  const [torch, setTorch] = useState(false);
  const snake = game.phone.find((a) => a.id === "snake");
  const items = [
    { label: game.parents.called ? "Call Mummy (next week)" : "Call Mummy", run: () => setScreen("call"), disabled: game.parents.called },
    { label: "Snake", run: () => snake && onAct(snake), disabled: !snake?.enabled },
    { label: "Bank (*894#)", run: () => setScreen("ussd") },
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
        ) : screen === "ussd" ? (
          <div className="mt-1 space-y-0.5 text-[11px]">
            <button className="underline" onClick={() => setScreen("menu")}>‹ Back</button>
            {game.bank ? (
              <>
                <p>{game.bank.name}</p>
                <p>Acct: {game.bank.number}</p>
                <p>Bal: {naira(game.bank.balance)}</p>
                <p className="pt-1">Withdraw at any POS by transfer.</p>
              </>
            ) : (
              <p>No account. Visit the Banking Area (8am-4pm, Mon-Fri).</p>
            )}
          </div>
        ) : screen === "call" ? (
          <div className="mt-1 space-y-0.5 text-[11px]">
            <button className="underline" onClick={() => setScreen("menu")}>‹ Back</button>
            <p>Ask Mummy for:</p>
            {game.parents.asks.map((n) => (
              <button key={n} disabled={busy} className="block w-full rounded px-1 text-left hover:bg-[#1d2b14] hover:text-[#b9d3a5]"
                onClick={() => {
                  onParents(n);
                  setScreen("menu");
                }}>
                › {naira(n)}
              </button>
            ))}
          </div>
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
export default function Phone({ game, minute, onAct, busy, onClose, onMaps, onMarket, onHousing, onParents, onBet, run }) {
  const info = game.phone_info;
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-ink/45 p-4"
      role="dialog" aria-label={info ? `Your phone: ${info.name}` : "No phone"}>
      <button className="absolute inset-0 cursor-default" aria-label="Put phone away" tabIndex={-1} onClick={onClose} />
      <button className="float absolute right-4 top-[max(3.6rem,calc(env(safe-area-inset-top)+3rem))] z-10 rounded-full px-4 py-2 text-sm font-bold" onClick={onClose}>
        × Close
      </button>
      {info ? (
        <div className="slide-up relative flex flex-col items-center gap-2">
          {info.os === "keypad" ? (
            <KeypadPhone info={info} game={game} minute={minute} onAct={onAct} busy={busy} onParents={onParents} />
          ) : (
            <SmartPhone info={info} game={game} minute={minute} onAct={onAct} busy={busy} onMaps={onMaps}
              onHousing={onHousing} onParents={onParents} onBet={onBet} run={run} />
          )}
          <p className="text-center text-xs font-bold text-white">
            {info.name}
            {info.cracked && " · cracked screen (fix it at Ojaja)"}
          </p>
        </div>
      ) : (
        <div className="slide-up relative max-w-xs rounded-3xl bg-white p-5 text-center">
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
    </div>
  );
}
