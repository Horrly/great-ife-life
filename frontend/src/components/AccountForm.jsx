import { useState } from "react";
import { useGame } from "../lib/game";

/** Create an account (saves the game on this device) or sign in (loads your game here). */
export default function AccountForm({ initialMode = "create", onDone }) {
  const { register, login, game } = useGame();
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const creating = mode === "create";

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = creating ? await register(username.trim(), password) : await login(username.trim(), password);
      onDone?.(res);
    } catch (err) {
      setError(err.status === 429 ? "Too many tries. Wait a minute and try again." : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 rounded-lg bg-concrete p-1 text-sm font-bold" role="tablist">
        {[
          ["create", "Create account"],
          ["login", "Sign in"],
        ].map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError("");
            }}
            className={`rounded-md py-2 ${mode === m ? "bg-slab text-ink shadow-sm" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">
        {creating
          ? game
            ? "Your current game will be saved to this account. Sign in on any phone to keep playing. No email needed."
            : "Save your games and continue on any phone. No email needed."
          : "Sign in to load your saved game on this device."}
      </p>
      <label className="block">
        <span className="text-sm font-bold">Username</span>
        <input
          className="input mt-1"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          required
          minLength={3}
          maxLength={20}
        />
      </label>
      <label className="block">
        <span className="text-sm font-bold">Password</span>
        <input
          className="input mt-1"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={creating ? "new-password" : "current-password"}
          required
          minLength={creating ? 6 : 1}
        />
        {creating && <span className="mt-1 block text-xs text-muted">At least 6 characters. We can't reset it, so remember it.</span>}
      </label>
      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <button className="btn-primary w-full py-3.5" disabled={busy}>
        {busy ? "One moment…" : creating ? "Create account and save" : "Sign in"}
      </button>
    </form>
  );
}
