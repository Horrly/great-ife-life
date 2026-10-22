// "Gist": chat with real students. Your room, your department, and one-to-one chats started from a
// matric number. Numbers, links and handles are hidden by the server, and anyone can be blocked or reported.
import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../lib/game";

// Pidgin quick replies, one tap to send
const QUICK = ["How far? 👋🏾", "I dey o 😄", "Wetin dey happen?", "Where you dey?", "You don chop? 🍲", "See you for class 📚", "LOL 😂"];

function ago(at) {
  const s = Math.max(0, Date.now() / 1000 - at);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function ThreadList({ onOpen }) {
  const { chat } = useGame();
  const [data, setData] = useState(null);
  const [matric, setMatric] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(() => chat.threads().then(setData).catch((e) => setErr(e.message)), [chat]);
  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);
  async function startDm(e) {
    e.preventDefault();
    setErr("");
    try {
      const res = await chat.dm({ matric });
      onOpen(res.thread.id);
    } catch (ex) {
      setErr(ex.message);
    }
  }
  return (
    <div className="space-y-2.5 p-3 text-white">
      <p className="rounded-xl bg-black/25 px-3 py-2 text-xs">
        Be kind. Phone numbers, links and handles are hidden, so keep it on campus. Report anything that makes you uncomfortable.
      </p>
      {data && <p className="text-xs opacity-85">Your matric number: <b className="num">{data.matric}</b></p>}
      <ul className="space-y-1.5">
        {(data?.threads || []).map((t) => (
          <li key={t.id}>
            <button onClick={() => onOpen(t.id)} className="flex w-full items-center gap-2 rounded-xl bg-white/95 px-3 py-2.5 text-left text-ink shadow">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{t.title}</span>
                <span className="block truncate text-xs text-muted">
                  {t.last ? `${t.last.you ? "You" : t.last.by}: ${t.last.text}` : t.subtitle}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {t.last && <span className="text-[10px] text-muted">{ago(t.last.at)}</span>}
                {t.unread > 0 && <span className="rounded-full bg-[#25a35a] px-1.5 text-[11px] font-black text-white">{t.unread}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={startDm} className="rounded-xl bg-white/95 p-2.5 text-ink">
        <label className="text-xs font-bold" htmlFor="dm-matric">Message a student by matric number</label>
        <div className="mt-1 flex gap-1.5">
          <input id="dm-matric" value={matric} onChange={(e) => setMatric(e.target.value)} placeholder="CSC/2026/0042"
            className="num min-w-0 flex-1 rounded-lg border border-line px-2 py-1.5 text-sm" />
          <button className="rounded-lg bg-[#25a35a] px-3 text-sm font-bold text-white" disabled={!matric.trim()}>Chat</button>
        </div>
      </form>
      {err && <p className="rounded-lg bg-[#7a1f1f] px-3 py-1.5 text-sm" role="alert">{err}</p>}
    </div>
  );
}

export function Thread({ id, onBack, onOpen }) {
  const { chat, game } = useGame();
  const [info, setInfo] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [menu, setMenu] = useState(null);
  const last = useRef(0);
  const box = useRef(null);
  const merge = useCallback((res) => {
    setInfo(res.thread);
    if (res.messages.length) {
      setMsgs((old) => {
        const seen = new Set(old.map((m) => m.id));
        return [...old, ...res.messages.filter((m) => !seen.has(m.id))].slice(-150);
      });
      last.current = Math.max(last.current, ...res.messages.map((m) => m.id));
    }
  }, []);
  useEffect(() => {
    let live = true;
    const poll = () => chat.messages(id, last.current).then((r) => live && merge(r)).catch((e) => live && setErr(e.message));
    poll();
    const t = setInterval(poll, 3000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [id, chat, merge]);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [msgs.length]);
  async function send(e, share = false) {
    e?.preventDefault();
    setErr("");
    try {
      merge(await chat.send(id, text, last.current, share));
      if (!share) setText("");
    } catch (ex) {
      setErr(ex.message);
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 bg-[#0f5132] px-3 py-2 text-white">
        <button className="rounded-full bg-black/25 px-3 py-1 text-sm font-bold" onClick={onBack}>‹</button>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{info?.title || "…"}</span>
          <span className="block truncate text-[11px] opacity-80">{info?.subtitle}</span>
        </span>
        {info?.kind === "dm" && (
          <button className="rounded-full bg-black/25 px-2.5 py-1 text-xs font-bold"
            onClick={async () => {
              if (!window.confirm("Block this student? You won't see each other's messages.")) return;
              await chat.block(info.other).catch(() => {});
              onBack();
            }}>
            Block
          </button>
        )}
      </div>
      <div ref={box} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-[#e9e2d6] p-2.5">
        {info?.kind === "dm" && (
          <p className="mx-auto w-fit rounded-full bg-white/70 px-3 py-1 text-center text-[11px] text-muted">🔒 Private · only you and {info.title} can see this</p>
        )}
        {msgs.length === 0 && (
          <div className="mt-6 text-center">
            <p className="text-4xl" aria-hidden>👋🏾</p>
            <p className="mt-1 text-sm font-bold text-ink">Say hi{info?.kind === "dm" ? ` to ${info.title}` : ""}</p>
            <p className="text-xs text-muted">Tap a quick reply below or type your own.</p>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.you ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[82%] rounded-2xl px-3 py-1.5 text-sm shadow-sm ${m.you ? "rounded-br-sm bg-[#d4f7c5]" : "rounded-bl-sm bg-white"}`}>
              {!m.you && info?.kind !== "dm" && (
                <button className="block text-[11px] font-bold text-ife-700" onClick={() => setMenu(m)}>{m.by}</button>
              )}
              <span className="whitespace-pre-wrap break-words text-ink">{m.text}</span>
              <span className="mt-0.5 flex items-center justify-end gap-2 text-[10px] text-muted">
                {!m.you && <button className="underline" onClick={() => setMenu(m)} aria-label="Message options">⋯</button>}
                {ago(m.at)}
              </span>
            </div>
          </div>
        ))}
      </div>
      {menu && (
        <div className="space-y-1.5 bg-white p-2.5 text-sm text-ink shadow-inner">
          <p className="font-bold">{menu.by} <span className="num text-xs font-normal text-muted">{menu.matric}</span></p>
          <div className="grid grid-cols-3 gap-1.5">
            {info?.kind !== "dm" && (
              <button className="rounded-lg bg-[#25a35a] py-1.5 font-bold text-white"
                onClick={async () => {
                  try {
                    const res = await chat.dm({ game: menu.by_id });
                    setMenu(null);
                    onOpen(res.thread.id);
                  } catch (ex) {
                    setErr(ex.message);
                  }
                }}>
                Message
              </button>
            )}
            <button className="rounded-lg bg-line py-1.5 font-bold"
              onClick={async () => {
                await chat.report(menu.id).catch(() => {});
                setMenu(null);
                setErr("Reported. Thanks for keeping campus safe.");
              }}>
              Report
            </button>
            <button className="rounded-lg bg-line py-1.5 font-bold" onClick={() => setMenu(null)}>Close</button>
          </div>
        </div>
      )}
      {err && <p className="bg-ink px-3 py-1 text-xs text-white" role="status">{err}</p>}
      <div className="chip-row flex gap-1.5 overflow-x-auto bg-[#f4efe6] px-2 pt-2" aria-label="Quick replies">
        {QUICK.map((q) => (
          <button key={q} type="button" className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink shadow-sm"
            onClick={async () => {
              setErr("");
              try {
                merge(await chat.send(id, q, last.current, false));
              } catch (ex) {
                setErr(ex.message);
              }
            }}>{q}</button>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-1.5 bg-[#f4efe6] p-2">
        {game.bank && (
          <button type="button" title="Share your account number" aria-label="Share your account number"
            className="rounded-full bg-white px-2.5 text-lg shadow-sm" onClick={() => send(null, true)}>
            💳
          </button>
        )}
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Message"
          aria-label="Message" className="min-w-0 flex-1 rounded-full border border-line bg-white px-3 py-2 text-sm text-ink" />
        <button className="rounded-full bg-[#25a35a] px-4 text-sm font-bold text-white" disabled={!text.trim()}>Send</button>
      </form>
    </div>
  );
}

export default function ChatApp() {
  const [open, setOpen] = useState(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {open ? (
        <Thread key={open} id={open} onBack={() => setOpen(null)} onOpen={setOpen} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ThreadList onOpen={setOpen} />
        </div>
      )}
    </div>
  );
}
