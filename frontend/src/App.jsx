import { Link, Navigate, Route, Routes } from "react-router-dom";
import OfflineBanner from "./components/OfflineBanner";
import { useGame } from "./lib/game";
import Account from "./pages/Account";
import Admission from "./pages/Admission";
import CardPage from "./pages/CardPage";
import Graduation from "./pages/Graduation";
import Leaderboard from "./pages/Leaderboard";
import NewGame from "./pages/NewGame";
import Play from "./pages/Play";
import Privacy from "./pages/Privacy";
import Title from "./pages/Title";

function NeedsGame({ children }) {
  const { game, loading } = useGame();
  if (loading) return <Loading />;
  if (!game) return <Navigate to="/" replace />;
  return children;
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
