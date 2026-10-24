// Inside a place: a sheet with the place's buttons, a chat line for everyone here, station chips,
// and the action cards for the station you picked.
import { useEffect, useMemo, useState } from "react";
import { useGame } from "../lib/game";
import { sfx } from "../lib/sfx";
import { MoneyHere } from "./Banking";
import { RoomCard } from "./Home";
import { ActionCards, STATIONS } from "./Hud";
import { BottomSheet } from "./ui";

function PlaceChat({ building, here }) {
  const { chat } = useGame();
  const thread = `place:${building}`;
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    const load = () => chat.messages(thread).then((r) => live && setMsgs(r.messages)).catch(() => {});
    load();
    const id = setInterval(load, 6000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [chat, thread]);
  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setErr("");
    try {
      const r = await chat.send(thread, text);
      setMsgs(r.messages);
      setText("");
      sfx("tap");
    } catch (ex) {
      setErr(ex.message);
    }
  }
  return (
    <div className="mb-3">
      {msgs.length > 0 && (
        <ul className="mb-2 space-y-1">
          {msgs.slice(-3).map((m) => (
            <li key={m.id} className="truncate text-sm"><b className={m.you ? "text-ife-700" : ""}>{m.you ? "You" : m.by}:</b> {m.text}</li>
          ))}
        </ul>
      )}
      <form onSubmit={send} className="flex gap-1.5">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} aria-label="Say something to people here"
          placeholder={here > 1 ? `Say something to the ${here - 1} other${here > 2 ? "s" : ""} here…` : "Say something to people here…"}
          className="min-w-0 flex-1 rounded-full bg-chip px-4 py-2.5 text-sm outline-none" />
        <button className="grid h-10 w-10 place-items-center rounded-full bg-go text-white" aria-label="Send" disabled={!text.trim()}>➤</button>
      </form>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  );
}

export default function PlacePanel({ game, building, atHome, title, sub, onAct, run, busy, onClose, onLeave, onMap, onHome, onHide, onLaptop,
  postNote, initialStation, hall, setHall, receipt }) {
  const money = game.banking.branch || game.banking.atm || game.banking.pos;
  const stations = useMemo(() => {
    const order = ["class", "room", "money", "study", "food", "care", "rest", "fun", "hustle", "shop"];
    const have = new Set(game.actions.map((a) => a.station || "fun"));
    if (atHome && game.room) have.add("room");
    if (money) have.add("money");
    return order.filter((s) => have.has(s));
  }, [game.actions, atHome, game.room, money]);
  const best = game.test ? "class" : game.at === "banks" ? "money" : stations.find((s) => game.actions.some((a) => (a.station || "fun") === s && a.enabled)) || stations[0];
  const [station, setStation] = useState(initialStation && stations.includes(initialStation) ? initialStation : best);
  useEffect(() => {
    if (!stations.includes(station)) setStation(best);
  }, [stations]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = game.actions.filter((a) => (a.station || "fun") === station);
  const Btn = ({ icon, label, onClick }) => (
    <button onClick={onClick} disabled={busy} aria-label={label} title={label}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-chip text-lg disabled:opacity-50">{icon}</button>
  );
  return (
    <BottomSheet onClose={onClose} label={title} height="64%"
      header={
        <div>
          <span className="display block truncate text-[1.45rem] text-ife-900">{title}</span>
          <span className="block truncate text-sm text-muted">{sub}</span>
          <div className="mt-2 flex items-center gap-2">
            <Btn icon="🚪" label="Go outside" onClick={onLeave} />
            <Btn icon="🗺" label="Map" onClick={onMap} />
            {!atHome && <Btn icon="🏠" label="Go home" onClick={onHome} />}
            {game.has_laptop && <Btn icon="💻" label="Laptop" onClick={onLaptop} />}
            <Btn icon="👁" label={atHome ? "Look at your room" : "Look around"} onClick={onHide} />
            {receipt}
          </div>
        </div>
      }>
      <PlaceChat building={building} here={game.here_count} />
      <div className="chip-row -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4" role="tablist" aria-label="Stations">
        {stations.map((s) => (
          <button key={s} role="tab" aria-selected={station === s} onClick={() => {
            sfx("tap");
            setStation(s);
          }}
            className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold ${station === s ? "bg-ink text-white" : "bg-chip"}`}>
            {STATIONS[s][0]} {STATIONS[s][1]}
          </button>
        ))}
      </div>
      {station === "room" ? <RoomCard room={game.room} onNote={postNote} /> : station === "money" ? <MoneyHere game={game} run={run} hall={hall} setHall={setHall} /> : (
        <>
          {/* sort what you can cook first, so the meals your foodstuff allows are on top */}
          <ActionCards actions={station === "food" ? [...list].sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0)) : list} onAct={onAct} busy={busy} />
          {station === "food" && atHome && (
            <div className="mt-3 rounded-2xl bg-slab p-3">
              <p className="text-sm font-bold">🧺 In your room</p>
              {game.food?.length ? (
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {game.food.map((f) => (
                    <li key={f.id} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold shadow-sm">{f.name} ×{f.count}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted">No foodstuff yet. Buy rice, beans, garri, yam, eggs and more at Ojaja market, then cook anything you have the ingredients for.</p>
              )}
            </div>
          )}
        </>
      )}
    </BottomSheet>
  );
}
