"use client";

import { httpsCallable, type HttpsCallableResult } from "firebase/functions";
import { FirebaseError } from "firebase/app";
import { getFirebaseFunctions } from "@/lib/firebase/client";
import type {
  AccessibleRoomSummary,
  AccessMode,
  AdminPerson,
  AdminRoomSummary,
  EngagementDoc,
  EngagementExportRow,
  EngagementResultsVisibility,
  EngagementType,
  RoomDoc,
  RoomMemberRow,
  QuestionView,
} from "@/lib/types";

function callableErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return error.message.replace(/^Firebase:\s*/i, "").replace(/\s*\(.*\)\s*$/, "") || error.message;
  }
  if (error instanceof Error) return error.message;
  return "Request failed";
}

function call<TReq extends object | undefined, TRes>(name: string) {
  return async (data?: TReq): Promise<TRes> => {
    try {
      const fn = httpsCallable(getFirebaseFunctions(), name);
      const result: HttpsCallableResult = await fn(data ?? {});
      return result.data as TRes;
    } catch (error) {
      throw new Error(callableErrorMessage(error));
    }
  };
}

export const api = {
  listAccessibleRooms: call<undefined, { rooms: AccessibleRoomSummary[] }>(
    "listAccessibleRooms",
  ),
  createRoom: call<
    {
      title: string;
      slug: string;
      description?: string;
      accessMode: AccessMode;
      anonymous?: boolean;
      allowlistEmails?: string[];
    },
    { roomId: string; slug: string; joinCode?: string }
  >("createRoom"),
  getRoomAccess: call<
    { roomId: string },
    {
      allowed: boolean;
      needsJoinCode: boolean;
      room: RoomDoc | null;
      isOrganizer: boolean;
    }
  >("getRoomAccess"),
  redeemJoinCode: call<
    { roomId: string; code: string },
    { ok: true; roomId: string }
  >("redeemJoinCode"),
  joinByCode: call<
    { code: string },
    { ok: true; roomId: string; slug: string; title: string }
  >("joinByCode"),
  getJoinCode: call<
    { roomId: string },
    { joinCode: string | null; hasJoinCode: boolean }
  >("getJoinCode"),
  createQuestion: call<
    { roomId: string; question: string; description?: string; details?: string },
    { questionId: string }
  >("createQuestion"),
  voteQuestion: call<
    { roomId: string; questionId: string },
    { ok: true; voted: boolean; voteCount: number }
  >("voteQuestion"),
  deleteQuestion: call<
    { roomId: string; questionId: string },
    { ok: true }
  >("deleteQuestion"),
  setQuestionAnswered: call<
    { roomId: string; questionId: string; answered: boolean },
    { ok: true; answered: boolean; answeredAt: number | null }
  >("setQuestionAnswered"),
  updateRoomFlags: call<
    {
      roomId: string;
      questionsLocked?: boolean;
      viewOnly?: boolean;
      anonymous?: boolean;
      title?: string;
      description?: string;
      accessMode?: AccessMode;
    },
    { ok: true; joinCode?: string | null }
  >("updateRoomFlags"),
  setAllowlist: call<
    { roomId: string; emails: string[] },
    { ok: true; count: number }
  >("setAllowlist"),
  getAllowlist: call<{ roomId: string }, { emails: string[] }>("getAllowlist"),
  rotateJoinCode: call<{ roomId: string }, { joinCode: string }>(
    "rotateJoinCode",
  ),
  exportQuestions: call<{ roomId: string }, { questions: QuestionView[] }>(
    "exportQuestions",
  ),
  deleteRoom: call<{ roomId: string }, { ok: true }>("deleteRoom"),
  promoteUser: call<{ uid?: string; email?: string }, { ok: true; uid: string }>(
    "promoteUser",
  ),
  demoteUser: call<{ uid: string }, { ok: true }>("demoteUser"),
  listAdminDashboard: call<
    undefined,
    {
      rooms: AdminRoomSummary[];
      organizers: AdminPerson[];
      admins: AdminPerson[];
    }
  >("listAdminDashboard"),
  createEngagement: call<
    {
      roomId: string;
      type: EngagementType;
      prompt: string;
      options?: string[];
      resultsVisibility?: EngagementResultsVisibility;
      startLive?: boolean;
    },
    { engagementId: string; status: string }
  >("createEngagement"),
  updateEngagement: call<
    {
      roomId: string;
      engagementId: string;
      prompt?: string;
      options?: string[];
      resultsVisibility?: EngagementResultsVisibility;
    },
    { ok: true }
  >("updateEngagement"),
  goLiveEngagement: call<
    { roomId: string; engagementId: string },
    { ok: true; alreadyLive?: boolean }
  >("goLiveEngagement"),
  closeEngagement: call<
    { roomId: string; engagementId: string },
    { ok: true; alreadyClosed?: boolean }
  >("closeEngagement"),
  deleteEngagement: call<
    { roomId: string; engagementId: string },
    { ok: true }
  >("deleteEngagement"),
  listEngagements: call<
    { roomId: string },
    { engagements: EngagementDoc[] }
  >("listEngagements"),
  exportEngagements: call<
    { roomId: string; engagementId?: string },
    { engagements: EngagementExportRow[] }
  >("exportEngagements"),
  respondToEngagement: call<
    {
      roomId: string;
      engagementId: string;
      optionId?: string;
      text?: string;
    },
    { ok: true }
  >("respondToEngagement"),
  listRoomMembers: call<{ roomId: string }, { members: RoomMemberRow[] }>(
    "listRoomMembers",
  ),
  removeRoomMember: call<
    { roomId: string; memberUid: string },
    { ok: true }
  >("removeRoomMember"),
};
