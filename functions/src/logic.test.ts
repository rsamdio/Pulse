import { describe, expect, it } from "vitest";
import {
  assertQuestionFields,
  assertSlug,
  canAccessRoom,
  normalizeEmail,
  normalizeSlug,
  roleFromOrganizerDoc,
} from "../src/logic";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Alex@Example.COM ")).toBe("alex@example.com");
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
