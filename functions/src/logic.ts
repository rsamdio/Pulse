export type AccessMode = "public" | "allowlist" | "join_code" | "hybrid";
export type UserRole = "admin" | "organizer" | "attendee";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Role priority: admin > organizer > attendee. */
export function roleFromDocs(isAdmin: boolean, isOrganizer: boolean): UserRole {
  if (isAdmin) return "admin";
  if (isOrganizer) return "organizer";
  return "attendee";
}

/** @deprecated Prefer roleFromDocs */
export function roleFromOrganizerDoc(isOrganizerDoc: boolean): UserRole {
  return isOrganizerDoc ? "organizer" : "attendee";
}

export function canAccessRoom(params: {
  accessMode: AccessMode;
  isOrganizer: boolean;
  onAllowlist: boolean;
  isMember: boolean;
}): { allowed: boolean; needsJoinCode: boolean } {
  const { accessMode, isOrganizer, onAllowlist, isMember } = params;
  if (isOrganizer) return { allowed: true, needsJoinCode: false };

  switch (accessMode) {
    case "public":
      return { allowed: true, needsJoinCode: false };
    case "allowlist":
      return { allowed: onAllowlist, needsJoinCode: false };
    case "join_code":
      if (isMember) return { allowed: true, needsJoinCode: false };
      return { allowed: false, needsJoinCode: true };
    case "hybrid":
      if (onAllowlist || isMember) return { allowed: true, needsJoinCode: false };
      return { allowed: false, needsJoinCode: true };
    default: {
      const _exhaustive: never = accessMode;
      return _exhaustive;
    }
  }
}

export const MAX_QUESTION_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 1000;
/** @deprecated Use MAX_DESCRIPTION_LENGTH */
export const MAX_DETAILS_LENGTH = MAX_DESCRIPTION_LENGTH;
export const MAX_TITLE_LENGTH = 120;
export const MAX_ROOM_DESCRIPTION_LENGTH = 2000;
export const MAX_SLUG_LENGTH = 64;
export const MAX_ALLOWLIST_EMAILS = 500;
/** 6-digit codes ≈ 900k space; uniqueness enforced via joinCodes index. */
export const JOIN_CODE_DIGITS = 6;

export const RATE_LIMIT_MS = {
  question: 3000,
  vote: 400,
  redeem: 2000,
  deleteQuestion: 800,
  setQuestionAnswered: 400,
  /** 0 = no gap; list/read callables must tolerate React Strict Mode + remounts. */
  listRooms: 0,
  listAdminDashboard: 0,
  getRoomAccess: 0,
  createRoom: 4000,
  ensureUser: 0,
  promoteUser: 1500,
  demoteUser: 1500,
  createEngagement: 2000,
  updateEngagement: 1000,
  goLiveEngagement: 1000,
  closeEngagement: 500,
  deleteEngagement: 800,
  respondEngagement: 400,
  listEngagements: 0,
  exportEngagements: 2000,
  listRoomMembers: 0,
  removeRoomMember: 800,
};

export type EngagementType = "mcq" | "open";
export type EngagementStatus = "draft" | "live" | "closed";
export type EngagementResultsVisibility = "live" | "after_close";

export const MAX_ENGAGEMENT_PROMPT = 200;
export const MAX_ENGAGEMENT_OPTIONS = 6;
export const MIN_ENGAGEMENT_OPTIONS = 2;
export const MAX_OPTION_LABEL = 80;
export const MAX_OPEN_RESPONSE = 60;
export const MAX_PHRASE_MIRROR = 40;

/** Digits only — attendees type what they see on screen. */
export function normalizeJoinCode(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export function isValidJoinCodeShape(code: string): boolean {
  return new RegExp(`^\\d{${JOIN_CODE_DIGITS}}$`).test(code);
}

/** Lowercase letters, numbers, hyphens; 3–64 chars; not starting/ending with hyphen. */
export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function assertSlug(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("Slug is required");
  }
  const slug = normalizeSlug(raw);
  if (slug.length < 3) {
    throw new Error("Slug must be at least 3 characters");
  }
  if (slug.length > MAX_SLUG_LENGTH) {
    throw new Error(`Slug must be at most ${MAX_SLUG_LENGTH} characters`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Slug may only use letters, numbers, and hyphens");
  }
  return slug;
}

export function assertRoomTitle(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Title is required");
  const title = raw.trim();
  if (!title) throw new Error("Title is required");
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`Title must be at most ${MAX_TITLE_LENGTH} characters`);
  }
  return title;
}

export function assertRoomDescription(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw !== "string") throw new Error("Invalid description");
  const description = raw.trim();
  if (description.length > MAX_ROOM_DESCRIPTION_LENGTH) {
    throw new Error(
      `Description must be at most ${MAX_ROOM_DESCRIPTION_LENGTH} characters`,
    );
  }
  return description;
}

/**
 * Question + optional description.
 * Accepts `description` or legacy `details` from clients.
 * Persists as `details` for backward-compatible RTDB/Firestore docs.
 */
export function assertQuestionFields(input: {
  question: unknown;
  description?: unknown;
  details?: unknown;
}): { question: string; details: string } {
  if (typeof input.question !== "string") {
    throw new Error("Question is required");
  }
  const question = input.question.trim();
  if (!question) throw new Error("Question is required");
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new Error(`Question must be at most ${MAX_QUESTION_LENGTH} characters`);
  }

  const raw =
    typeof input.description === "string"
      ? input.description
      : typeof input.details === "string"
        ? input.details
        : "";
  const details = raw.trim();
  if (details.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(
      `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
    );
  }

  return { question, details };
}

/** Prefix formula-like CSV cells so Excel does not execute them. */
export function sanitizeCsvCell(value: string): string {
  const trimmed = value.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${value}`;
  }
  return value;
}

/** Normalize open-text answers for aggregation (case/spacing). */
export function normalizeOpenPhrase(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function assertEngagementPrompt(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Prompt is required");
  const prompt = raw.trim();
  if (!prompt) throw new Error("Prompt is required");
  if (prompt.length > MAX_ENGAGEMENT_PROMPT) {
    throw new Error(
      `Prompt must be at most ${MAX_ENGAGEMENT_PROMPT} characters`,
    );
  }
  return prompt;
}

export function assertEngagementType(raw: unknown): EngagementType {
  if (raw === "mcq" || raw === "open") return raw;
  throw new Error("Type must be mcq or open");
}

export function assertResultsVisibility(
  raw: unknown,
): EngagementResultsVisibility {
  if (raw == null || raw === "") return "live";
  if (raw === "live" || raw === "after_close") return raw;
  throw new Error("Results visibility must be live or after_close");
}

export function assertMcqOptions(raw: unknown): { id: string; label: string }[] {
  if (!Array.isArray(raw)) throw new Error("Options are required");
  if (
    raw.length < MIN_ENGAGEMENT_OPTIONS ||
    raw.length > MAX_ENGAGEMENT_OPTIONS
  ) {
    throw new Error(
      `Provide ${MIN_ENGAGEMENT_OPTIONS}–${MAX_ENGAGEMENT_OPTIONS} options`,
    );
  }
  const options: { id: string; label: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const label =
      typeof item === "string"
        ? item.trim()
        : typeof item === "object" &&
            item &&
            typeof (item as { label?: unknown }).label === "string"
          ? String((item as { label: string }).label).trim()
          : "";
    if (!label) throw new Error(`Option ${i + 1} is empty`);
    if (label.length > MAX_OPTION_LABEL) {
      throw new Error(
        `Option ${i + 1} must be at most ${MAX_OPTION_LABEL} characters`,
      );
    }
    const key = label.toLowerCase();
    if (seen.has(key)) throw new Error("Duplicate options are not allowed");
    seen.add(key);
    options.push({ id: `opt${i + 1}`, label });
  }
  return options;
}

export function assertOpenResponse(raw: unknown): {
  text: string;
  phrase: string;
} {
  if (typeof raw !== "string") throw new Error("Response is required");
  const text = raw.trim();
  if (!text) throw new Error("Response is required");
  if (text.length > MAX_OPEN_RESPONSE) {
    throw new Error(
      `Response must be at most ${MAX_OPEN_RESPONSE} characters`,
    );
  }
  return { text, phrase: normalizeOpenPhrase(text) };
}

export function topPhrasesFromMap(
  counts: Record<string, number>,
  display: Record<string, string>,
  limit = MAX_PHRASE_MIRROR,
): { text: string; count: number }[] {
  return Object.entries(counts)
    .map(([phrase, count]) => ({
      text: display[phrase] || phrase,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, limit);
}
