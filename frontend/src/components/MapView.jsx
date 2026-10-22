// The map, Lagos Life style: the real 3D campus seen from above, north up, with a white pin for every
// place. Drag to move, pinch or scroll to zoom, tap a pin to see how to get there. Places off the screen
// wait at the edge, pointing the way.
import { useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "../lib/sfx";
import { placeIcon } from "./Hud";

const GROUPS = [["all", "All"], ["class", "📚 Classes"], ["food", "🍲 Food"], ["home", "🛏 Halls"], ["money", "🏦 Money"],
  ["campus", "🏛 Campus"], ["town", "🏘 Ife town"]];
function groupOf(b) {
  if (b.kind === "lecture" || b.kind === "faculty") return "class";
  if (b.kind === "food") return "food";
  if (b.kind === "hall" || b.kind === "home") return "home";
  if (b.kind === "bank") return "money";
  return "campus";
}
const short = (name) => name.replace(/ \(.*\)/, "").replace("Faculty of ", "").replace("Your self-con", "Self-con").replace(" Seater LT", " Seater");

export default function MapView({ engine, world, game, onPick, onClose, playerPos, onFlat }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [note, setNote] = useState(null);
  const [compact, setCompact] = useState(false);
  const refs = useRef([]);
  const compactRef = useRef(false);
  const pins = useMemo(() => {
    const out = [];
    for (const [id, b] of Object.entries(world.buildings)) {
      if (b.kind === "home" && id !== game.home) continue;
      out.push({ id, name: id === game.home ? `Home · ${short(b.name)}` : short(b.name), icon: placeIcon(id, b), group: groupOf(b),
        at: [b.x, (b.h || 8) + 5, b.z], open: game.open[id], next: game.next_venue === id, here: game.at === id });
    }
    for (const a of world.town_areas || []) {
      out.push({ id: `town:${a.name}`, name: a.name, icon: "🏘", group: "town", at: [a.x, 14, a.z], open: true, town: a });
    }
    return out;
  }, [world, game.home, game.open, game.next_venue, game.at]);
  // picking a group (or searching) moves the map to those places
  const pick = (id) => {
    setFilter(id);
    const list = pins.filter((p) => id === "all" || p.group === id);
    if (!engine || !list.length) return;
    const cx = list.reduce((a, p) => a + p.at[0], 0) / list.length;
    const cz = list.reduce((a, p) => a + p.at[2], 0) / list.length;
    engine.mapCentre(cx, cz);
    if (id === "town" || id === "all") engine.mapZoom = 0.5;
  };
  const shown = pins.filter((p) => (filter === "all" || p.group === filter) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const you = useRef(null);
  useEffect(() => {
    if (q && shown.length && shown.length <= 4) {
      engine?.mapCentre(shown[0].at[0], shown[0].at[2]);
      if (engine && engine.mapZoom < 0.9) engine.mapZoom = 1;
    }
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const e = engine;
    if (!e) return undefined;
    e.setMapMode(true, playerPos);
    return () => e.setMapMode(false);
  }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  // move the pins every frame, straight on the DOM (no React re-render)
  useEffect(() => {
    const e = engine;
    if (!e) return undefined;
    e.onMapFrame = () => {
      const el = e.renderer.domElement;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const top = 128;
      const bottom = h - 120;
      const pts = e.project(shown.map((p) => p.at));
      pts.forEach((pt, i) => {
        const node = refs.current[i];
        if (!node) return;
        let { x, y } = pt;
        const off = !pt.on || x < 8 || x > w - 8 || y < top || y > bottom;
        if (off) {
          // pin it to the edge, in the direction of the place
          x = Math.max(28, Math.min(w - 28, x));
          y = Math.max(top + 18, Math.min(bottom - 18, y));
        }
        // off the screen, only the places that matter wait at the edge: your next class, home, a search result
        const p = shown[i];
        const keep = p.next || p.id === game.home || (q && shown.length <= 4);
        node.style.display = off && !keep ? "none" : "";
        node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        node.dataset.off = off ? "1" : "0";
      });
      if (you.current && playerPos) {
        const [pt] = e.project([[playerPos[0], 6, playerPos[1]]]);
        you.current.style.transform = `translate(${pt.x}px, ${pt.y}px) translate(-50%, -100%)`;
        you.current.style.opacity = pt.on ? 1 : 0;
      }
      const c = (e.mapZoom || 1) < 0.62;
      if (c !== compactRef.current) {
        compactRef.current = c;
        setCompact(c);
      }
    };
    return () => {
      if (e.onMapFrame) e.onMapFrame = null;
    };
  }, [engine, shown, playerPos, q, game.home]);

  const tap = (p) => {
    sfx("tap");
    if (p.town) {
      setNote(p.town);
      engine?.mapCentre(p.town.x, p.town.z);
      return;
    }
    onPick(p.id);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-label="Campus map">
      {/* pins */}
      <div className="absolute inset-0 overflow-hidden">
        {shown.map((p, i) => (
          <button key={p.id} ref={(n) => (refs.current[i] = n)} onClick={() => tap(p)}
            className={`map-pin pointer-events-auto absolute left-0 top-0 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 py-1 pl-1 shadow-lg ring-1 ring-black/5 ${
              compact ? "pr-1" : "pr-3"} ${p.next ? "ring-2 ring-go" : ""} ${p.open ? "" : "opacity-75"}`}
            aria-label={`${p.name}${p.open ? "" : ", closed now"}${p.next ? ", your next class" : ""}`}>
            <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-chip text-lg">{p.icon}</span>
            {!compact && <span className="text-[0.92rem] font-bold text-ink">{p.name}</span>}
            {!p.open && !compact && <span aria-hidden className="text-xs">🔒</span>}
          </button>
        ))}
        {playerPos && (
          <div ref={you} className="absolute left-0 top-0 flex flex-col items-center" aria-hidden>
            <span className="rounded-full bg-[#d64535] px-2 py-0.5 text-[11px] font-black text-white shadow">YOU</span>
            <span className="mt-0.5 h-3 w-3 rounded-full bg-[#d64535] ring-2 ring-white" />
          </div>
        )}
      </div>

      {/* search and filters, under the clock and wallet */}
      <div className="pointer-events-auto absolute inset-x-0 top-[max(3.6rem,calc(env(safe-area-inset-top)+3.1rem))] mx-auto max-w-xl px-3">
        <div className="flex gap-2">
          <input value={q} onChange={(e) => {
              setQ(e.target.value);
              setFilter("all");
              setNote(null);
            }} placeholder="Search a place" aria-label="Search a place"
            className="float min-w-0 flex-1 rounded-full px-4 py-2.5 text-sm outline-none" />
          <button className="float grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg" aria-label="Close map" onClick={onClose}>×</button>
        </div>
        <div className="chip-row mt-2 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Show">
          {GROUPS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={filter === id} onClick={() => pick(id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold shadow ${filter === id ? "bg-ink text-white" : "bg-white/95"}`}>{label}</button>
          ))}
        </div>
      </div>

      {/* zoom and find me */}
      <div className="pointer-events-auto absolute bottom-[8.5rem] right-3 flex flex-col gap-2">
        <button className="float grid h-11 w-11 place-items-center rounded-full text-xl font-bold" aria-label="Zoom in" onClick={() => engine?.zoomMap(1.35)}>+</button>
        <button className="float grid h-11 w-11 place-items-center rounded-full text-xl font-bold" aria-label="Zoom out" onClick={() => engine?.zoomMap(1 / 1.35)}>−</button>
        {onFlat && (
          <button className="float grid h-11 w-11 place-items-center rounded-full text-[11px] font-black" aria-label="Flat map" onClick={onFlat}>2D</button>
        )}
        <button className="float grid h-11 w-11 place-items-center rounded-full text-lg" aria-label="Show where you are"
          onClick={() => playerPos && engine?.mapCentre(playerPos[0], playerPos[1])}>📍</button>
      </div>

      {note && (
        <div className="pointer-events-auto absolute inset-x-3 bottom-[8.5rem] mx-auto max-w-md rounded-2xl bg-white p-3.5 pr-10 shadow-xl">
          <button className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-chip" aria-label="Close" onClick={() => setNote(null)}>×</button>
          <p className="font-bold">🏘 {note.name}</p>
          <p className="text-sm text-muted">{note.blurb} Students rent here; take the town bus or a keke from the Main Gate.</p>
        </div>
      )}
    </div>
  );
}
