import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
      .then((g) => setGame({ ...g, receivedAt: performance.now() }))
      .catch((err) => err.status === 404 && save.set(null))
      .finally(() => setLoading(false));
  }, []);

  const start = useCallback(async ({ name, department, look }) => {
    const res = await api("/games/", { method: "POST", body: { name, department, look }, code: null });
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

  const gameRef = useRef(null);
  gameRef.current = game;

  /** Every move returns the new game; the caller may animate it (a time-lapse or a journey). */
  const move = useCallback(async (path, body) => {
    const current = gameRef.current;
    if (inFlight.current || !current) return null; // one move at a time: no double taps
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const g = await api(path, { method: "POST", body: { ...body, turn: current.turn } });
      g.receivedAt = performance.now();
      setGame(g);
      setMessages(g.messages || []);
      return g;
    } catch (err) {
      if (err.data?.game) setGame({ ...err.data.game, receivedAt: performance.now() }); // the real state
      if (err.status !== 409) setError(err.message);
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  const act = useCallback((action) => move("/game/act/", { action }), [move]);
  // stop watching an action or journey: the result is already in, so keep the messages waiting to show
  const skip = useCallback(async () => {
    const current = gameRef.current;
    if (!current) return null;
    try {
      const g = await api("/game/skip/", { method: "POST", body: { turn: current.turn } });
      g.receivedAt = performance.now();
      setGame(g);
      return g;
    } catch (err) {
      if (err.data?.game) setGame({ ...err.data.game, receivedAt: performance.now() });
      return null;
    }
  }, []);
  const choose = useCallback((choice) => move("/game/choose/", { choice }), [move]);
  const next = useCallback(() => move("/game/continue/", {}), [move]);
  const travel = useCallback((to, mode, pos) => move("/game/travel/", { to, mode, pos }), [move]);
  const enter = useCallback((building, pos) => move("/game/enter/", { building, pos }), [move]);
  const leave = useCallback(() => move("/game/exit/", {}), [move]);
  const setLook = useCallback((look, traits, dream) => move("/game/look/", { look, traits, dream }), [move]);
  const askParents = useCallback((amount) => move("/game/parents/", { amount }), [move]);
  const bet = useCallback((picks, stake, adult) => move("/game/bet/", { picks, stake, adult }), [move]);
  const moveHome = useCallback((body) => move("/game/housing/move/", body), [move]);
  const joinRoom = useCallback((code) => move("/game/housing/join/", { code }), [move]);
  const housing = useCallback(() => api("/game/housing/"), []);
  // banking: every money move goes through the server, like everything else
  const openBank = useCallback((bank) => move("/game/bank/open/", { bank }), [move]);
  const bankCounter = useCallback((kind, amount, hall) => move("/game/bank/counter/", { kind, amount, hall }), [move]);
  const atm = useCallback((amount, machine) => move("/game/bank/atm/", { amount, machine }), [move]);
  const pos = useCallback((kind, amount, method) => move("/game/bank/pos/", { kind, amount, method }), [move]);
  const appDeposit = useCallback((amount) => move("/game/bank/deposit/", { amount }), [move]);
  const transfer = useCallback((number, bank, amount, note) => move("/game/bank/transfer/", { number, bank, amount, note }), [move]);
  const lookupAccount = useCallback((number, bank) => api(`/game/bank/lookup/?${new URLSearchParams({ number, bank })}`), []);
  // chat
  const chat = useMemo(() => ({
    threads: () => api("/chat/"),
    messages: (thread, after = 0) => api(`/chat/messages/?${new URLSearchParams({ thread, after })}`),
    send: (thread, text, after = 0, shareAccount = false) =>
      api("/chat/messages/", { method: "POST", body: { thread, text, after, share_account: shareAccount } }),
    dm: (who) => api("/chat/dm/", { method: "POST", body: who }),
    block: (gameId) => api("/chat/block/", { method: "POST", body: { game: gameId } }),
    report: (messageId) => api("/chat/report/", { method: "POST", body: { message: messageId } }),
  }), []);
  const postNote = useCallback(async (note) => {
    try {
      const g = await api("/game/room/note/", { method: "POST", body: { note } });
      g.receivedAt = performance.now();
      setGame(g);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  /** Heartbeat: the server's clock catches up and learns where you walked. Never blocks a move. */
  const sync = useCallback(async (pos) => {
    if (inFlight.current || !gameRef.current) return;
    const turn = gameRef.current.turn;
    try {
      const g = await api("/game/sync/", { method: "POST", body: pos ? { pos } : {} });
      if (!inFlight.current && gameRef.current && gameRef.current.turn === turn) {
        g.receivedAt = performance.now();
        setGame(g);
        if (g.messages?.length) setMessages(g.messages);
      }
    } catch {
      /* offline for a moment: the next heartbeat catches up */
    }
  }, []);

  const plan = useCallback(async (to, pos) => {
    const q = new URLSearchParams({ to });
    if (pos) {
      q.set("x", pos[0]);
      q.set("z", pos[1]);
    }
    return api(`/game/plan/?${q}`);
  }, []);
  /** Tap a person: say hello, gist, crack a joke, throw shade (player = a real student's id). */
  const social = useCallback((kind, who, player, role) => move("/game/social/", { kind, who, player, role }), [move]);
  /** Send money straight to a student you can see (into their account). */
  const transferTo = useCallback((to, amount, note) => move("/game/bank/transfer/", { to, amount, note }), [move]);
  const riddle = useCallback(() => api("/game/riddle/"), []);
  const riddleSearch = useCallback(() => move("/game/riddle/search/", {}), [move]);
  const sug = useCallback(() => api("/sug/"), []);
  const vote = useCallback((candidate) => api("/sug/", { method: "POST", body: { candidate } }), []);
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
      value={{ game, loading, busy, error, setError, messages, setMessages, start, resume, act, skip, choose, next, quit,
        travel, enter, leave, setLook, sync, plan, askParents, bet, moveHome, joinRoom, housing, postNote,
        openBank, bankCounter, atm, pos, appDeposit, transfer, lookupAccount, chat, social, transferTo, riddle, riddleSearch, sug, vote,
        account, register, login, logout, resumeLife, refreshAccount }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}

let worldPromise = null;
/** The campus map from the server, fetched once per visit. */
export function loadWorld() {
  worldPromise ||= api("/world/", { code: null, accountToken: null }).catch((err) => {
    worldPromise = null;
    throw err;
  });
  return worldPromise;
}
