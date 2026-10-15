import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Footer } from "../App";
import AccountForm from "../components/AccountForm";
import { useGame } from "../lib/game";

export default function Account() {
  const { account, logout, resumeLife, refreshAccount } = useGame();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-md px-5 py-10">
        <Link to="/" className="text-sm font-bold text-ife-600">
          Great Ife Life
        </Link>
        {!account ? (
          <>
            <h1 className="display mt-3 text-5xl font-black text-ife-900">Your account</h1>
            <div className="mt-6 slab p-5">
              <AccountForm
                initialMode={params.get("mode") === "login" ? "login" : "create"}
                onDone={(res) => navigate(res?.game_token ? "/play" : "/account", { replace: true })}
              />
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted">Signed in as</p>
            <h1 className="display text-5xl font-black text-ife-900">@{account.username}</h1>
            <h2 className="mt-8 font-bold">Your lives at Great Ife</h2>
            {account.lives.length === 0 ? (
              <p className="mt-3 slab p-5 text-muted">No games yet.</p>
            ) : (
              <ul className="mt-3 slab divide-y divide-line">
                {account.lives.map((life) => (
                  <li key={life.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">
                        {life.profile}, {life.department}
                      </p>
                      <p className="truncate text-sm text-muted">
                        {life.status === "graduated"
                          ? `${life.class}, CGPA ${life.cgpa.toFixed(2)}`
                          : `${life.level}${life.cgpa !== null ? `, CGPA ${life.cgpa.toFixed(2)}` : ""}`}
                      </p>
                    </div>
                    {life.status === "graduated" ? (
                      <Link to={`/c/${life.share_code}`} className="btn-ghost px-3 py-2 text-sm">
                        Card
                      </Link>
                    ) : (
                      <button
                        className="btn-primary px-3 py-2 text-sm"
                        onClick={async () => {
                          await resumeLife(life.id);
                          navigate("/play");
                        }}
                      >
                        Continue
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Link to="/new" className="btn-primary">
                Start a new life
              </Link>
              <button
                className="btn-ghost"
                onClick={async () => {
                  await logout();
                  navigate("/");
                }}
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
