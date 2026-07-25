export type WordCloudPhrase = {
  text: string;
  count: number;
};

export type WordCloudItem = {
  text: string;
  count: number;
  x: number; // 0–100 percent of container width (center)
  y: number; // 0–100 percent of container height (center)
  fontSize: number; // rem
  weight: "normal" | "semibold" | "bold";
};

/** Deterministic 32-bit hash for stable layouts across clients. */
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

type Box = { x: number; y: number; w: number; h: number };

function overlaps(a: Box, b: Box, pad: number): boolean {
  return !(
    a.x + a.w / 2 + pad < b.x - b.w / 2 ||
    a.x - a.w / 2 - pad > b.x + b.w / 2 ||
    a.y + a.h / 2 + pad < b.y - b.h / 2 ||
    a.y - a.h / 2 - pad > b.y + b.h / 2
  );
}

/**
 * Spiral + collision layout for word-cloud phrases.
 * Coordinates are percentages so the cloud scales with its container.
 */
export function layoutWordCloud(
  phrases: WordCloudPhrase[],
  options?: { width?: number; height?: number },
): WordCloudItem[] {
  const width = options?.width ?? 640;
  const height = options?.height ?? 280;
  const sorted = [...phrases].sort(
    (a, b) => b.count - a.count || a.text.localeCompare(b.text),
  );
  if (sorted.length === 0) return [];

  const maxCount = Math.max(1, ...sorted.map((p) => p.count));
  const placed: WordCloudItem[] = [];
  const boxes: Box[] = [];
  const seed = hashString(sorted.map((p) => `${p.text}:${p.count}`).join("|"));
  const rand = mulberry32(seed);

  for (const phrase of sorted) {
    const rank = phrase.count / maxCount;
    const fontSize = Math.min(1.85, 0.85 + rank * 1.05);
    const weight: WordCloudItem["weight"] =
      rank >= 0.75 ? "bold" : rank >= 0.4 ? "semibold" : "normal";

    // Approximate glyph box in layout pixels (container coords).
    const charW = fontSize * 9.2;
    const boxW = Math.max(36, phrase.text.length * charW);
    const boxH = fontSize * 22;

    let found = false;
    let x = width / 2;
    let y = height / 2;
    const angleStep = 0.35 + rand() * 0.15;
    const radiusStep = 4 + rand() * 3;

    for (let i = 0; i < 220; i++) {
      const angle = i * angleStep;
      const radius = i * radiusStep * 0.55;
      const cx = width / 2 + Math.cos(angle) * radius * (0.85 + rand() * 0.3);
      const cy = height / 2 + Math.sin(angle) * radius * 0.55;
      const candidate: Box = { x: cx, y: cy, w: boxW, h: boxH };
      const inBounds =
        cx - boxW / 2 >= 8 &&
        cx + boxW / 2 <= width - 8 &&
        cy - boxH / 2 >= 8 &&
        cy + boxH / 2 <= height - 8;
      if (!inBounds) continue;
      if (boxes.some((b) => overlaps(candidate, b, 4))) continue;
      x = cx;
      y = cy;
      found = true;
      boxes.push(candidate);
      break;
    }

    if (!found) {
      // Fallback: tuck near edge with slight jitter so we still show the word.
      x = 40 + rand() * (width - 80);
      y = 30 + rand() * (height - 60);
      boxes.push({ x, y, w: boxW * 0.7, h: boxH * 0.7 });
    }

    placed.push({
      text: phrase.text,
      count: phrase.count,
      x: (x / width) * 100,
      y: (y / height) * 100,
      fontSize,
      weight,
    });
  }

  return placed;
}
