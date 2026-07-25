export type UserRole = "admin" | "organizer" | "attendee";

export type AccessMode = "public" | "allowlist" | "join_code" | "hybrid";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: number;
}

/** Firestore `rooms/{slug}` + Callable payloads. Document id === slug. */
export interface RoomDoc {
  id: string;
  slug: string;
  title: string;
  description: string;
  accessMode: AccessMode;
  questionsLocked: boolean;
  viewOnly: boolean;
  /** When true, question authors are shown as Anonymous. */
  anonymous: boolean;
  organizerId: string;
  createdAt: number;
  status: "open" | "ended";
  hasJoinCode?: boolean;
}

/** RTDB `rooms/{slug}/meta` - hot-path room flags only. */
export interface RoomMetaRtdb {
  title: string;
  description?: string;
  questionsLocked: boolean;
  viewOnly: boolean;
  anonymous?: boolean;
  accessMode: AccessMode;
  organizerId: string;
  updatedAt: number;
}

/**
 * RTDB `rooms/{slug}/questions/{questionId}`
 * Firestore `questions/{roomId}/items/{questionId}`
 */
export interface QuestionRtdb {
  question: string;
  details: string;
  /** Legacy field from early schema; prefer `question`. */
  text?: string;
  authorName: string;
  authorId?: string;
  voteCount: number;
  createdAt: number;
  answered?: boolean;
  answeredAt?: number | null;
}

export interface QuestionView extends QuestionRtdb {
  id: string;
  hasVoted?: boolean;
}

export interface AccessibleRoomSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  accessMode: AccessMode;
  questionsLocked: boolean;
  viewOnly: boolean;
  anonymous: boolean;
  organizerId: string;
  createdAt: number;
  isOrganizer: boolean;
  via: "public" | "access" | "organizer";
}

export interface AdminPerson {
  uid: string;
  email: string;
  displayName: string;
  grantedAt: number;
  grantedBy: string;
}

export interface AdminRoomSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  accessMode: AccessMode;
  questionsLocked: boolean;
  viewOnly: boolean;
  anonymous: boolean;
  organizerId: string;
  organizerEmail: string;
  organizerName: string;
  createdAt: number;
  status: string;
  questionCount: number;
  memberCount: number;
  voteTotal: number;
}

export type EngagementType = "mcq" | "word_cloud" | "open_text";
export type EngagementStatus = "draft" | "live" | "closed";
export type EngagementResultsVisibility = "live" | "after_close";

/** Engage control state machine phase (mirrored to public RTDB). */
export type EngagePhase = "idle" | "live" | "grace" | "held";

export interface EngagementOption {
  id: string;
  label: string;
}

/** RTDB `rooms/{slug}/engagements/{id}` (live/closed only; drafts are Firestore-only). */
export interface EngagementRtdb {
  type: EngagementType;
  prompt: string;
  status: EngagementStatus;
  resultsVisibility?: EngagementResultsVisibility;
  resultsRevealed?: boolean;
  revision?: number;
  sortOrder?: number;
  durationSec?: number | null;
  autoAdvance?: boolean;
  liveEndsAt?: number | null;
  liveStartedAt?: number | null;
  options?: EngagementOption[];
  optionCounts?: Record<string, number>;
  phrases?: { text: string; count: number }[];
  responseCount: number;
  createdAt: number;
  closedAt?: number | null;
  createdBy?: string;
}

export interface EngagementView extends EngagementRtdb {
  id: string;
  myOptionId?: string | null;
  myText?: string | null;
}

/** Organizer list/export payload (includes drafts). */
export interface EngagementDoc {
  id: string;
  type: EngagementType;
  prompt: string;
  status: EngagementStatus;
  resultsVisibility: EngagementResultsVisibility;
  resultsRevealed?: boolean;
  revision?: number;
  sortOrder?: number;
  durationSec?: number | null;
  autoAdvance?: boolean;
  liveEndsAt?: number | null;
  liveStartedAt?: number | null;
  options: EngagementOption[];
  optionCounts: Record<string, number>;
  phrases: { text: string; count: number }[];
  responseCount: number;
  createdAt: number;
  closedAt: number | null;
  createdBy: string;
}

/** RTDB `rooms/{slug}/engageControl` (public; drives Present + host grace UI). */
export interface EngageControlRtdb {
  phase: EngagePhase;
  advanceAt: number | null;
  generation: number;
  activeEngagementId: string | null;
  reservedNextId: string | null;
}

/** RTDB `rooms/{slug}/private/draftQueue/{id}` (organizer + admin only). */
export interface DraftQueueEntry {
  prompt: string;
  type: EngagementType;
  sortOrder: number;
  durationSec?: number | null;
  autoAdvance?: boolean;
  resultsVisibility?: EngagementResultsVisibility;
}

/** Private Peek tallies from RTDB `rooms/{slug}/private/engagementResults/{id}`. */
export interface PrivateEngagementResult {
  optionCounts?: Record<string, number>;
  phrases?: { text: string; count: number }[];
}

export interface EngagementExportRow extends EngagementDoc {
  responses: {
    respondentLabel: string;
    optionId: string | null;
    text: string | null;
    createdAt: number;
    updatedAt: number;
  }[];
}

export type RoomMemberVia = "allowlist" | "code" | "organizer" | "public";

export interface RoomMemberRow {
  uid: string;
  displayName: string;
  email: string;
  via: RoomMemberVia;
  joinedAt: number;
  isOrganizer: boolean;
}
