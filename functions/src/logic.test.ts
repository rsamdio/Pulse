import { describe, expect, it } from "vitest";
import {
  assertQuestionFields,
  assertSlug,
  assertEngagementType,
  assertMcqOptions,
  assertOpenResponse,
  assertDurationSec,
  assertAutoAdvance,
  canAccessRoom,
  engagementSortOrder,
  evaluateExpireGuards,
  isValidJoinCodeShape,
  nextDraftId,
  normalizeEmail,
  normalizeOpenPhrase,
  normalizeSlug,
  roleFromDocs,
  roleFromOrganizerDoc,
  sanitizeCsvCell,
  shouldPublicTallies,
  shouldWritePrivateTallies,
  topPhrasesFromMap,
  assertResultsVisibility,
  MIN_DURATION_SEC,
  MAX_DURATION_SEC,
} from "../src/logic";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Alex@Example.COM ")).toBe("alex@example.com");
  });
});

describe("roleFromDocs", () => {
  it("prioritizes admin over organizer", () => {
    expect(roleFromDocs(true, true)).toBe("admin");
    expect(roleFromDocs(true, false)).toBe("admin");
    expect(roleFromDocs(false, true)).toBe("organizer");
    expect(roleFromDocs(false, false)).toBe("attendee");
  });
});

describe("roleFromOrganizerDoc", () => {
  it("maps organizer doc presence to role", () => {
    expect(roleFromOrganizerDoc(true)).toBe("organizer");
    expect(roleFromOrganizerDoc(false)).toBe("attendee");
  });
});

describe("assertSlug", () => {
  it("normalizes and validates", () => {
    expect(assertSlug("  Town Hall 2026 ")).toBe("town-hall-2026");
    expect(normalizeSlug("Hello---World")).toBe("hello-world");
    expect(() => assertSlug("ab")).toThrow();
    expect(() => assertSlug("Bad_Slug!")).not.toThrow();
    expect(assertSlug("Bad_Slug!")).toBe("bad-slug");
  });
});

describe("assertQuestionFields", () => {
  it("requires question and allows optional description", () => {
    expect(() => assertQuestionFields({ question: "  " })).toThrow();
    expect(
      assertQuestionFields({ question: " Why? ", description: "  more  " }),
    ).toEqual({ question: "Why?", details: "more" });
    expect(
      assertQuestionFields({ question: "Legacy", details: "  old  " }),
    ).toEqual({ question: "Legacy", details: "old" });
    expect(assertQuestionFields({ question: "Only Q" }).details).toBe("");
    expect(() =>
      assertQuestionFields({ question: "x".repeat(201) }),
    ).toThrow();
  });
});

describe("join codes", () => {
  it("requires 6 digits", () => {
    expect(isValidJoinCodeShape("123456")).toBe(true);
    expect(isValidJoinCodeShape("12345")).toBe(false);
    expect(isValidJoinCodeShape("1234567")).toBe(false);
  });
});

describe("sanitizeCsvCell", () => {
  it("neutralizes formula prefixes", () => {
    expect(sanitizeCsvCell("=1+1")).toBe("'=1+1");
    expect(sanitizeCsvCell("hello")).toBe("hello");
  });
});

describe("engagement fields", () => {
  it("validates mcq options and open responses", () => {
    expect(assertEngagementType("mcq")).toBe("mcq");
    expect(assertEngagementType("word_cloud")).toBe("word_cloud");
    expect(assertEngagementType("open_text")).toBe("open_text");
    expect(() => assertEngagementType("open")).toThrow();
    expect(() => assertEngagementType("quiz")).toThrow();
    expect(assertMcqOptions(["Yes", "No"])).toEqual([
      { id: "opt1", label: "Yes" },
      { id: "opt2", label: "No" },
    ]);
    expect(() => assertMcqOptions(["Only one"])).toThrow();
    expect(assertOpenResponse("  Hello World  ")).toEqual({
      text: "Hello World",
      phrase: "hello world",
    });
    expect(normalizeOpenPhrase("  A   B ")).toBe("a b");
    expect(
      topPhrasesFromMap(
        { hello: 2, world: 5 },
        { hello: "Hello", world: "World" },
        1,
      ),
    ).toEqual([{ text: "World", count: 5 }]);
  });

  it("defaults results visibility", () => {
    expect(assertResultsVisibility(undefined)).toBe("live");
    expect(assertResultsVisibility("after_close")).toBe("after_close");
    expect(() => assertResultsVisibility("never")).toThrow();
  });
});

describe("engagementSortOrder", () => {
  it("prefers sortOrder then createdAt", () => {
    expect(engagementSortOrder({ sortOrder: 42, createdAt: 1 })).toBe(42);
    expect(engagementSortOrder({ createdAt: 99 })).toBe(99);
    expect(engagementSortOrder({})).toBe(0);
  });
});

describe("nextDraftId", () => {
  it("returns null for empty queue", () => {
    expect(nextDraftId([])).toBeNull();
  });

  it("orders by sortOrder then createdAt then id", () => {
    expect(
      nextDraftId([
        { id: "b", sortOrder: 2, createdAt: 1 },
        { id: "a", sortOrder: 1, createdAt: 5 },
        { id: "c", sortOrder: 1, createdAt: 3 },
      ]),
    ).toBe("c");
    expect(
      nextDraftId([
        { id: "z", sortOrder: 1, createdAt: 1 },
        { id: "a", sortOrder: 1, createdAt: 1 },
      ]),
    ).toBe("a");
  });
});

describe("assertDurationSec", () => {
  it("treats empty as untimed", () => {
    expect(assertDurationSec(null)).toBeNull();
    expect(assertDurationSec(undefined)).toBeNull();
    expect(assertDurationSec("")).toBeNull();
  });

  it("accepts integers in range", () => {
    expect(assertDurationSec(MIN_DURATION_SEC)).toBe(MIN_DURATION_SEC);
    expect(assertDurationSec(60)).toBe(60);
    expect(assertDurationSec(MAX_DURATION_SEC)).toBe(MAX_DURATION_SEC);
  });

  it("rejects out of range or non-integers", () => {
    expect(() => assertDurationSec(9)).toThrow();
    expect(() => assertDurationSec(3601)).toThrow();
    expect(() => assertDurationSec(30.5)).toThrow();
  });
});

describe("assertAutoAdvance", () => {
  it("forces false when untimed", () => {
    expect(assertAutoAdvance(true, null)).toBe(false);
    expect(assertAutoAdvance(true, 60)).toBe(true);
    expect(assertAutoAdvance(false, 60)).toBe(false);
  });
});

describe("shouldPublicTallies", () => {
  it("shows public tallies for live visibility or revealed/closed", () => {
    expect(shouldPublicTallies("live", "live", false)).toBe(true);
    expect(shouldPublicTallies("after_close", "live", true)).toBe(true);
    expect(shouldPublicTallies("after_close", "closed", false)).toBe(true);
    expect(shouldPublicTallies("after_close", "live", false)).toBe(false);
  });
});

describe("shouldWritePrivateTallies", () => {
  it("writes private Peek only for hidden live after_close", () => {
    expect(shouldWritePrivateTallies("live", "live", false)).toBe(false);
    expect(shouldWritePrivateTallies("after_close", "live", false)).toBe(true);
    expect(shouldWritePrivateTallies("after_close", "live", true)).toBe(false);
    expect(shouldWritePrivateTallies("after_close", "closed", false)).toBe(
      false,
    );
    expect(shouldWritePrivateTallies("live", "closed", false)).toBe(false);
  });
});

describe("evaluateExpireGuards", () => {
  const base = {
    activeEngagementId: "eng1",
    fromEngagementId: undefined as string | undefined,
    engStatus: "live",
    liveEndsAt: 1_000_000 as number | null,
    expectedLiveEndsAt: 1_000_000 as number | null | undefined,
    now: 1_000_000,
    controlGeneration: 3,
    expectedGeneration: undefined as number | undefined,
  };

  it("denies untimed live with any expected token (High fix)", () => {
    expect(
      evaluateExpireGuards({
        ...base,
        liveEndsAt: null,
        expectedLiveEndsAt: 1,
      }),
    ).toEqual({ result: "noop", reason: "untimed" });
  });

  it("noops on token mismatch", () => {
    expect(
      evaluateExpireGuards({
        ...base,
        expectedLiveEndsAt: 999,
      }),
    ).toEqual({ result: "noop", reason: "token_mismatch" });
  });

  it("noops when too early", () => {
    expect(
      evaluateExpireGuards({
        ...base,
        now: 999_999,
      }),
    ).toEqual({ result: "noop", reason: "too_early" });
  });

  it("proceeds when due and token matches", () => {
    expect(evaluateExpireGuards(base)).toEqual({
      result: "proceed",
      engagementId: "eng1",
    });
  });

  it("noops when expected is missing or NaN", () => {
    expect(
      evaluateExpireGuards({ ...base, expectedLiveEndsAt: null }),
    ).toEqual({ result: "noop", reason: "missing_expected" });
    expect(
      evaluateExpireGuards({ ...base, expectedLiveEndsAt: Number.NaN }),
    ).toEqual({ result: "noop", reason: "missing_expected" });
  });

  it("noops when not live", () => {
    expect(
      evaluateExpireGuards({ ...base, engStatus: "closed" }),
    ).toEqual({ result: "noop", reason: "not_live" });
    expect(evaluateExpireGuards({ ...base, engStatus: null })).toEqual({
      result: "noop",
      reason: "not_live",
    });
  });

  it("noops on generation mismatch when provided; allows omit", () => {
    expect(
      evaluateExpireGuards({
        ...base,
        expectedGeneration: 2,
      }),
    ).toEqual({ result: "noop", reason: "generation_mismatch" });
    expect(
      evaluateExpireGuards({
        ...base,
        expectedGeneration: undefined,
      }),
    ).toEqual({ result: "proceed", engagementId: "eng1" });
  });

  it("noops when fromId differs from activeId", () => {
    expect(
      evaluateExpireGuards({
        ...base,
        fromEngagementId: "other",
      }),
    ).toEqual({ result: "noop", reason: "id_mismatch" });
  });

  it("prefers control activeId and falls back to fromId", () => {
    expect(
      evaluateExpireGuards({
        ...base,
        activeEngagementId: null,
        fromEngagementId: "from-only",
      }),
    ).toEqual({ result: "proceed", engagementId: "from-only" });
    expect(
      evaluateExpireGuards({
        ...base,
        activeEngagementId: null,
        fromEngagementId: undefined,
      }),
    ).toEqual({ result: "noop", reason: "no_active" });
  });
});


describe("canAccessRoom", () => {
  it("allows public for anyone", () => {
    expect(
      canAccessRoom({
        accessMode: "public",
        isOrganizer: false,
        onAllowlist: false,
        isMember: false,
      }),
    ).toEqual({ allowed: true, needsJoinCode: false });
  });

  it("requires allowlist for allowlist mode", () => {
    expect(
      canAccessRoom({
        accessMode: "allowlist",
        isOrganizer: false,
        onAllowlist: false,
        isMember: true,
      }),
    ).toEqual({ allowed: false, needsJoinCode: false });
    expect(
      canAccessRoom({
        accessMode: "allowlist",
        isOrganizer: false,
        onAllowlist: true,
        isMember: false,
      }),
    ).toEqual({ allowed: true, needsJoinCode: false });
  });

  it("supports hybrid allowlist or code", () => {
    expect(
      canAccessRoom({
        accessMode: "hybrid",
        isOrganizer: false,
        onAllowlist: true,
        isMember: false,
      }).allowed,
    ).toBe(true);
    expect(
      canAccessRoom({
        accessMode: "hybrid",
        isOrganizer: false,
        onAllowlist: false,
        isMember: false,
      }),
    ).toEqual({ allowed: false, needsJoinCode: true });
  });

  it("always allows organizers", () => {
    expect(
      canAccessRoom({
        accessMode: "allowlist",
        isOrganizer: true,
        onAllowlist: false,
        isMember: false,
      }).allowed,
    ).toBe(true);
  });
});
