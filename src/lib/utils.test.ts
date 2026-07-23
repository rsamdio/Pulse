import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  normalizeSlugInput,
  questionHeadline,
  questionsToCsv,
  sortQuestions,
} from "./utils";
import type { QuestionView } from "./types";

describe("normalizeEmail", () => {
  it("normalizes", () => {
    expect(normalizeEmail(" A@B.Com ")).toBe("a@b.com");
  });
});

describe("normalizeSlugInput", () => {
  it("slugifies titles", () => {
    expect(normalizeSlugInput("Town Hall 2026")).toBe("town-hall-2026");
  });
});

describe("sortQuestions", () => {
  it("sorts unanswered by votes, then answered below", () => {
    const input: QuestionView[] = [
      { id: "a", question: "a", details: "", authorName: "x", voteCount: 5, createdAt: 2, answered: true },
      { id: "b", question: "b", details: "", authorName: "y", voteCount: 3, createdAt: 9 },
      { id: "c", question: "c", details: "", authorName: "z", voteCount: 1, createdAt: 1 },
    ];
    expect(sortQuestions(input).map((q) => q.id)).toEqual(["b", "c", "a"]);
  });
});

describe("questionsToCsv", () => {
  it("includes question and description", () => {
    const csv = questionsToCsv([
      {
        id: "1",
        question: 'Hello, "world"',
        details: "outline",
        authorName: "Ada",
        voteCount: 2,
        createdAt: 0,
        answered: true,
      },
    ]);
    expect(csv.split("\n")[0]).toBe(
      "question,description,author,votes,answered,createdAt",
    );
    expect(csv).toContain('"Hello, ""world"""');
    expect(csv).toContain("outline");
    expect(csv).toContain("yes");
    expect(questionHeadline({ question: "", text: "legacy" })).toBe("legacy");
  });
});
