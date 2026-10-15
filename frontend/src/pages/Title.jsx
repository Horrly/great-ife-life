import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Footer } from "../App";
import InstallButton from "../components/InstallButton";
import { useGame } from "../lib/game";

export default function Title() {
  const { game, loading, resume, account } = useGame();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState("");

  async function load(e) {
    e.preventDefault();
    setError("");
    try {
      const g = await resume(code);
      navigate(g.status === "graduated" ? "/graduation" : "/play");
    } catch (err) {
      setError(err.status === 404 ? "No game matches that save code." : err.message);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-10">
        <p className="text-sm font-bold text-ife-600">A campus life game</p>
        <h1 className="display mt-2 text-[5.2rem] font-black uppercase text-ife-900 sm:text-[7rem]">
          Great
          <br />
          Ife
          <br />
          <span className="text-ife-600">Life</span>
        </h1>
        <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">
          Four years. One CGPA. Survive lectures, hustles, NEPA, water scarcity and the occasional ASUU strike, and
          graduate with a First. Or try.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {game && !loading ? (
            <>
              <Link to={game.status === "graduated" ? "/graduation" : "/play"} className="btn-primary py-4 text-lg">
                Continue as {game.name || game.profile.name}
              </Link>
              <Link to="/new" className="btn-ghost py-4 text-lg">
                Start a new life
              </Link>
            </>
          ) : (
            <Link to="/new" className="btn-primary py-4 text-lg sm:col-span-2">
              Get admission
            </Link>
          )}
        </div>

        <InstallButton />

        <div className="mt-6 space-y-3 text-sm">
          <p>
            {account ? (
              <Link to="/account" className="font-bold text-ife-600 underline underline-offset-2">
                Signed in as @{account.username}: your lives
              </Link>
            ) : (
              <Link to="/account?mode=login" className="font-bold text-ife-600 underline underline-offset-2">
                Have an account? Sign in to continue your game
              </Link>
            )}
          </p>
          {showCode ? (
            <form onSubmit={load} className="flex gap-2">
              <input
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste your save code"
                aria-label="Save code"
                autoFocus
              />
              <button className="btn-ghost shrink-0" disabled={!code.trim()}>
                Load
              </button>
            </form>
          ) : (
            <button className="text-muted underline underline-offset-2" onClick={() => setShowCode(true)}>
              Continue with a save code
            </button>
          )}
          {error && <p className="mt-2 text-danger">{error}</p>}
        </div>
      </main>
      <Footer />
    </div>
  );
}
