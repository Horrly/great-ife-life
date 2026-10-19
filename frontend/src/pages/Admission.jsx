import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useNavigate } from "react-router-dom";
import AvatarPreview, { LookPicker } from "../components/AvatarPreview";
import { useGame } from "../lib/game";
import { tweet, whatsapp } from "../lib/format";

// Hall allocation: halls are for male or female students. Staff kids and off-campus students live elsewhere.
const HALLS = {
  scholarship: { male: "Awo Hall", female: "Moremi Hall" },
  hustler: { male: "Angola Hall", female: "Mozambique Hall" },
};

/** The admission letter: the first shareable moment. */
export default function Admission() {
  const { game, setLook, busy } = useGame();
  const navigate = useNavigate();
  const [look, setLocalLook] = useState(game.look);
  const [traits, setTraits] = useState(game.traits.map((t) => t.id));
  const [dream, setDream] = useState(game.dream?.id);
  const [options, setOptions] = useState(null);
  useEffect(() => {
    api("/config/", { code: null }).then(setOptions).catch(() => {});
  }, []);
  const changed = JSON.stringify(look) !== JSON.stringify(game.look)
    || JSON.stringify(traits) !== JSON.stringify(game.traits.map((t) => t.id)) || dream !== game.dream?.id;

  function toggleTrait(id) {
    setTraits((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur.slice(-1), id]));
  }

  async function go() {
    if (changed) await setLook(look, traits.length === 2 ? traits : undefined, dream);
    navigate("/play");
  }
  const text = `I just got admitted to Great Ife Life as a ${game.profile.name} in ${game.department.name} 😭 What did you get? ${window.location.origin}`;

  return (
    <main className="mx-auto max-w-xl px-5 py-10">
      <p className="text-sm font-bold text-ife-600">Provisional admission</p>
      <article className="reveal mt-3 slab overflow-hidden">
        <div className="bg-ife-600 px-6 py-4 text-white">
          <p className="text-sm text-ife-100">{game.name ? `Dear ${game.name},` : "Dear candidate,"}</p>
          <p className="mt-1">
            You have been offered admission to study <b>{game.department.name}</b>. You will start life on campus as a:
          </p>
        </div>
        <div className="px-6 pb-6 pt-5">
          <h1 className="reveal-late display text-6xl font-black text-ife-900">{game.profile.name}</h1>
          <p className="mt-3 text-lg leading-relaxed">{game.profile.tagline}</p>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
            <div>
              <dt className="text-muted">You live in</dt>
              <dd className="font-bold">{HALLS[game.profile.id]?.[look.hall === 1 ? "female" : "male"] || game.profile.home}</dd>
            </div>
            <div>
              <dt className="text-muted">In your pocket</dt>
              <dd className="num font-bold">₦{game.money.toLocaleString("en-NG")}</dd>
            </div>
          </dl>
          <ul className="mt-4 space-y-1.5 text-sm">
            {game.profile.perks.map((perk) => (
              <li key={perk} className="flex gap-2">
                <span className="text-ife-600" aria-hidden>
                  ▸
                </span>
                {perk}
              </li>
            ))}
          </ul>
        </div>
      </article>

      <section className="mt-6 slab p-5" aria-labelledby="look-h">
        <h2 id="look-h" className="display text-3xl font-black text-ife-900">
          This is you
        </h2>
        <p className="text-sm text-muted">Dress for campus. You can walk all of Great Ife in this.</p>
        <div className="mt-3 grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-4">
          <AvatarPreview look={look} className="h-60 w-full rounded-lg bg-ife-50" />
          <LookPicker look={look} onChange={setLocalLook} halls={HALLS[game.profile.id]} />
        </div>
      </section>

      {options?.traits && (
        <section className="mt-6 slab p-5" aria-labelledby="traits-h">
          <h2 id="traits-h" className="display text-3xl font-black text-ife-900">
            Who you are
          </h2>
          <p className="text-sm text-muted">Pick two traits. They change how fast your needs drop and your skills grow.</p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(options.traits).map(([id, t]) => {
              const on = traits.includes(id);
              return (
                <li key={id}>
                  <button type="button" onClick={() => toggleTrait(id)} aria-pressed={on}
                    className={`w-full rounded-lg border-2 px-3 py-2 text-left ${on ? "border-ife-600 bg-ife-50" : "border-line bg-white"}`}>
                    <span className="font-bold">{t.emoji} {t.name}</span>
                    <span className="block text-xs text-muted">{t.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <h3 className="mt-5 font-bold">Your dream</h3>
          <p className="text-sm text-muted">One big goal for your time at Great Ife.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(options.dreams).map(([id, d]) => (
              <button key={id} type="button" onClick={() => setDream(id)} aria-pressed={dream === id} title={d.text}
                className={`rounded-full px-3 py-2 text-sm font-bold ${dream === id ? "bg-ife-600 text-white" : "bg-concrete"}`}>
                {d.emoji} {d.name}
              </button>
            ))}
          </div>
          {dream && <p className="mt-2 text-xs text-muted">{options.dreams[dream].text}</p>}
        </section>
      )}

      <button className="btn-primary mt-6 w-full py-4 text-lg" onClick={go} disabled={busy || traits.length !== 2}>
        Resume on campus
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a className="btn-ghost" href={whatsapp(text)} target="_blank" rel="noreferrer">
          Share on WhatsApp
        </a>
        <a className="btn-ghost" href={tweet(text)} target="_blank" rel="noreferrer">
          Post on X
        </a>
      </div>
    </main>
  );
}
