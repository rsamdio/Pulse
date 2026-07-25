const RETURN_KEY = "pulse_return_to";

function storage(): Storage | null {
  try {
    if (typeof globalThis.sessionStorage === "undefined") return null;
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Only allow same-origin relative paths (open-redirect safe).
 * Optional query: only `?code=` with exactly 6 digits (join invite links).
 */
export function isSafeReturnPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("://")) return false;
  if (path.includes("\\")) return false;

  const qIndex = path.indexOf("?");
  const pathname = qIndex === -1 ? path : path.slice(0, qIndex);
  const search = qIndex === -1 ? "" : path.slice(qIndex + 1);

  if (!pathname.startsWith("/") || pathname.startsWith("//")) return false;
  if (pathname.includes("//")) return false;

  if (!search) return true;

  // Only allow a single known safe query: code=NNNNNN
  const params = new URLSearchParams(search);
  const keys = [...params.keys()];
  if (keys.length !== 1 || keys[0] !== "code") return false;
  const code = params.get("code") ?? "";
  return /^\d{6}$/.test(code);
}

/** Paths that are not worth restoring after sign-in (default post-auth is /rooms). */
export function shouldRememberReturnPath(path: string): boolean {
  if (!isSafeReturnPath(path)) return false;
  const qIndex = path.indexOf("?");
  const pathname = qIndex === -1 ? path : path.slice(0, qIndex);
  if (pathname === "/" || pathname === "/rooms") return false;
  return true;
}

export function rememberReturnTo(path: string): void {
  const ss = storage();
  if (!ss) return;
  if (!shouldRememberReturnPath(path)) return;
  try {
    ss.setItem(RETURN_KEY, path);
  } catch {
    // private mode / quota — ignore
  }
}

export function clearReturnTo(): void {
  const ss = storage();
  if (!ss) return;
  try {
    ss.removeItem(RETURN_KEY);
  } catch {
    // ignore
  }
}

/** Read and clear the stored return path. */
export function consumeReturnTo(fallback = "/rooms"): string {
  const ss = storage();
  if (!ss) return fallback;
  let stored: string | null = null;
  try {
    stored = ss.getItem(RETURN_KEY);
    ss.removeItem(RETURN_KEY);
  } catch {
    stored = null;
  }
  if (stored && isSafeReturnPath(stored)) return stored;
  return fallback;
}

export function resolvePostAuthPath(nextFromQuery: string | null): string {
  if (nextFromQuery && isSafeReturnPath(nextFromQuery)) {
    clearReturnTo();
    return nextFromQuery;
  }
  return consumeReturnTo("/rooms");
}

/** Normalize a join-code query value to 6 digits, or null if invalid. */
export function parseJoinCodeParam(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  return digits.length === 6 ? digits : null;
}
