import { describe, expect, it } from "vitest";
import { layoutWordCloud } from "./wordCloudLayout";

describe("layoutWordCloud", () => {
  it("returns finite in-bounds positions for sample phrases", () => {
    const items = layoutWordCloud([
      { text: "Hope", count: 12 },
      { text: "Community", count: 8 },
      { text: "Service", count: 5 },
      { text: "Joy", count: 3 },
      { text: "Learn", count: 2 },
      { text: "Lead", count: 1 },
    ]);
    expect(items).toHaveLength(6);
    for (const item of items) {
      expect(Number.isFinite(item.x)).toBe(true);
      expect(Number.isFinite(item.y)).toBe(true);
      expect(Number.isFinite(item.fontSize)).toBe(true);
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.x).toBeLessThanOrEqual(100);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeLessThanOrEqual(100);
      expect(item.fontSize).toBeGreaterThan(0);
    }
  });

  it("is deterministic for the same phrase set", () => {
    const phrases = [
      { text: "Alpha", count: 4 },
      { text: "Beta", count: 2 },
    ];
    expect(layoutWordCloud(phrases)).toEqual(layoutWordCloud(phrases));
  });

  it("returns empty for no phrases", () => {
    expect(layoutWordCloud([])).toEqual([]);
  });
});
