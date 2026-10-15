import { useNavigate } from "react-router-dom";
import { useGame } from "../lib/game";
import { tweet, whatsapp } from "../lib/format";

/** The admission letter: the first shareable moment. */
export default function Admission() {
  const { game } = useGame();
  const navigate = useNavigate();
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
              <dd className="font-bold">{game.profile.home}</dd>
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

      <button className="btn-primary mt-6 w-full py-4 text-lg" onClick={() => navigate("/play")}>
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
