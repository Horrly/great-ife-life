import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { account as accountStore, api, save } from "./api";

const GameContext = createContext(null);

/** Holds the current game. Every move goes to the server, which sends back the new state. */
export function GameProvider({ children }) {
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(Boolean(save.code));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [account, setAccount] = useState(null);
  const inFlight = useRef(false);

  const refreshAccount = useCallback(async () => {
    if (!accountStore.code) return setAccount(null);
    try {
      setAccount(await api("/account/"));
    } catch (err) {
      if (err.status === 404) {
        accountStore.set(null);
        setAccount(null);
      }
    }
  }, []);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    if (!save.code) return;
    api("/game/")
      .then(setGame)
      .catch((err) => err.status === 404 && save.set(null))
      .finally(() => setLoading(false));
  }, []);

  const start = useCallback(async ({ name, department }) => {
    const res = await api("/games/", { method: "POST", body: { name, department }, code: null });
    save.set(res.token);
    setGame(res.game);
    setMessages([]);
    return res.game;
  }, []);
  // a new life started while signed in is saved to the account automatically

  const resume = useCallback(async (code) => {
    const g = await api("/game/", { code: code.trim() });
    save.set(code.trim());
    setGame(g);
    return g;
  }, []);

  const move = useCallback(
    async (path, body) => {
      if (inFlight.current || !game) return; // one move at a time: no double taps
      inFlight.current = true;
      setBusy(true);
      setError("");
      try {
        const g = await api(path, { method: "POST", body: { ...body, turn: game.turn } });
        setGame(g);
        setMessages(g.messages || []);
      } catch (err) {
        if (err.data?.game) setGame(err.data.game); // server sent the real state back
        if (err.status !== 409) setError(err.message);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [game],
  );

  const act = useCallback((action) => move("/game/act/", { action }), [move]);
  const choose = useCallback((choice) => move("/game/choose/", { choice }), [move]);
  const next = useCallback(() => move("/game/continue/", {}), [move]);
  /** Create an account; the game on this device is saved to it. */
  const register = useCallback(async (username, password) => {
    const res = await api("/account/register/", { method: "POST", body: { username, password }, accountToken: null });
    accountStore.set(res.account_token);
    setAccount(res.account);
    return res.account;
  }, []);

  /** Sign in on any device and pick up where you left off. */
  const login = useCallback(async (username, password) => {
    const res = await api("/account/login/", { method: "POST", body: { username, password }, code: null, accountToken: null });
    accountStore.set(res.account_token);
    setAccount(res.account);
    if (res.game_token) {
      save.set(res.game_token);
      setGame(res.game);
    }
    return res;
  }, []);

  const resumeLife = useCallback(async (id) => {
    const res = await api(`/account/lives/${id}/resume/`, { method: "POST", code: null });
    save.set(res.game_token);
    setGame(res.game);
    setMessages([]);
    return res.game;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/account/logout/", { method: "POST", code: null });
    } catch {
      /* signing out locally is what matters */
    }
    accountStore.set(null);
    save.set(null); // shared phones: the next person shouldn't see your game
    setAccount(null);
    setGame(null);
  }, []);

  const quit = useCallback(() => {
    save.set(null);
    setGame(null);
    setMessages([]);
  }, []);

  return (
    <GameContext.Provider
      value={{ game, loading, busy, error, setError, messages, start, resume, act, choose, next, quit,
        account, register, login, logout, resumeLife, refreshAccount }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}
