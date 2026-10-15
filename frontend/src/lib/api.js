// The save code is the only thing that identifies a player, so it lives in this browser's storage.
const KEY = "gil.save";
const ACCOUNT_KEY = "gil.account";

function stored(key) {
  return {
    get code() {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(code) {
      try {
        code ? localStorage.setItem(key, code) : localStorage.removeItem(key);
      } catch {
        /* private mode: still works until the tab closes */
      }
    },
  };
}

/** Signed-in account on this device (separate from the game's save code). */
export const account = stored(ACCOUNT_KEY);

export const save = {
  get code() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(code) {
    try {
      code ? localStorage.setItem(KEY, code) : localStorage.removeItem(KEY);
    } catch {
      /* private mode: the game still works until the tab closes */
    }
  },
};

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.detail || firstError(data) || `Something went wrong (${status})`);
    this.status = status;
    this.data = data;
  }
}

function firstError(data) {
  if (!data || typeof data !== "object") return null;
  for (const value of Object.values(data)) {
    const msg = Array.isArray(value) ? value[0] : value;
    if (typeof msg === "string") return msg;
  }
  return null;
}

export async function api(path, { method = "GET", body, code = save.code, accountToken = account.code } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (code) headers["X-Game-Token"] = code;
  if (accountToken) headers["X-Account-Token"] = accountToken;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, { detail: "No connection. Check your data and try again." });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
