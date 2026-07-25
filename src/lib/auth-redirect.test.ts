import { describe, expect, it, beforeEach } from "vitest";
import {
  isSafeReturnPath,
  shouldRememberReturnPath,
  rememberReturnTo,
  clearReturnTo,
  consumeReturnTo,
  resolvePostAuthPath,
  parseJoinCodeParam,
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

  it("allows join invite query with 6-digit code only", () => {
    expect(isSafeReturnPath("/join?code=123456")).toBe(true);
    expect(isSafeReturnPath("/rooms/foo/join?code=654321")).toBe(true);
    expect(isSafeReturnPath("/join?code=12")).toBe(false);
    expect(isSafeReturnPath("/join?code=abcdef")).toBe(false);
    expect(isSafeReturnPath("/join?code=123456&x=1")).toBe(false);
    expect(isSafeReturnPath("/join?next=/rooms")).toBe(false);
  });

  it("does not remember landing or rooms list", () => {
    expect(shouldRememberReturnPath("/")).toBe(false);
    expect(shouldRememberReturnPath("/rooms")).toBe(false);
    expect(shouldRememberReturnPath("/rooms/town-hall")).toBe(true);
    expect(shouldRememberReturnPath("/join?code=123456")).toBe(true);
  });

  it("remembers and consumes room deep links", () => {
    rememberReturnTo("/rooms/town-hall");
    expect(consumeReturnTo("/rooms")).toBe("/rooms/town-hall");
    expect(consumeReturnTo("/rooms")).toBe("/rooms");
  });

  it("does not store /rooms as return path", () => {
    rememberReturnTo("/rooms");
    expect(consumeReturnTo("/rooms")).toBe("/rooms");
  });

  it("clears return path on explicit logout", () => {
    rememberReturnTo("/rooms/town-hall");
    clearReturnTo();
    expect(consumeReturnTo("/rooms")).toBe("/rooms");
  });

  it("prefers next query over storage", () => {
    rememberReturnTo("/rooms/old");
    expect(resolvePostAuthPath("/rooms/new")).toBe("/rooms/new");
  });

  it("resolves invite next query with code", () => {
    expect(resolvePostAuthPath("/join?code=123456")).toBe("/join?code=123456");
  });

  it("parses join code params", () => {
    expect(parseJoinCodeParam("123456")).toBe("123456");
    expect(parseJoinCodeParam("12-34-56")).toBe("123456");
    expect(parseJoinCodeParam("123")).toBe(null);
    expect(parseJoinCodeParam(null)).toBe(null);
  });
});
