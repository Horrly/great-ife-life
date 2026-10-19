import { lazy, Suspense } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import OfflineBanner from "./components/OfflineBanner";
import { useGame } from "./lib/game";
import Account from "./pages/Account";
import CardPage from "./pages/CardPage";
import Graduation from "./pages/Graduation";
import Leaderboard from "./pages/Leaderboard";
import NewGame from "./pages/NewGame";
import Privacy from "./pages/Privacy";
import Title from "./pages/Title";

// The 3D campus (three.js) only downloads when you start playing; the title page stays light.
const Play = lazy(() => import("./pages/Play"));
const Admission = lazy(() => import("./pages/Admission"));

function NeedsGame({ children }) {
  const { game, loading } = useGame();
  if (loading) return <Loading />;
  if (!game) return <Navigate to="/" replace />;
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}

export function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-sm text-muted" role="status">
      Loading campus…
    </div>
  );
}

export function Footer() {
  return (
    <footer className="px-4 py-8 text-center text-xs leading-relaxed text-muted">
      Great Ife Life is an unofficial fan game. It isn't made or endorsed by Obafemi Awolowo University.
      <br />
      <Link to="/leaderboard" className="underline underline-offset-2">
        Leaderboard
      </Link>{" "}
      <Link to="/privacy" className="ml-3 underline underline-offset-2">
        Privacy
      </Link>
    </footer>
  );
}

export default function App() {
  return (
    <>
      <OfflineBanner />
      <Routes>
      <Route path="/" element={<Title />} />
      <Route path="/new" element={<NewGame />} />
      <Route path="/leaderboard" element={<Leaderboard />} />
      <Route path="/account" element={<Account />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/c/:code" element={<CardPage />} />
      <Route path="/admission" element={<NeedsGame><Admission /></NeedsGame>} />
      <Route path="/play" element={<NeedsGame><Play /></NeedsGame>} />
      <Route path="/graduation" element={<NeedsGame><Graduation /></NeedsGame>} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
