// The screen a returning player sees: the game's name, their own room in 3D on a patch of grass, and one big
// Continue button with who they are, the date and their money.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import RoomView from "../game3d/room";
import { preloadPeople } from "../game3d/characters";
import { nairaShort } from "../lib/format";
import { useGame } from "../lib/game";
import Portrait from "./Portrait";

function Emblem() {
  // a gold mortarboard with a green-white-green band: Great Ife, graduating
  return (
    <svg viewBox="0 0 120 84" className="mx-auto h-16 w-24 drop-shadow-[0_6px_10px_rgb(0_0_0/0.18)]" aria-hidden>
      <path d="M60 6 L114 28 L60 50 L6 28 Z" fill="#f2c230" stroke="#b9860e" strokeWidth="3" strokeLinejoin="round" />
      <path d="M28 38 L28 58 Q60 74 92 58 L92 38 L60 51 Z" fill="#e3ad1c" stroke="#b9860e" strokeWidth="3" strokeLinejoin="round" />
      <rect x="40" y="58" width="13" height="10" rx="2" fill="#1f8a4c" />
      <rect x="53" y="58" width="14" height="10" fill="#ffffff" />
      <rect x="67" y="58" width="13" height="10" rx="2" fill="#1f8a4c" />
      <circle cx="60" cy="28" r="5" fill="#1f8a4c" stroke="#0f5132" strokeWidth="2" />
      <path d="M60 28 L100 40 L100 60" fill="none" stroke="#0f5132" strokeWidth="3" strokeLinecap="round" />
      <circle cx="100" cy="64" r="5" fill="#1f8a4c" />
    </svg>
  );
}

/** Your room as a slowly turning diorama on a round lawn. */
function RoomDiorama({ game }) {
  const host = useRef(null);
  useEffect(() => {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    host.current.appendChild(renderer.domElement);
    const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    const view = new RoomView({ lowPower: false, environment: env });
    view.scene.background = null;
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(15, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: "#a9c98f", roughness: 1 }));
    lawn.position.y = -0.34;
    lawn.receiveShadow = true;
    view.scene.add(lawn);
    const sun = new THREE.DirectionalLight("#fff6e6", 1.2);
    sun.position.set(-8, 20, 10);
    view.scene.add(sun);
    const now = new Date();
    const minute = (now.getUTCHours() + 1) % 24 * 60 + now.getUTCMinutes();
    const mine = { name: game.name || "You", you: true, where: "in", look: game.look };
    const furniture = Object.fromEntries((game.furnish?.items || []).filter((i) => i.owned && i.fits).map((i) => [i.slot, i.id]));
    const info = game.room
      ? { ...game.room, kind: game.housing?.kind || "hostel", furniture }
      : { kind: game.housing?.kind || "hostel", label: "Your room", capacity: 4, people: [mine], furniture };
    let raf = 0;
    let last = performance.now();
    let t = 0;
    const size = () => {
      const w = host.current?.clientWidth || 300;
      const h = host.current?.clientHeight || 300;
      renderer.setSize(w, h);
      view.resize(w, h);
    };
    const ro = new ResizeObserver(size);
    ro.observe(host.current);
    preloadPeople().catch(() => {}).finally(() => {
      view.show(info, Math.max(480, Math.min(minute, 1020)), false); // always shown in daylight
      size();
      const loop = (now2) => {
        const dt = Math.min(0.05, (now2 - last) / 1000);
        last = now2;
        t += dt;
        // a slow look round, from above like a dolls' house
        view.userYaw = Math.sin(t * 0.18) * 0.75;
        view.userElev = 0.95;
        view.userZoom = 1.08;
        view.tick?.(dt);
        view.render(renderer, dt);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      view.dispose?.();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [game.room?.id, game.housing?.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={host} className="absolute inset-0" aria-label="Your room" role="img" />;
}

/**
 * Coming back: the game on this phone, or (signed in on a new phone) the latest unfinished life on the account.
 * life = an account life summary, used when there's no game on this device yet.
 */
/** While the saved game loads: the same sky and emblem, so the page doesn't flash the long introduction. */
export function WelcomeSplash() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[linear-gradient(180deg,#bfdcf3_0%,#dcecf8_45%,#eef4f0_100%)] text-center">
      <div>
        <Emblem />
        <p className="display mt-3 text-4xl text-[#18222b]">Great Ife Life</p>
        <p className="mt-2 text-sm text-[#46525c]">Opening your game…</p>
      </div>
    </div>
  );
}

export default function WelcomeBack({ life = null }) {
  const { game: local, account, logout, resumeLife } = useGame();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(new Date());
  const game = local || {
    name: life?.name, look: life?.look || {}, total_money: life?.money ?? 0, housing: { kind: life?.housing || "hostel" },
    room: null, status: life?.status || "playing", profile: { name: life?.profile },
  };
  const go = game.status === "graduated" ? "/graduation" : "/play";
  async function onContinue() {
    if (!local && life) {
      setBusy(true);
      try {
        await resumeLife(life.id);
      } catch {
        setBusy(false);
        return;
      }
    }
    navigate(go);
  }
  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[linear-gradient(180deg,#bfdcf3_0%,#dcecf8_45%,#eef4f0_100%)] text-ink">
      <header className="relative z-10 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] text-center">
        <Emblem />
        <h1 className="display mt-3 text-[3.1rem] leading-[0.95] tracking-tight text-[#18222b] sm:text-[4rem]">Great Ife Life</h1>
        <p className="mt-2 text-lg text-[#46525c]">Live your Great Ife story.</p>
      </header>

      <div className="relative -mt-2 min-h-[18rem] flex-1">
        <RoomDiorama game={game} />
      </div>

      <div className="relative z-10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md rounded-[2rem] bg-white p-4 shadow-[0_20px_50px_-20px_rgb(10_44_29/0.45)]">
          <div className="flex items-center gap-3 rounded-[1.4rem] bg-[#f2f4f6] p-3">
            <Portrait look={game.look} name={game.name} size={56} bg="#dbe7f5" />
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold">{game.name || game.profile?.name || "Your student"}</span>
              <span className="block text-sm text-muted">{date} · {nairaShort(game.total_money ?? game.money ?? 0)}</span>
            </span>
          </div>
          <button className="mt-3 w-full rounded-[1.4rem] bg-[#1c8a52] py-4 text-xl font-bold text-white shadow-[0_5px_0_#0f5c35] active:translate-y-0.5 active:shadow-[0_3px_0_#0f5c35] disabled:opacity-70"
            onClick={onContinue} disabled={busy}>
            {busy ? "Opening your game…" : "Continue"}
          </button>
          <div className="mt-3 flex items-center justify-between px-1 text-sm">
            {account ? (
              <>
                <span className="truncate text-muted">Signed in as <b className="text-ink">@{account.username}</b></span>
                <button className="font-semibold text-[#2f6fd6]" disabled={busy} onClick={async () => {
                  setBusy(true);
                  await logout();
                  setBusy(false);
                }}>Log out</button>
              </>
            ) : (
              <>
                <span className="text-muted">Not saved to an account yet</span>
                <Link to="/account" className="font-semibold text-[#2f6fd6]">Save progress</Link>
              </>
            )}
          </div>
        </div>
        <nav className="mx-auto mt-3 flex max-w-md flex-wrap justify-center gap-2 text-sm font-semibold">
          <Link to="/leaderboard" className="rounded-full bg-white px-3.5 py-2 shadow-sm">🏆 Leaderboard</Link>
          <Link to="/new" className="rounded-full bg-white px-3.5 py-2 shadow-sm">✨ New life</Link>
          <Link to="/?about=1" className="rounded-full bg-white px-3.5 py-2 shadow-sm">ℹ️ About</Link>
        </nav>
      </div>
    </div>
  );
}
