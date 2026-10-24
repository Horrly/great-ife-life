import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AccountForm from "../components/AccountForm";
import { ResultSlip, Sheet } from "../components/Dialogs";
import {
  ActionCards, ActionChip, ambientFor, AvatarButton, Chevron, ClockPill, iconFor, InboxButton, Joystick, JourneyBar, MapSheet,
  MoreMenu, NavBar, NeedsCard, NeedsPill, NextClassPill, PhoneButton, PlaceCard, PlaceSheet, RoundIcon, StatusDrawer, WalletPill,
} from "../components/Hud";
import Phone from "../components/Phone";
import MapView from "../components/MapView";
import { DmSheet, PersonSheet } from "../components/Person";
import { Receipt, RiddleSheet, Spectacle } from "../components/Extras";
import { nameFor, randomLook } from "../game3d/look";
import PlacePanel from "../components/Place";
import MeSheet, { InboxSheet } from "../components/MeSheet";
import { HousingChooser, SleepOverlay } from "../components/Home";
import { BottomSheet, DecisionCard, Toast } from "../components/ui";
import { sfx } from "../lib/sfx";
import CampusEngine from "../game3d/Engine";
import { save } from "../lib/api";
import { clockText } from "../lib/format";
import { loadWorld, useGame } from "../lib/game";

/** The game clock is real Lagos time: the server's minute plus the real seconds since it answered. */
function useLiveClock(game) {
  const [, setTick] = useState(0);
  const seenAt = useRef(new WeakMap());
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!game) return 0;
  if (!seenAt.current.has(game)) seenAt.current.set(game, game.receivedAt ?? performance.now());
  if (!game.ticking || !game.server_time) return game.clock;
  const intoMinute = (game.server_time + 3600) % 60; // seconds past the minute when the server answered
  const elapsed = Math.max(0, (performance.now() - seenAt.current.get(game)) / 1000);
  return game.clock + Math.floor((intoMinute + elapsed) / 60);
}

function animate(seconds, onFrame, stop) {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = () => {
      const p = stop?.current ? 1 : Math.min(1, (performance.now() - start) / (seconds * 1000));
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


// What each building looks like inside.
const INSIDE = { theatre: "lecture", faculty: "classroom", library: "library", buka: "buka", market: "market", sub: "sub",
  banks: "bank", clinic: "clinic", auditorium: "auditorium", amphitheatre: "amphi", sports: "sports", tower: "office" };
const BUSY = { lecture: 12, classroom: 7, library: 9, buka: 8, market: 7, sub: 6, bank: 5, clinic: 3, auditorium: 14, amphi: 8, sports: 8, office: 3, common: 6 };

/** Campus NPCs in a place: how many depends on the kind of place and the hour; the same people all hour. */
function npcsFor(id, type, minute) {
  const hour = Math.floor(minute / 60);
  let seed = [...`${id}${hour}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const open = hour >= 7 && hour < 22;
  const peak = (type === "buka" && (hour === 12 || hour === 13 || hour === 18)) || (type === "lecture" && hour >= 8 && hour < 16)
    || (type === "library" && hour >= 19);
  const n = Math.round((BUSY[type] || 4) * (open ? (peak ? 1 : 0.55) : 0.15) * (0.7 + rand() * 0.5));
  const ROLE = { lecture: "Student", classroom: "Student", library: "Reading for exams", buka: "Eating", market: "Shopping",
    bank: "Queueing at the bank", clinic: "Waiting to see the nurse", sports: "Playing ball", amphi: "Watching the show" };
  return Array.from({ length: n }, () => {
    const look = randomLook(rand);
    return { kind: "npc", name: nameFor(look, rand), look, role: ROLE[type] || "Student" };
  });
}

const SEEN_KEY = "gil.inboxSeen";
function useInbox(log) {
  const key = (l) => (l ? `${l.day}|${l.time}|${l.text}` : "");
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) || "";
    } catch {
      return "";
    }
  });
  const idx = log.findIndex((l) => key(l) === seen);
  const count = idx === -1 ? Math.min(log.length, 10) : idx;
  const markSeen = () => {
    const k = key(log[0]);
    setSeen(k);
    try {
      localStorage.setItem(SEEN_KEY, k);
    } catch {
      /* private mode */
    }
  };
  return [count, markSeen];
}

export default function Play() {
  const { game, busy, error, setError, messages, setMessages, act, choose, next, travel, enter, leave, sync, plan, account,
    askParents, bet, moveHome, joinRoom, housing, postNote, social, chat, transferTo, riddleSearch, skip } = useGame();
  const navigate = useNavigate();
  const host = useRef(null);
  const engine = useRef(null);
  const [world, setWorld] = useState(null);
  const [no3d, setNo3d] = useState(false);
  // the flat map is the default on slow or data-saver connections; players can switch either way
  const [flatMap, setFlatMapState] = useState(() => {
    try {
      const saved = localStorage.getItem("gil.flatmap");
      if (saved) return saved === "1";
    } catch {
      /* storage blocked: fall through */
    }
    const c = navigator.connection;
    return Boolean(c && (c.saveData || /(^|-)2g/.test(c.effectiveType || "")));
  });
  const setFlatMap = (on) => {
    setFlatMapState(on);
    try {
      localStorage.setItem("gil.flatmap", on ? "1" : "0");
    } catch {
      /* fine: it just won't be remembered */
    }
  };
  const [near, setNear] = useState(null);
  // one sheet at a time: "place" | "map" | "to" | "phone" | "me" | "inbox" | "laptop" | "housing" | "save"
  const [panel, setPanel] = useState(null);
  const [meTab, setMeTab] = useState("profile");
  const [travelTo, setTravelTo] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [clean, setClean] = useState(false);
  const [running, setRunning] = useState(false);
  const [lookAround, setLookAround] = useState(false);
  const [journey, setJourney] = useState(null);
  const [person, setPerson] = useState(null);
  const [dm, setDm] = useState(null);
  // what you've bought at this place on this visit (a till slip)
  const [tab, setTab] = useState({ at: null, items: [] });
  // A need falling under 20% gets one warning; it can warn again once it has been back above 40%.
  const warned = useRef({});
  useEffect(() => {
    if (!game?.needs) return;
    const LOW = { hunger: "You're getting hungry. Find food soon 🍲", energy: "You're running on empty. Rest soon 😴",
      hygiene: "You need a bath 🪣", fun: "You're bored stiff. Do something fun 🎉", social: "You've been alone too long. Gist with someone 💬" };
    const out = [];
    for (const [k, v] of Object.entries(game.needs)) {
      if (v < 20 && !warned.current[k] && LOW[k]) {
        warned.current[k] = true;
        out.push(LOW[k]);
      } else if (v > 40) warned.current[k] = false;
    }
    if (out.length) {
      setMessages((m) => [...(m || []), ...out]);
      navigator.vibrate?.([60, 80, 60]);
    }
  }, [game?.needs]); // eslint-disable-line react-hooks/exhaustive-deps
  const [jp, setJp] = useState({ p: 0, seg: null });
  const [lapse, setLapse] = useState(null);
  const stopLapse = useRef(false);
  const [lp, setLp] = useState(0);
  const [hint, setHint] = useState(true);
  const [placeStation, setPlaceStation] = useState(null);
  const [bankHall, setBankHall] = useState(null);
  const roomTap = useRef(() => {});
  const personTap = useRef(() => {});
  const clock = useLiveClock(game);
  const minute = ((clock % 1440) + 1440) % 1440;
  const [inboxCount, markInboxSeen] = useInbox(game.log);

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
        onRoomTap: (station) => roomTap.current(station),
        onPersonTap: (who) => personTap.current(who),
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
    setLookAround(false);
    if (!game.at && panel === "place") setPanel(null);
  }, [game.at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => engine.current?.setLook(game.look), [game.look]);
  useEffect(() => {
    sync(game.at ? null : game.pos);
    const id = setTimeout(() => setHint(false), 15000);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Heartbeat, plus right after midnight so the new day (or results) shows up.
  const playing = game.phase === "play" && !journey && !lapse;
  const pos = useCallback(() => (game.at ? null : engine.current?.playerPos() || null), [game.at]);
  useEffect(() => {
    if (!playing || !game.ticking) return undefined;
    const every = game.asleep ? 60_000 : game.at ? 15_000 : 25_000;
    const id = setInterval(() => document.visibilityState === "visible" && sync(pos()), every);
    const onVisible = () => document.visibilityState === "visible" && sync(pos());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [playing, game.ticking, game.at, game.asleep, sync, pos]);
  const day = Math.floor(clock / 1440);
  useEffect(() => {
    if (playing && day > Math.floor(game.clock / 1440)) sync(pos());
  }, [day]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Actions play out in a few real seconds as a ring chip at the top; you can keep looking around. */
  async function playback(label, g, icon, station, actionId) {
    if (!g?.playback) return;
    stopLapse.current = false;
    setLapse({ label, icon });
    engine.current?.roomActivity(station || null, icon, actionId);
    await animate(g.playback, setLp, stopLapse);
    setLapse(null);
    engine.current?.roomActivity(null);
  }
  // "× tap to skip": stop watching; the server lets you move on, and the result stays the same
  function skipLapse() {
    if (stopLapse.current) return;
    stopLapse.current = true;
    sfx("tap");
    skip();
  }
  function skipJourney() {
    sfx("tap");
    skip();
    engine.current?.endJourney(true);
  }

  async function onSocial(who, kind) {
    const g = await social(kind, who.name, who.kind === "player" ? who.id : undefined, who.role);
    if (!g) return;
    setPanel(null);
    await playback({ hello: "Saying hello", gist: `Gisting with ${who.name}`, joke: "Cracking a joke", shade: "Throwing shade",
      hype: `Hyping up ${who.name}`, life: `Talking about life with ${who.name}`, hang: `Hanging out with ${who.name}`,
      borrow: `Asking ${who.name} for small money` }[kind],
      g, { hello: "👋🏾", gist: "💬", joke: "😂", shade: "😒", hype: "🙌🏾", life: "🫶🏾", hang: "🚶🏾", borrow: "🙏🏾" }[kind], "fun");
  }

  async function onChatWith(who) {
    try {
      const res = await chat.dm({ game: who.id });
      setDm({ thread: res.thread.id, name: who.name });
      setPanel("dm");
    } catch (e) {
      setError(e.message);
    }
  }

  async function onSendTo(who, amount, note) {
    const g = await transferTo(who.id, amount, note);
    return Boolean(g);
  }

  async function onRiddleSearch() {
    const g = await riddleSearch();
    if (g) {
      setPanel(null);
      await playback("Searching…", g, "🔎");
    }
  }

  async function onAct(action) {
    const g = await act(action.id);
    if (g && action.cost > 0 && action.at !== "phone" && action.at !== "laptop") {
      setTab((t) => ({ at: g.at, items: [...(t.at === g.at ? t.items : []), { label: action.label.split(" (")[0], cost: action.cost }] }));
    }
    setPanel((p) => (p === "phone" || p === "laptop" ? null : p));
    if (!g || action.id === "sleep" || action.id === "wake") return;
    await playback(action.label, g, iconFor(action), action.station, action.id);
  }

  async function onParents(amount) {
    const g = await askParents(amount);
    setPanel(null);
    await playback("Calling Mummy", g, "📞");
  }

  async function onBet(match, pick, stake, adult) {
    const g = await bet(match, pick, stake, adult);
    if (g) await playback("The match is on…", g, "⚽");
  }

  /** Bank, ATM and POS moves: wait for the server, then play the few seconds it takes. */
  async function runMove(promise, label) {
    const g = await promise;
    if (g) await playback(label, g, "🏦", "money");
    return g;
  }

  async function onMoveHome(body) {
    const g = await (body.code ? joinRoom(body.code) : moveHome(body));
    if (g) setPanel(null);
  }

  function goTo(id) {
    if (!id) return;
    setTravelTo(id);
    setPanel("to");
  }

  async function onGo(to, option) {
    const fromName = game.at ? (game.at === game.home ? "Home" : world.buildings[game.at].name) : "Here";
    const g = await travel(to, option.mode, pos());
    if (!g?.last_trip) return;
    setPanel(null);
    setTravelTo(null);
    const seconds = g.playback || option.seconds || 6;
    const trip = { ...g.last_trip, mode: option.mode, fromName, toName: to === game.home ? "Home" : world.buildings[to].name };
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
        const t = performance.now();
        if (t - last > 90 || p >= 1) {
          last = t;
          setJp({ p, seg });
        }
      },
      onDone: done,
    });
  }

  async function onEnter() {
    if (!near) return;
    sfx("open");
    await enter(near.id, engine.current?.playerPos());
  }

  async function onLeave() {
    const was = game.at;
    setPanel(null);
    const g = await leave();
    if (g) engine.current?.stepOut(was);
  }

  const inside = game.at && !journey;
  const building = inside && world ? world.buildings[game.at] : null;
  const atHome = inside && game.at === game.home;
  const classTarget = game.test?.at || game.next_venue || game.faculty;

  // your own room is drawn in 3D, with your roommates in it
  const roomKey = JSON.stringify(game.room?.people?.map((p) => [p.id, p.where]) ?? null);
  const noLight = game.moodlets?.some((m) => m.id === "no_light");
  const hour = Math.floor(minute / 60);
  const hereKey = JSON.stringify(game.here_people?.map((p) => p.id) ?? []);
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    if (atHome && game.room && !lookAround) e.showRoom({ ...game.room, kind: game.housing.kind }, noLight);
    else if (inside && building && !lookAround && !journey) {
      const type = INSIDE[building.style] || "common";
      e.showPlace({
        type, name: building.name, hall: game.at === "banks" ? bankHall : null, banks: world?.banks,
        people: [{ kind: "you", name: "You", look: game.look },
          ...(game.here_people || []).map((p) => ({ kind: "player", id: p.id, name: p.name, look: p.look, role: p.department ? `${p.department} student` : "" })),
          ...npcsFor(game.at, type, minute)],
      }, noLight);
    } else e.hideRoom();
  }, [atHome, roomKey, noLight, world, game.housing.kind, inside, game.at, lookAround, journey, hour, hereKey, bankHall]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (game.at !== "banks") setBankHall(null);
  }, [game.at]);
  // whoever you stopped to talk to walks on once the sheet closes and any gist has finished
  useEffect(() => {
    if (panel !== "person" && !lapse) engine.current?.releaseWalker();
  }, [panel, lapse]);
  // tapping someone walking about campus
  personTap.current = (who) => {
    if (!controls || busy || lapse) {
      engine.current?.releaseWalker();
      return;
    }
    sfx("open");
    setPerson(who);
    setPanel("person");
  };
  // tapping things inside: open what you can do with them
  roomTap.current = (station) => {
    if (!controls || busy || lapse) return;
    sfx("open");
    if (station === "leave") onLeave();
    else if (station === "self") setPanel("self");
    else if (station.startsWith("person:")) {
      const who = engine.current?.personAt(station);
      if (who) {
        setPerson(who);
        setPanel("person");
      }
    } else {
      setPlaceStation(station);
      setPanel("place");
    }
  };
  const showGame = { ...game, minute };
  const overlayOpen = game.phase !== "play" || journey;
  const controls = game.phase === "play" && !journey && !game.asleep;
  const close = useCallback(() => setPanel(null), []);
  // a stable function: the place sheet asks the server for trip options once, not on every clock tick
  const planFrom = useCallback((to) => plan(to, pos()), [plan, pos]);
  const openMe = (tab = "profile") => {
    setMeTab(tab);
    setPanel("me");
    setDrawer(false);
  };

  // desktop shortcuts: M map, P phone, Y you, F people, ? help, I inbox, H home, C class
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, select") || e.metaKey || e.ctrlKey || !controls) return;
      const k = e.key.toLowerCase();
      if (k === "?" || (k === "/" && e.shiftKey)) setPanel((p) => (p === "keys" ? null : "keys"));
      else if (k === "f") openMe("people");
      else if (k === "m") setPanel((p) => (p === "map" ? null : "map"));
      else if (k === "p") setPanel((p) => (p === "phone" ? null : "phone"));
      else if (k === "y") openMe(); // not S: S walks backwards
      else if (k === "i") setPanel("inbox");
      else if (k === "h") goTo(game.home);
      else if (k === "c") goTo(classTarget);
      else return;
      sfx("tap");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const navItems = [
    { id: "home", label: "Home", icon: "🏠", active: atHome && panel !== "map", onClick: () => (atHome ? setPanel("place") : goTo(game.home)) },
    { id: "class", label: game.test ? "Test" : "Class", icon: game.test ? "✍️" : "📚", active: inside && game.at === classTarget && panel !== "map",
      onClick: () => (inside && game.at === classTarget ? setPanel("place") : goTo(classTarget)) },
    { id: "map", label: "Map", icon: "🗺", active: panel === "map", onClick: () => setPanel((p) => (p === "map" ? null : "map")) },
  ];
  const more = [
    ...(game.has_laptop ? [{ icon: "💻", label: "Open your laptop", onClick: () => setPanel("laptop") }] : []),
    { icon: "🎯", label: "Today's missions", onClick: () => openMe("goals") },
    { icon: "🏠", label: "Houses (move or invite)", onClick: () => setPanel("housing") },
    ...(!inside ? [{ icon: running ? "🚶" : "🏃", label: running ? "Walk" : "Run", onClick: () => {
      engine.current?.setRun(!running);
      setRunning(!running);
    } }] : []),
    { icon: "🙈", label: "Hide buttons", onClick: () => setClean(true) },
  ];
  const placeTitle = atHome ? (game.room?.label || game.home_name) : building?.name;
  const placeSub = atHome
    ? `${game.housing.name}${game.room ? ` · ${game.room.people.length}/${game.room.capacity} roommates` : ""}`
    : game.at === "banks" ? "Banks 8 AM–4 PM weekdays · ATMs all day"
      : building ? ambientFor(building.kind, minute) : "";

  return (
    <div className="fixed inset-0 overflow-hidden bg-ife-900 select-none">
      <div ref={host} className="absolute inset-0" aria-label="The Great Ife campus" role="img" />
      {(!world || no3d) && (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,#1c4a33,#0a2c1d)] p-6 text-center text-white">
          <p className="max-w-xs font-bold" role="status">
            {no3d ? "Your phone can't show the 3D campus, but you can still play: use the map to get around." : "Loading Great Ife…"}
          </p>
        </div>
      )}

      {/* Top band: things you read */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-2">
          <ClockPill game={game} minute={minute} onClick={() => setDrawer((d) => !d)} />
          <Chevron open={drawer} onClick={() => {
            sfx("tap");
            setDrawer((d) => !d);
          }} />
          <WalletPill game={game} onClick={() => {
            setDrawer(false);
            setPanel("phone");
          }} />
        </div>
        {!clean && panel !== "map" && (
          <div className="mx-auto mt-2 flex max-w-5xl items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
              {lapse && <ActionChip lapse={lapse} progress={lp} onSkip={skipLapse} />}
              {controls && !lapse && (
                <div className="flex w-full min-w-0 items-center gap-2">
                  <RoundIcon icon="🎯" label="Today's missions" badge={game.missions.filter((m) => !m.done).length || null} onClick={() => openMe("goals")} />
                  <RoundIcon icon="🔎" label="Campus riddle" onClick={() => setPanel("riddle")} />
                  <NextClassPill game={game} onClick={() => goTo(classTarget)} />
                </div>
              )}
              {controls && <div className="hidden lg:block"><NeedsCard needs={game.needs} onClick={() => openMe("needs")} /></div>}
            </div>
            <InboxButton count={inboxCount} onClick={() => {
              markInboxSeen();
              setPanel("inbox");
            }} />
          </div>
        )}
      </div>
      {drawer && (
        <StatusDrawer game={game} minute={minute} onNeeds={() => openMe("needs")} onStudies={() => openMe("studies")}
          onBank={() => {
            setDrawer(false);
            setPanel("phone");
          }} />
      )}
      <Toast messages={journey || lapse ? [] : messages} error={error} onDismiss={() => setError("")} onDone={() => setMessages([])} top={clean ? "3.6rem" : "6.6rem"} />

      {/* Bottom band: things you press */}
      {controls && clean && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between p-3">
          <button className="float pointer-events-auto rounded-full px-4 py-2.5 text-sm font-semibold" onClick={() => setClean(false)}>☰ Show buttons</button>
          <div className="flex gap-2">
            <RoundIcon icon="🗺" label="Map" onClick={() => setPanel("map")} />
            <PhoneButton game={game} onClick={() => setPanel("phone")} />
          </div>
        </div>
      )}

      {controls && !clean && !inside && panel !== "map" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-5xl items-end justify-between gap-2">
            <div className="flex flex-col items-start gap-3">
              <div className="flex items-center gap-2">
                <AvatarButton game={game} onClick={() => openMe()} />
                <NeedsPill needs={game.needs} onClick={() => openMe("needs")} />
              </div>
              {!no3d && <Joystick onMove={(x, y) => {
                engine.current?.setJoystick(x, y);
                if (hint && (x || y)) setHint(false);
              }} />}
            </div>
            <div className="flex flex-col items-end gap-2">
              {near ? (
                <button className="pointer-events-auto rounded-full bg-go px-5 py-3 text-base font-bold text-white shadow-lg" onClick={onEnter} disabled={busy}>
                  🚪 Go inside {near.name}{!game.open[near.id] && <span className="text-sm font-normal"> (closed)</span>}
                </button>
              ) : (
                <button className="float pointer-events-auto rounded-full px-5 py-3 text-base font-semibold" onClick={() => setPanel("map")}>📍 Where to?</button>
              )}
              <div className="flex items-end gap-2">
                <MoreMenu items={more} />
                <PhoneButton game={game} onClick={() => setPanel("phone")} />
              </div>
            </div>
          </div>
          {hint && !near && (
            <p className="pointer-events-none mx-auto mt-2 w-fit rounded-full bg-ink/55 px-3 py-1 text-center text-xs font-semibold text-white">
              Drag the joystick or tap the ground to walk · yellow rings are doors
            </p>
          )}
        </div>
      )}

      {controls && !clean && inside && building && panel !== "place" && panel !== "map" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-[560px] flex-col gap-2">
            {!lookAround ? (
              <PlaceCard name={placeTitle} sub={placeSub} here={game.here_count} onOpen={() => setPanel("place")} />
            ) : (
              <button className="float pointer-events-auto self-center rounded-full px-5 py-2.5 text-sm font-semibold" onClick={() => setLookAround(false)}>
                ↩ Back to {atHome ? "your room" : building.name}
              </button>
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AvatarButton game={game} onClick={() => openMe()} />
                <NeedsPill needs={game.needs} onClick={() => openMe("needs")} />
              </div>
              <div className="flex items-center gap-2">
                <button className="float pointer-events-auto rounded-full px-4 py-2.5 text-sm font-semibold" onClick={onLeave} disabled={busy}>🚪 Go outside</button>
                <MoreMenu items={more} />
              </div>
            </div>
            <div className="flex items-end justify-between gap-2">
              <NavBar items={navItems} />
              <PhoneButton game={game} onClick={() => setPanel("phone")} />
            </div>
          </div>
        </div>
      )}

      {controls && panel === "map" && engine.current && !no3d && !flatMap && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-[560px] flex-col gap-2">
            <div className="flex items-center gap-2">
              <AvatarButton game={game} onClick={() => openMe()} />
              <NeedsPill needs={game.needs} onClick={() => openMe("needs")} />
            </div>
            <div className="flex items-end justify-between gap-2">
              <NavBar items={navItems} />
              <PhoneButton game={game} onClick={() => setPanel("phone")} />
            </div>
          </div>
        </div>
      )}

      {/* Sheets */}
      {panel === "place" && building && controls && (
        <PlacePanel key={placeStation || "place"} game={game} building={game.at} atHome={atHome} title={placeTitle} sub={placeSub} onAct={onAct} run={runMove}
          initialStation={placeStation} hall={bankHall} setHall={setBankHall}
          receipt={tab.at === game.at ? <Receipt items={tab.items} place={placeTitle} /> : null}
          busy={busy} onClose={() => {
            setPanel(null);
            setPlaceStation(null);
          }} onLeave={onLeave} onMap={() => setPanel("map")} onHome={() => goTo(game.home)}
          onHide={() => setPanel(null)}
          onLaptop={() => setPanel("laptop")} postNote={postNote} />
      )}
      {panel === "map" && world && !overlayOpen && (engine.current && !no3d && !flatMap ? (
        <MapView engine={engine.current} world={world} game={showGame} onPick={goTo} onClose={close} onFlat={() => setFlatMap(true)}
          playerPos={game.at ? [world.buildings[game.at].x, world.buildings[game.at].z] : engine.current?.playerPos() || game.pos} />
      ) : (
        <MapSheet world={world} game={showGame} onPick={goTo} onClose={close}
          on3d={engine.current && !no3d ? () => setFlatMap(false) : null}
          playerPos={game.at ? world.nodes[world.buildings[game.at].node] : engine.current?.playerPos() || game.pos} />
      ))}
      {panel === "to" && world && travelTo && !overlayOpen && (
        <PlaceSheet world={world} game={showGame} to={travelTo} onPlan={planFrom} onGo={onGo} busy={busy}
          people={game.open[travelTo] ? npcsFor(travelTo, INSIDE[world.buildings[travelTo]?.style] || "common", minute) : []}
          onClose={close} onBack={() => setPanel("map")} />
      )}
      {panel === "phone" && !journey && game.phase === "play" && (
        <Phone game={game} minute={minute} onAct={onAct} busy={busy} onClose={close}
          onMaps={() => setPanel("map")}
          onMarket={() => goTo("market")}
          onHousing={() => setPanel("housing")} onParents={onParents} onBet={onBet} run={runMove} />
      )}
      {panel === "housing" && !overlayOpen && (
        <BottomSheet title="Houses" subtitle="Halls, off-campus places, and moving in with friends" onClose={close}>
          <HousingChooser game={game} load={housing} onMove={onMoveHome} onJoin={(code) => onMoveHome({ code })} busy={busy} />
        </BottomSheet>
      )}
      {panel === "laptop" && !overlayOpen && (
        <BottomSheet title="💻 Your laptop" subtitle="Practise coding and design, and take gigs" onClose={close}>
          <div className="mb-3 rounded-2xl bg-[#1e1e2e] p-3 font-mono text-xs text-[#a6e3a1]">
            <p><span className="text-[#89b4fa]">~/great-ife</span> $ coding --level {game.skills.find((s) => s.id === "coding")?.level}</p>
            <p className="text-[#cdd6f4]">Every level up pays more and unlocks bigger gigs.</p>
          </div>
          <ActionCards actions={game.laptop} onAct={onAct} busy={busy} />
        </BottomSheet>
      )}
      {panel === "me" && !overlayOpen && (
        <MeSheet game={game} account={account} tab={meTab} onClose={close} onSave={() => setPanel("save")} onTitle={() => navigate("/")} />
      )}
      {panel === "inbox" && <InboxSheet game={game} onClose={close} />}
      {panel === "keys" && (
        <BottomSheet title="Keyboard shortcuts" onClose={close} height="auto">
          <ul className="grid grid-cols-2 gap-1.5 text-sm">
            {[["M", "Map"], ["P", "Phone"], ["H", "Go home"], ["C", "Go to class"], ["Y", "You: needs and skills"], ["F", "People you know"],
              ["I", "Inbox"], ["W A S D", "Walk"], ["Esc", "Close"], ["?", "This list"]].map(([k, v]) => (
              <li key={k} className="flex items-center gap-2 rounded-xl bg-slab px-3 py-2">
                <kbd className="min-w-[2rem] rounded-md bg-white px-1.5 py-0.5 text-center font-mono text-xs font-bold shadow">{k}</kbd>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </BottomSheet>
      )}
      {panel === "self" && controls && (
        <BottomSheet title="What should you do?" subtitle="Things you can do right here, by yourself" onClose={close} height="60%">
          <ActionCards actions={[...game.actions.filter((a) => ["fun", "rest", "study"].includes(a.station)),
            ...game.phone.filter((a) => ["fun", "hustle"].includes(a.station))].slice(0, 10)} onAct={(a) => {
            setPanel(null);
            onAct(a);
          }} busy={busy} />
        </BottomSheet>
      )}
      {panel === "save" && <SaveSheet onClose={close} />}
      {panel === "person" && person && controls && (
        <PersonSheet person={person} game={game} busy={busy} onClose={close} onSocial={onSocial} onChat={onChatWith} onSend={onSendTo} />
      )}
      {panel === "dm" && dm && <DmSheet thread={dm.thread} name={dm.name} onClose={close} />}
      {panel === "riddle" && controls && <RiddleSheet game={game} busy={busy} onClose={close} onSearch={onRiddleSearch} />}
      {!journey && <Spectacle events={game.events} />}

      {journey && <JourneyBar journey={journey} progress={jp.p} segment={jp.seg} fromName={journey.fromName} onSkip={skipJourney} />}
      {game.asleep && game.phase === "play" && !journey && (
        <SleepOverlay game={game} minute={minute} busy={busy} onWake={() => act("wake")} />
      )}

      {!journey && !lapse && game.phase === "event" && game.pending && <DecisionCard event={game.pending} onChoose={choose} busy={busy} />}
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
