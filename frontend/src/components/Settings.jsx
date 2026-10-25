// Settings: sound, map, buttons, your account (save, log out, delete) and the game on this phone.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useGame } from "../lib/game";
import { setSound, sfx, soundOn } from "../lib/sfx";

function Row({ icon, label, sub, children, onClick, danger }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`flex w-full items-center gap-3 px-3 py-3 text-left ${onClick ? "active:bg-black/5" : ""}`}>
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-chip text-lg">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-bold ${danger ? "text-danger" : "text-ink"}`}>{label}</span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
      {children}
    </Tag>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-go" : "bg-line"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[1.4rem]" : "left-0.5"}`} />
    </button>
  );
}

export default function Settings({ flatMap, setFlatMap, onSave, onHideButtons, onShortcuts }) {
  const { account, logout, quit, game } = useGame();
  const navigate = useNavigate();
  const [sound, setS] = useState(soundOn());
  const [confirm, setConfirm] = useState(null); // "logout" | "delete" | "delete-game"
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function deleteAccount() {
    setBusy(true);
    setErr("");
    try {
      await api("/account/", { method: "DELETE", body: { password }, code: null });
      await logout();
      navigate("/", { replace: true });
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }
  async function deleteGame() {
    setBusy(true);
    setErr("");
    try {
      await api("/game/delete/", { method: "POST", body: { confirm: typed } });
      quit();
      navigate("/", { replace: true });
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 p-3 text-ink">
      <section className="overflow-hidden rounded-2xl bg-white/95">
        <h3 className="px-3 pt-3 text-xs font-bold text-muted">Game</h3>
        <Row icon="🔊" label="Sound and music" sub="Taps, cash, rain and alerts">
          <Toggle label="Sound" on={sound} onChange={(v) => {
            setSound(v);
            setS(v);
            if (v) sfx("tap");
          }} />
        </Row>
        {setFlatMap && (
          <Row icon="🗺" label="Flat map" sub="Lighter on data and older phones">
            <Toggle label="Flat map" on={flatMap} onChange={setFlatMap} />
          </Row>
        )}
        {onHideButtons && <Row icon="🙈" label="Hide buttons" sub="See the whole room or road. Tap 'Show buttons' to bring them back." onClick={onHideButtons} />}
        {onShortcuts && <Row icon="⌨️" label="Keyboard shortcuts" sub="On a laptop or desktop" onClick={onShortcuts} />}
      </section>

      <section className="overflow-hidden rounded-2xl bg-white/95">
        <h3 className="px-3 pt-3 text-xs font-bold text-muted">Account</h3>
        {account ? (
          <>
            <Row icon="👤" label={`Signed in as ${account.username || account.email || "you"}`} sub="Your game is saved to your account" />
            <Row icon="🚪" label="Log out" sub="Your game stays saved; log in again on any phone" onClick={() => setConfirm("logout")} />
            <Row icon="🗑" label="Delete account" sub="Removes your account and every game on it, for good" danger onClick={() => setConfirm("delete")} />
          </>
        ) : (
          <>
            <Row icon="💾" label="Save your progress" sub="Create an account so you never lose this game" onClick={onSave} />
            <Row icon="🗑" label="Delete this game" sub="Removes the game on this phone, for good" danger onClick={() => setConfirm("delete-game")} />
          </>
        )}
      </section>

      {confirm === "logout" && (
        <section className="rounded-2xl bg-white p-3">
          <p className="text-sm font-bold">Log out of Great Ife Life?</p>
          <p className="text-xs text-muted">Your game stays saved to your account.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="rounded-full bg-chip py-2 text-sm font-bold" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="rounded-full bg-ink py-2 text-sm font-bold text-white" onClick={async () => {
              await logout();
              navigate("/", { replace: true });
            }}>Log out</button>
          </div>
        </section>
      )}
      {confirm === "delete" && (
        <section className="rounded-2xl bg-white p-3">
          <p className="text-sm font-bold text-danger">Delete your account?</p>
          <p className="text-xs text-muted">This deletes your account and all {game ? "your games" : "games"} on it. It can't be undone. Enter your password to confirm.</p>
          <input type="password" className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm" placeholder="Password"
            value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          {err && <p className="mt-1 text-xs text-danger">{err}</p>}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="rounded-full bg-chip py-2 text-sm font-bold" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="rounded-full bg-danger py-2 text-sm font-bold text-white disabled:opacity-50" disabled={!password || busy}
              onClick={deleteAccount}>{busy ? "Deleting…" : "Delete for good"}</button>
          </div>
        </section>
      )}
      {confirm === "delete-game" && (
        <section className="rounded-2xl bg-white p-3">
          <p className="text-sm font-bold text-danger">Delete this game?</p>
          <p className="text-xs text-muted">Your student, money and progress will be gone. Type DELETE to confirm.</p>
          <input className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm uppercase" placeholder="DELETE"
            value={typed} onChange={(e) => setTyped(e.target.value)} />
          {err && <p className="mt-1 text-xs text-danger">{err}</p>}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="rounded-full bg-chip py-2 text-sm font-bold" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="rounded-full bg-danger py-2 text-sm font-bold text-white disabled:opacity-50" disabled={typed.trim().toUpperCase() !== "DELETE" || busy}
              onClick={deleteGame}>{busy ? "Deleting…" : "Delete game"}</button>
          </div>
        </section>
      )}
      <p className="px-1 text-center text-[11px] text-white/80">Great Ife Life · made for OAU students</p>
    </div>
  );
}
