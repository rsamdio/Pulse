import { describe, expect, it, beforeEach } from "vitest";
import {
  isSafeReturnPath,
  rememberReturnTo,
  consumeReturnTo,
  resolvePostAuthPath,
} from "./auth-redirect";

function mockSessionStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    },
  });
}

describe("auth-redirect", () => {
  beforeEach(() => {
    mockSessionStorage();
  });

  it("rejects open redirects", () => {
    expect(isSafeReturnPath("/rooms/abc")).toBe(true);
    expect(isSafeReturnPath("//evil.com")).toBe(false);
    expect(isSafeReturnPath("https://evil.com")).toBe(false);
  });

  it("remembers and consumes room deep links", () => {
    rememberReturnTo("/rooms/town-hall");
    expect(consumeReturnTo("/rooms")).toBe("/rooms/town-hall");
    expect(consumeReturnTo("/rooms")).toBe("/rooms");
  });

  it("prefers next query over storage", () => {
    rememberReturnTo("/rooms/old");
    expect(resolvePostAuthPath("/rooms/new")).toBe("/rooms/new");
  });
});
