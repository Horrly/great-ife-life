// Admission, one step at a time: your look, two traits, your dream, the status lottery, then where you'll live.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AvatarPreview, { LookPicker } from "../components/AvatarPreview";
import { HousingChooser } from "../components/Home";
import { api } from "../lib/api";
import { naira, tweet, whatsapp } from "../lib/format";
import { useGame } from "../lib/game";
import { sfx } from "../lib/sfx";

const HALLS = { male: "Male halls", female: "Female halls" };
const STEPS = [["look", "This is you"], ["traits", "Who you are"], ["dream", "Your big dream"], ["status", "Your status"],
  ["home", "Where you'll live"]];
const REEL = ["🛺", "💸", "🎓", "🏦", "🍲", "👑", "📱", "💰", "🚗", "🪣"];
const STATUS_ICON = { lapo_baby: "💪🏾", nepo_baby: "🏦", odogwu: "👑" };

function Lottery({ game, odds, rolled, onDone }) {
  const [phase, setPhase] = useState(rolled ? "done" : "ready"); // ready | rolling | done
  const [face, setFace] = useState(0);
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);
  function roll() {
    setPhase("rolling");
    let n = 0;
    timer.current = setInterval(() => {
      n += 1;
      setFace((f) => (f + 1) % REEL.length);
      sfx("roll");
      if (n > 20) {
        clearInterval(timer.current);
        setPhase("done");
        onDone();
        sfx(game.profile.id === "lapo_baby" ? "wish" : "levelup");
      }
    }, 85);
  }
  if (phase !== "done") {
    return (
      <div className="text-center">
        <p className="text-muted">Every Ife student comes from somewhere. Some came with a LAPO loan, some came with a driver.</p>
        <div className="mx-auto mt-6 grid h-36 w-36 place-items-center rounded-[2rem] bg-white text-7xl shadow-inner ring-1 ring-line" aria-hidden>
          {phase === "rolling" ? REEL[face] : "🎰"}
        </div>
        <button className="btn mt-6 w-full rounded-full bg-go py-4 text-lg text-white" onClick={roll} disabled={phase === "rolling"}>
          {phase === "rolling" ? "Rolling…" : "Roll"}
        </button>
      </div>
    );
  }
  return (
    <div className="pop rounded-3xl bg-white p-5 text-center shadow-lg ring-1 ring-line">
      <p className="text-6xl" aria-hidden>{STATUS_ICON[game.profile.id] || "🎓"}</p>
      <h2 className="display mt-2 text-5xl text-ife-900">{game.profile.name}</h2>
      {odds && <p className="mt-2 inline-block rounded-full bg-bulb-soft px-3 py-1 text-sm font-bold">{odds <= 10 ? "Rare! " : ""}{odds}% of students get this</p>}
      <p className="mt-3 text-lg leading-relaxed">{game.profile.tagline}</p>
      <ul className="mt-4 space-y-1.5 text-left text-sm">
        {game.profile.perks.map((perk) => <li key={perk} className="rounded-xl bg-slab px-3 py-2">✓ {perk}</li>)}
      </ul>
      <p className="mt-3 text-sm text-muted">In your pocket: <b className="num text-ink">{naira(game.money)}</b> cash</p>
    </div>
  );
}

export default function Admission() {
  const { game, setLook, busy, moveHome, joinRoom, housing, error } = useGame();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [look, setLocalLook] = useState(game.look);
  const [traits, setTraits] = useState(game.traits.map((t) => t.id));
  const [dream, setDream] = useState(game.dream?.id);
  const [options, setOptions] = useState(null);
  const [rolled, setRolled] = useState(false);
  useEffect(() => {
    api("/config/", { code: null }).then(setOptions).catch(() => {});
  }, []);
  const changed = JSON.stringify(look) !== JSON.stringify(game.look)
    || JSON.stringify(traits) !== JSON.stringify(game.traits.map((t) => t.id)) || dream !== game.dream?.id;
  const odds = options?.profiles?.find((p) => p.id === game.profile.id)?.weight;

  function toggleTrait(id) {
    sfx("tap");
    setTraits((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur.slice(-1), id]));
  }
  function changeLook(next) {
    setLocalLook(next);
    // your hall depends on it, so save a change of hall straight away
    if (next.hall !== look.hall) setLook(next, traits.length === 2 ? traits : undefined, dream);
  }
  async function save() {
    if (changed) await setLook(look, traits.length === 2 ? traits : undefined, dream);
  }
  const id = STEPS[step][0];
  const button = {
    look: "Next",
    traits: traits.length === 2 ? "Next" : `Choose ${2 - traits.length} more`,
    dream: dream ? "Next" : "Pick a dream",
    status: rolled ? "Next" : "Roll first",
    home: "Move in",
  }[id];
  const canNext = id === "traits" ? traits.length === 2 : id === "dream" ? !!dream : id === "status" ? rolled : true;
  async function next() {
    sfx("tap");
    if (id === "home") {
      await save();
      navigate("/play");
      return;
    }
    if (id === "dream") await save();
    setStep((s) => s + 1);
    window.scrollTo({ top: 0 });
  }
  const text = `I just got admitted to Great Ife Life as a ${game.profile.name} in ${game.department.name} 😭 What did you get? ${window.location.origin}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col bg-[#eef2ee]">
      <header className="sticky top-0 z-10 bg-[#eef2ee]/95 px-5 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <button className="grid h-10 w-10 place-items-center rounded-full bg-white text-lg shadow-sm disabled:opacity-30" aria-label="Back"
            disabled={step === 0} onClick={() => setStep((s) => s - 1)}>‹</button>
          <h1 className="display min-w-0 flex-1 truncate text-2xl text-ife-900">{id === "dream" && game.name ? `${game.name}'s big dream?` : STEPS[step][1]}</h1>
          <span className="text-sm font-semibold text-muted">{step + 1}/{STEPS.length}</span>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1.5" aria-hidden>
          {STEPS.map((s, i) => <span key={s[0]} className={`h-1.5 rounded-full ${i <= step ? "bg-go" : "bg-line"}`} />)}
        </div>
      </header>

      <div className="flex-1 px-5 pb-32">
        {id === "look" && (
          <>
            <p className="mb-3 text-muted">Admitted to study <b className="text-ink">{game.department.name}</b>. Dress for campus: you'll walk all of Great Ife in this.</p>
            <div className="mb-4 overflow-hidden rounded-3xl bg-[#dcebf7]">
              <AvatarPreview look={look} className="mx-auto h-64 w-full" />
            </div>
            <LookPicker look={look} onChange={changeLook} halls={HALLS} />
          </>
        )}
        {id === "traits" && options?.traits && (
          <>
            <p className="mb-3 text-muted">Pick two. They change how fast your needs drop and your skills grow.</p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(options.traits).map(([tid, t]) => {
                const on = traits.includes(tid);
                return (
                  <li key={tid}>
                    <button type="button" onClick={() => toggleTrait(tid)} aria-pressed={on}
                      className={`flex w-full items-center gap-3 rounded-2xl bg-white px-3.5 py-3 text-left shadow-sm ${on ? "ring-2 ring-go" : "ring-1 ring-black/5"}`}>
                      <span aria-hidden className="text-3xl">{t.emoji}</span>
                      <span>
                        <span className="block font-bold">{t.name}</span>
                        <span className="block text-sm text-muted">{t.text}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {id === "dream" && options?.dreams && (
          <>
            <p className="mb-3 text-muted">One big goal for your time at Great Ife. You can change it during your first two days.</p>
            <ul className="space-y-2">
              {Object.entries(options.dreams).map(([did, d]) => (
                <li key={did}>
                  <button type="button" onClick={() => {
                    sfx("tap");
                    setDream(did);
                  }} aria-pressed={dream === did}
                    className={`flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left shadow-sm ${dream === did ? "ring-2 ring-go" : "ring-1 ring-black/5"}`}>
                    <span aria-hidden className="text-3xl">{d.emoji}</span>
                    <span>
                      <span className="block font-bold">{d.name}</span>
                      <span className="block text-sm text-muted">{d.text}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {id === "status" && (
          <div>
            <Lottery game={game} odds={odds} rolled={rolled} onDone={() => setRolled(true)} />
            {rolled && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a className="btn-ghost rounded-full" href={whatsapp(text)} target="_blank" rel="noreferrer">Share on WhatsApp</a>
                <a className="btn-ghost rounded-full" href={tweet(text)} target="_blank" rel="noreferrer">Post on X</a>
              </div>
            )}
          </div>
        )}
        {id === "home" && (
          <>
            <p className="mb-3 text-muted">
              You've been given a bunk in a hall with other real players. Stay, pick another hall, rent a place off campus, or use a
              friend's room code to move in with them. Rent is for a whole session.
            </p>
            <HousingChooser game={game} load={housing} busy={busy} onMove={(body) => moveHome(body)} onJoin={(code) => joinRoom(code)} />
            {error && <p className="mt-2 text-sm font-bold text-danger" role="alert">{error}</p>}
          </>
        )}
      </div>

      {!(id === "status" && !rolled) && <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-xl bg-gradient-to-t from-[#eef2ee] via-[#eef2ee] to-transparent px-5 pb-5 pt-6">
        <button className="btn w-full rounded-full bg-go py-4 text-lg text-white disabled:bg-line disabled:text-muted" onClick={next} disabled={busy || !canNext}>
          {id === "home" ? "Resume on campus" : button}
        </button>
      </div>}
    </main>
  );
}
