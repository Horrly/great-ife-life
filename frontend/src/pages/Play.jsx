import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AccountForm from "../components/AccountForm";
import { EventDialog, ResultSlip, Sheet } from "../components/Dialogs";
import {
  ActionList, Joystick, JourneyBar, Panel, RoundButton, TimeLapse, Timetable, Toasts, TodayPanel, TopBar, TravelPanel,
} from "../components/Hud";
import { BadgesButton, Businesses, Skills } from "../components/Progress";
import Phone from "../components/Phone";
import { Needs } from "../components/Status";
import CampusEngine from "../game3d/Engine";
import { save } from "../lib/api";
import { clockText, naira } from "../lib/format";
import { loadWorld, useGame } from "../lib/game";

/** The game clock as the player sees it: the server's time plus real seconds since, 1 second = 1 minute. */
function useLiveClock(game, frozenUntil) {
  const [, setTick] = useState(0);
  const seenAt = useRef(new WeakMap());
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!game) return 0;
  if (!seenAt.current.has(game)) seenAt.current.set(game, game.receivedAt ?? performance.now());
  if (!game.ticking) return game.clock;
  const from = Math.max(seenAt.current.get(game), frozenUntil.current);
  const elapsed = Math.max(0, (performance.now() - from) / 1000);
  return game.clock + Math.min(Math.floor(elapsed * game.rate), game.idle_cap);
}

function animate(seconds, onFrame) {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - start) / (seconds * 1000));
      onFrame(p);
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

function SaveSheet({ onClose }) {
  const { account } = useGame();
  const [copied, setCopied] = useState(false);
  if (!account) {
    return (
      <Sheet title="Save your progress">
        <div className="mt-4">
          <AccountForm onDone={onClose} />
        </div>
        <button className="btn-ghost mt-3 w-full" onClick={onClose}>
          Not now
        </button>
      </Sheet>
    );
  }
  return (
    <Sheet title="Your game is saved">
      <p className="mt-2 text-muted">
        Every move is saved to <b className="text-ink">@{account.username}</b>. On another phone, open Great Ife Life and sign in to
        continue.
      </p>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-bold text-ife-600">Use a save code instead</summary>
        <p className="mt-2 text-muted">Keep it private: anyone with it can play this game.</p>
        <p className="mt-2 select-all break-all rounded-lg bg-concrete px-3 py-3 font-mono text-sm">{save.code}</p>
        <button
          className="btn-ghost mt-2 w-full"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(save.code);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy save code"}
        </button>
      </details>
      <button className="btn-primary mt-5 w-full" onClick={onClose}>
        Back to campus
      </button>
    </Sheet>
  );
}

function MePanel({ game, onClose, onSave, account, onTitle }) {
  return (
    <Panel title={game.name || "You"} subtitle={`${game.department.name}, ${game.level}`} onClose={onClose} tall label="Your stats">
      <div className="space-y-4">
        <section className="slab p-4">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-xs text-muted">Readiness</dt>
              <dd className="num text-3xl">{game.prep}%</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Attendance</dt>
              <dd className="num text-3xl">{game.attendance ?? "–"}{game.attendance !== null && "%"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">CGPA</dt>
              <dd className="num text-3xl">{game.cgpa?.toFixed(2) ?? "–"}</dd>
            </div>
          </dl>
          {game.upcoming.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              {game.upcoming.map((u) => (
                <li key={u} className="flex gap-2">
                  <span className="text-ife-600" aria-hidden>▸</span>
                  {u}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="slab p-4">
          <h3 className="font-bold">Timetable</h3>
          <p className="text-xs text-muted">Doors open an hour before. Come 20 minutes early for a front seat; more than 15 minutes late and you stand by the window; after 40 they shut.</p>
          <div className="mt-2">
            <Timetable game={game} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Courses: {game.courses.map((c) => c.code + (c.carry ? " (carryover)" : "")).join(", ")}
          </p>
        </section>
        <section className="slab p-4">
          <h3 className="font-bold">Who you are</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {game.traits.map((t) => (
              <li key={t.id} title={t.text} className="rounded-full bg-ife-50 px-2.5 py-1 text-xs font-bold text-ife-700">
                {t.emoji} {t.name}
              </li>
            ))}
          </ul>
          {game.dream && (
            <p className="mt-3 text-sm">
              <b>Dream:</b> {game.dream.emoji} {game.dream.name}{" "}
              <span className={game.dream.done ? "font-bold text-ife-600" : "text-muted"}>
                {game.dream.done ? "· achieved!" : `· ${game.dream.note}`}
              </span>
            </p>
          )}
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-sm">
              <b>⭐ {game.rep.title}</b>
              <span className="text-xs text-muted">Campus Rep level {game.rep.level}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-line/70">
              <div className="h-full rounded-full bg-bulb" style={{ width: `${((game.rep.xp - game.rep.floor) / (game.rep.next - game.rep.floor)) * 100}%` }} />
            </div>
          </div>
        </section>
        <section className="slab p-4">
          <h3 className="font-bold">Your things</h3>
          <ul className="mt-2 space-y-1 text-sm">
            <li>📱 {game.phone_info ? `${game.phone_info.name}${game.phone_info.cracked ? " (cracked screen)" : ""}` : "No phone (buy one at Ojaja)"}</li>
            <li>🍚 Foodstuff for {game.pantry} meal{game.pantry === 1 ? "" : "s"}</li>
            {game.items.map((i) => (
              <li key={i.id}>{{ bike: "🚲", car: "🚗", clippers: "💈", cobbler_kit: "👞" }[i.id]} {i.name}</li>
            ))}
          </ul>
        </section>
        <Needs needs={game.needs} mood={game.mood} />
        <Skills skills={game.skills} />
        <Businesses businesses={game.businesses} income={game.business_income} />
        <BadgesButton badges={game.badges} />
        <section className="slab p-4">
          <h3 className="font-bold">Recently</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-muted">
            {game.log.slice(0, 8).map((line, i) => (
              <li key={i}>
                <span className="font-bold text-ink">{line.time}</span> {line.text}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">You've trekked {game.trekked_km} km around campus.</p>
        </section>
        <div className="flex gap-2 text-sm">
          <button className={`flex-1 py-2 ${account ? "btn-ghost" : "btn-bulb"}`} onClick={onSave}>
            {account ? `Saved to @${account.username}` : "Save progress"}
          </button>
          <button className="btn-ghost flex-1 py-2" onClick={onTitle}>
            Title screen
          </button>
        </div>
      </div>
    </Panel>
  );
}

export default function Play() {
  const { game, busy, error, setError, messages, setMessages, act, choose, next, travel, enter, leave, sync, plan, account } = useGame();
  const navigate = useNavigate();
  const host = useRef(null);
  const engine = useRef(null);
  const [world, setWorld] = useState(null);
  const [no3d, setNo3d] = useState(false);
  const [near, setNear] = useState(null);
  const [panel, setPanel] = useState(null); // "travel" | "phone" | "laptop" | "me" | "save"
  const [running, setRunning] = useState(false);
  const [travelTo, setTravelTo] = useState(null);
  const [hideInside, setHideInside] = useState(false);
  const [journey, setJourney] = useState(null);
  const [jp, setJp] = useState({ p: 0, seg: null });
  const [lapse, setLapse] = useState(null);
  const [lp, setLp] = useState(0);
  const frozenUntil = useRef(0);
  const clock = useLiveClock(game, frozenUntil);
  const minute = ((clock % 1440) + 1440) % 1440;

  useEffect(() => {
    if (game.phase === "graduated") navigate("/graduation", { replace: true });
  }, [game.phase, navigate]);

  useEffect(() => {
    // signs on buildings are drawn with the game's fonts, so wait for them first
    const fonts = document.fonts
      ? Promise.all([
        document.fonts.load('800 40px "Bricolage Grotesque Variable"'),
        document.fonts.load('700 40px "Figtree Variable"'),
      ]).catch(() => null)
      : Promise.resolve();
    Promise.all([loadWorld(), fonts]).then(([w]) => setWorld(w)).catch((e) => setError(e.message));
  }, [setError]);

  // Build the 3D campus once.
  useEffect(() => {
    if (!world || !host.current || engine.current) return undefined;
    try {
      engine.current = new CampusEngine(host.current, world, {
        look: game.look,
        pos: game.pos,
        onNearDoor: setNear,
        // only really old phones skip shadows: 2 GB of memory or 2 cores
        lowPower: !window.__campusHQ && ((navigator.deviceMemory || 4) <= 2 || (navigator.hardwareConcurrency || 4) <= 2),
      });
      engine.current.setInside(game.at, game.pos);
    } catch (err) {
      console.warn("3D not available", err);
      setNo3d(true);
    }
    return () => {
      engine.current?.dispose();
      engine.current = null;
    };
    // the engine is created once; later changes are pushed in below
  }, [world]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => engine.current?.setMinute(minute), [minute, world]);
  useEffect(() => {
    if (!journey) engine.current?.setInside(game.at, game.at ? null : game.pos);
    setHideInside(false);
  }, [game.at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => engine.current?.setLook(game.look), [game.look]);

  // Heartbeat every 15 seconds, plus right after midnight so the new day (or results) shows up.
  const playing = game.phase === "play" && !journey && !lapse;
  const pos = useCallback(() => (game.at ? null : engine.current?.playerPos() || null), [game.at]);
  useEffect(() => {
    if (!playing || !game.ticking) return undefined;
    // inside a building what you can do changes by the minute, so check in more often
    const every = game.at ? 5_000 : 12_000;
    const id = setInterval(() => document.visibilityState === "visible" && sync(pos()), every);
    const onVisible = () => document.visibilityState === "visible" && sync(pos());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [playing, game.ticking, game.at, sync, pos]);
  const day = Math.floor(clock / 1440);
  useEffect(() => {
    if (playing && day > Math.floor(game.clock / 1440)) sync(pos());
  }, [day]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!messages.length) return undefined;
    const id = setTimeout(() => setMessages([]), 6000);
    return () => clearTimeout(id);
  }, [messages, setMessages]);

  async function onAct(action) {
    const from = clock;
    const g = await act(action.id);
    setPanel((p) => (p === "phone" || p === "laptop" ? null : p));
    if (!g) return;
    const seconds = 2.5;
    frozenUntil.current = performance.now() + seconds * 1000;
    setLapse({ label: action.label, from, to: g.clock });
    await animate(g.clock - from > 20 ? seconds : 0.8, setLp);
    setLapse(null);
  }

  async function onGo(to, option) {
    const from = clock;
    const g = await travel(to, option.mode, pos());
    if (!g?.last_trip) return;
    setPanel(null);
    setTravelTo(null);
    const seconds = Math.min(25, Math.max(4, option.minutes / 3));
    frozenUntil.current = performance.now() + seconds * 1000;
    const trip = { ...g.last_trip, toName: world.buildings[to].name, depart: from, arrive: g.clock };
    setJourney(trip);
    setJp({ p: 0, seg: trip.segments[0] });
    const done = () => {
      setJourney(null);
      if (g.at) engine.current?.setInside(g.at, g.pos);
      else engine.current?.stepOut(to); // closed: you wait by the door
    };
    if (!engine.current) {
      await animate(Math.min(seconds, 4), (p) => setJp({ p, seg: null }));
      done();
      return;
    }
    let last = 0;
    engine.current.playJourney(g.last_trip, seconds, {
      onProgress: (p, seg) => {
        const now = performance.now();
        if (now - last > 90 || p >= 1) {
          last = now;
          setJp({ p, seg });
        }
      },
      onDone: done,
    });
  }

  async function onEnter() {
    if (!near) return;
    await enter(near.id, engine.current?.playerPos());
  }

  async function onLeave() {
    const was = game.at;
    const g = await leave();
    if (g) engine.current?.stepOut(was);
  }

  const inside = game.at && !journey;
  // during a journey or a time-lapse, the clock on top runs fast with it
  const shownMinute = journey
    ? (journey.depart + (journey.arrive - journey.depart) * jp.p) % 1440
    : lapse
      ? (lapse.from + (lapse.to - lapse.from) * lp) % 1440
      : minute;
  const building = inside && world ? world.buildings[game.at] : null;
  const showGame = { ...game, minute };
  const overlayOpen = game.phase !== "play" || lapse || journey;

  return (
    <div className="fixed inset-0 overflow-hidden bg-ife-900 select-none">
      <div ref={host} className="absolute inset-0" aria-label="The Great Ife campus" role="img" />
      {(!world || no3d) && (
        <div className="absolute inset-0 grid place-items-center bg-[#7ea551] p-6 text-center text-white">
          <p className="max-w-xs font-bold" role="status">
            {no3d ? "Your phone can't show the 3D campus, but you can still play: use the map to get around." : "Loading campus…"}
          </p>
        </div>
      )}

      <TopBar game={game} minute={shownMinute} onOpenMe={() => setPanel("me")}
        buttons={!journey && !lapse && game.phase === "play" && !panel}
        onMap={() => {
          setTravelTo(null);
          setPanel("travel");
        }}
        onToday={() => setPanel("today")} />
      <Toasts messages={messages} error={error} onDismiss={() => setError("")} />

      {/* Outside: walk, go in, open the map */}
      {!inside && !journey && game.phase === "play" && (
        <>
          {!no3d && <Joystick onMove={(x, y) => engine.current?.setJoystick(x, y)} />}
          {!no3d && (
            <button
              className={`pointer-events-auto absolute bottom-40 left-9 z-10 rounded-full px-4 py-2 text-sm font-black shadow-lg sm:bottom-40 ${running ? "bg-bulb text-ink" : "bg-ink/60 text-white"}`}
              aria-pressed={running}
              onClick={() => {
                engine.current?.setRun(!running);
                setRunning(!running);
              }}
            >
              🏃 {running ? "Running" : "Run"}
            </button>
          )}
          <div className="pointer-events-none absolute bottom-5 right-4 z-10 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6">
            <RoundButton icon={game.phone_info ? "📱" : "📵"} label="Phone" onClick={() => setPanel("phone")} />
            <RoundButton icon="🎒" label="Me" onClick={() => setPanel("me")} />
          </div>
          {near && (
            <button
              className="btn-bulb pointer-events-auto absolute bottom-40 left-1/2 z-10 -translate-x-1/2 px-6 py-3.5 text-lg shadow-xl sm:bottom-10"
              onClick={onEnter}
              disabled={busy}
            >
              Enter {near.name}
              {!game.open[near.id] && <span className="text-sm font-normal"> (closed)</span>}
            </button>
          )}
          {!near && !panel && (
            <p className="pointer-events-none absolute bottom-56 left-4 right-24 z-0 mx-auto w-fit rounded-full bg-ink/55 px-3 py-1 text-center text-xs font-bold text-white sm:bottom-8">
              Tap the ground to walk there · yellow rings are doors
            </p>
          )}
        </>
      )}

      {/* Inside a building: what you can do here */}
      {building && game.phase === "play" && !lapse && !panel && (
        hideInside ? (
          <button className="btn-primary pointer-events-auto absolute bottom-5 left-1/2 z-20 -translate-x-1/2 shadow-xl" onClick={() => setHideInside(false)}>
            Back to {building.name}
          </button>
        ) : (
          <Panel
            title={building.name}
            subtitle={building.hours ? `Open ${clockText(building.hours[0])} to ${clockText(building.hours[1])}` : game.at === game.home ? "Home" : "Open all day"}
            label={building.name}
          >
            <ActionList actions={game.actions} onAct={onAct} busy={busy} />
            <div className={`sticky bottom-0 -mx-4 mt-3 grid ${game.has_laptop ? "grid-cols-5" : "grid-cols-4"} gap-1.5 border-t border-line bg-slab px-4 pt-3`}>
              <button className="btn-primary px-2 text-sm" onClick={onLeave} disabled={busy}>
                Go outside
              </button>
              <button className="btn-ghost px-2 text-sm" onClick={() => setPanel("travel")}>
                🗺 Map
              </button>
              <button className="btn-ghost px-2 text-sm" onClick={() => setPanel("phone")}>
                📱 Phone
              </button>
              {game.has_laptop && (
                <button className="btn-ghost px-2 text-sm" onClick={() => setPanel("laptop")}>
                  💻 Laptop
                </button>
              )}
              <button className="btn-ghost px-2 text-sm" onClick={() => setPanel("me")}>
                🎒 Me
              </button>
            </div>
            <button className="mt-2 w-full text-xs font-bold text-muted underline" onClick={() => setHideInside(true)}>
              Hide this to look at the campus
            </button>
          </Panel>
        )
      )}

      {panel === "travel" && world && !overlayOpen && (
        <TravelPanel world={world} game={showGame} onPlan={(to) => plan(to, pos())} onGo={onGo} busy={busy}
          onClose={() => setPanel(null)} playerPos={game.at ? world.nodes[world.buildings[game.at].node] : engine.current?.playerPos() || game.pos}
          initial={travelTo} />
      )}
      {panel === "phone" && !overlayOpen && (
        <Phone game={game} minute={minute} onAct={onAct} busy={busy} onClose={() => setPanel(null)}
          onMaps={() => setPanel("travel")}
          onMarket={() => {
            setTravelTo("market");
            setPanel("travel");
          }} />
      )}
      {panel === "today" && !overlayOpen && <TodayPanel game={game} onClose={() => setPanel(null)} />}
      {panel === "laptop" && !overlayOpen && (
        <Panel title="Your laptop" subtitle="Code, design and take gigs from here" onClose={() => setPanel(null)} tall label="Laptop">
          <div className="mb-3 rounded-lg bg-[#1e1e2e] p-3 font-mono text-xs text-[#a6e3a1]">
            <p>
              <span className="text-[#89b4fa]">~/great-ife</span> $ coding --level {game.skills.find((s) => s.id === "coding")?.level}
            </p>
            <p className="text-[#cdd6f4]">Keep practising: every level up pays more and unlocks bigger gigs.</p>
          </div>
          <ActionList actions={game.laptop} onAct={onAct} busy={busy} />
        </Panel>
      )}
      {panel === "me" && !overlayOpen && (
        <MePanel game={game} account={account} onClose={() => setPanel(null)} onSave={() => setPanel("save")} onTitle={() => navigate("/")} />
      )}
      {panel === "save" && <SaveSheet onClose={() => setPanel(null)} />}

      {journey && <JourneyBar journey={journey} progress={jp.p} segment={jp.seg} onSkip={() => engine.current?.endJourney(true)} />}
      {lapse && <TimeLapse lapse={lapse} progress={lp} />}

      {!journey && !lapse && game.phase === "event" && game.pending && <EventDialog event={game.pending} onChoose={choose} busy={busy} />}
      {!journey && !lapse && game.phase === "results" && game.last_result && (
        <ResultSlip
          result={game.last_result}
          onNext={next}
          busy={busy}
          nextLabel={game.graduates_next ? "Go to graduation" : "Start next semester"}
          onSave={account ? null : () => setPanel("save")}
        />
      )}
    </div>
  );
}
