import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Footer } from "../App";
import GradCard, { cardFromGame } from "../components/GradCard";
import { BadgesButton } from "../components/Progress";
import { shareText, tweet, whatsapp } from "../lib/format";
import { useGame } from "../lib/game";

export default function Graduation() {
  const { game, quit } = useGame();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  if (game.status !== "graduated") return <Navigate to="/play" replace />;

  const card = cardFromGame(game);
  const url = `${window.location.origin}/c/${game.share_code}`;
  const text = shareText(card, url);

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-md px-5 py-10">
        <p className="text-sm font-bold text-ife-600">{card.class === "No degree yet" ? "It's over" : "Congratulations"}</p>
        <h1 className="display mb-5 text-5xl font-black text-ife-900">
          {card.class === "No degree yet" ? "Great Ife was not easy" : "You made it out of Great Ife"}
        </h1>
        <GradCard card={card} />

        <div className="mt-5 grid grid-cols-2 gap-2">
          <a className="btn-primary" href={whatsapp(text)} target="_blank" rel="noreferrer">
            Share on WhatsApp
          </a>
          <a className="btn-ghost" href={tweet(text)} target="_blank" rel="noreferrer">
            Post on X
          </a>
          <button
            className="btn-ghost col-span-2"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Link copied" : "Copy link to your card"}
          </button>
        </div>

        <div className="mt-5">
          <BadgesButton badges={game.badges} />
        </div>

        <button
          className="btn-bulb mt-6 w-full py-4 text-lg"
          onClick={() => {
            quit();
            navigate("/new");
          }}
        >
          Live another life
        </button>
        <div className="mt-3 flex justify-between text-sm font-bold text-ife-600">
          <Link to="/leaderboard" className="underline underline-offset-2">
            See the leaderboard
          </Link>
          <button className="underline underline-offset-2" onClick={() => setShowTranscript((v) => !v)}>
            {showTranscript ? "Hide transcript" : "Your transcript"}
          </button>
        </div>

        {showTranscript && (
          <section className="mt-5 slab p-4" aria-label="Transcript">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1.5 font-bold">Semester</th>
                  <th className="py-1.5 text-right font-bold">GPA</th>
                  <th className="py-1.5 text-right font-bold">CGPA</th>
                </tr>
              </thead>
              <tbody>
                {game.results.map((r) => (
                  <tr key={r.semester} className="border-t border-line">
                    <td className="py-1.5">{r.label}</td>
                    <td className="num py-1.5 text-right">{r.gpa.toFixed(2)}</td>
                    <td className="num py-1.5 text-right font-bold">{r.cgpa.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
