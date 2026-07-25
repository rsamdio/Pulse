import type { EngagementType } from "@/lib/types";

export function isFreeTextEngagement(
  type: EngagementType,
): type is "word_cloud" | "open_text" {
  return type === "word_cloud" || type === "open_text";
}

export function engagementTypeLabel(type: EngagementType): string {
  switch (type) {
    case "mcq":
      return "Multiple choice";
    case "word_cloud":
      return "Word cloud";
    case "open_text":
      return "Short answers";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}
