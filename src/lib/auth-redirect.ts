const RETURN_KEY = "pulse_return_to";

function storage(): Storage | null {
  try {
    if (typeof globalThis.sessionStorage === "undefined") return null;
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

/** Only allow same-origin relative paths (open-redirect safe). */
export function isSafeReturnPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("://")) return false;
  if (path.includes("\\")) return false;
  return true;
}

export function rememberReturnTo(path: string): void {
  const ss = storage();
  if (!ss) return;
  if (!isSafeReturnPath(path)) return;
  // Don't bounce people back to the landing page after sign-in.
  if (path === "/" || path.startsWith("/?")) return;
  try {
    ss.setItem(RETURN_KEY, path);
  } catch {
    // private mode / quota — ignore
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
    const ss = storage();
    try {
      ss?.removeItem(RETURN_KEY);
    } catch {
      // ignore
    }
    return nextFromQuery;
  }
  return consumeReturnTo("/rooms");
}
