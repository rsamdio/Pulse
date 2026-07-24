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
