import { describe, expect, it } from "vitest";
import {
  assertQuestionFields,
  assertSlug,
  assertEngagementType,
  assertMcqOptions,
  assertOpenResponse,
  canAccessRoom,
  isValidJoinCodeShape,
  normalizeEmail,
  normalizeOpenPhrase,
  normalizeSlug,
  roleFromDocs,
  roleFromOrganizerDoc,
  sanitizeCsvCell,
  topPhrasesFromMap,
  assertResultsVisibility,
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
