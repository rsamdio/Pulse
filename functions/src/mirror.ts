import * as admin from "firebase-admin";
import type { AccessMode } from "./logic";

const db = () => admin.firestore();
const rtdb = () => admin.database();

export async function mirrorRoomMeta(
  roomId: string,
  meta: {
    title: string;
    description?: string;
    questionsLocked: boolean;
    viewOnly: boolean;
    anonymous?: boolean;
    accessMode: AccessMode;
    organizerId: string;
  },
): Promise<void> {
  const payload = {
    ...meta,
    anonymous: Boolean(meta.anonymous),
    updatedAt: Date.now(),
  };
  try {
    await rtdb().ref(`rooms/${roomId}/meta`).set(payload);
    if (meta.accessMode === "public") {
      await rtdb().ref(`publicRoomIndex/${roomId}`).set({
        title: meta.title,
        createdAt: Date.now(),
      });
    } else {
      await rtdb().ref(`publicRoomIndex/${roomId}`).remove();
    }
  } catch (error) {
    await recordMirrorFailure("meta", roomId, error);
    throw error;
  }
}

export async function mirrorQuestion(
  roomId: string,
  questionId: string,
  question: {
    question: string;
    details: string;
    authorName: string;
    authorId: string;
    voteCount: number;
    createdAt: number;
    answered?: boolean;
    answeredAt?: number | null;
    /** When true, omit authorId from the public RTDB mirror. */
    anonymous?: boolean;
  },
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      question: question.question,
      details: question.details || "",
      authorName: question.authorName,
      voteCount: question.voteCount,
      createdAt: question.createdAt,
      answered: Boolean(question.answered),
      answeredAt: question.answeredAt ?? null,
    };
    if (!question.anonymous) {
      payload.authorId = question.authorId;
    }
    await rtdb().ref(`rooms/${roomId}/questions/${questionId}`).set(payload);
  } catch (error) {
    await recordMirrorFailure("question", `${roomId}/${questionId}`, error);
    throw error;
  }
}

export async function mirrorQuestionAnswered(
  roomId: string,
  questionId: string,
  answered: boolean,
  answeredAt: number | null,
): Promise<void> {
  try {
    await rtdb().ref(`rooms/${roomId}/questions/${questionId}`).update({
      answered,
      answeredAt,
    });
  } catch (error) {
    await recordMirrorFailure(
      "questionAnswered",
      `${roomId}/${questionId}`,
      error,
    );
    throw error;
  }
}

export async function mirrorVoteCount(
  roomId: string,
  questionId: string,
  voteCount: number,
): Promise<void> {
  try {
    await rtdb()
      .ref(`rooms/${roomId}/questions/${questionId}/voteCount`)
      .set(voteCount);
  } catch (error) {
    await recordMirrorFailure("voteCount", `${roomId}/${questionId}`, error);
    throw error;
  }
}

export async function mirrorAccess(
  uid: string,
  roomId: string,
  granted: boolean,
): Promise<void> {
  try {
    const path = `access/${uid}/${roomId}`;
    if (granted) {
      await rtdb().ref(path).set(true);
    } else {
      await rtdb().ref(path).remove();
    }
  } catch (error) {
    await recordMirrorFailure("access", `${uid}/${roomId}`, error);
    throw error;
  }
}

export async function mirrorUserVote(
  uid: string,
  roomId: string,
  questionId: string,
): Promise<void> {
  try {
    await rtdb().ref(`userVotes/${uid}/${roomId}/${questionId}`).set(true);
  } catch (error) {
    await recordMirrorFailure("userVote", `${uid}/${roomId}/${questionId}`, error);
    throw error;
  }
}

export async function clearUserVote(
  uid: string,
  roomId: string,
  questionId: string,
): Promise<void> {
  try {
    await rtdb().ref(`userVotes/${uid}/${roomId}/${questionId}`).remove();
  } catch (error) {
    await recordMirrorFailure(
      "clearUserVote",
      `${uid}/${roomId}/${questionId}`,
      error,
    );
    throw error;
  }
}

export async function removeMirroredQuestion(
  roomId: string,
  questionId: string,
): Promise<void> {
  try {
    await rtdb().ref(`rooms/${roomId}/questions/${questionId}`).remove();
  } catch (error) {
    await recordMirrorFailure("removeQuestion", `${roomId}/${questionId}`, error);
    throw error;
  }
}

export async function removeMirroredRoom(roomId: string): Promise<void> {
  try {
    await rtdb().ref(`rooms/${roomId}`).remove();
    await rtdb().ref(`publicRoomIndex/${roomId}`).remove();
  } catch (error) {
    await recordMirrorFailure("removeRoom", roomId, error);
    throw error;
  }
}

export async function clearMirroredMemberAccess(
  uid: string,
  roomId: string,
): Promise<void> {
  try {
    await rtdb().ref(`access/${uid}/${roomId}`).remove();
    await rtdb().ref(`userVotes/${uid}/${roomId}`).remove();
    await rtdb().ref(`userEngagementResponses/${uid}/${roomId}`).remove();
  } catch (error) {
    await recordMirrorFailure(
      "clearMemberAccess",
      `${uid}/${roomId}`,
      error,
    );
    // best-effort cleanup; don't fail the whole delete
  }
}

export async function mirrorEngagement(
  roomId: string,
  engagementId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await rtdb()
      .ref(`rooms/${roomId}/engagements/${engagementId}`)
      .set(payload);
  } catch (error) {
    await recordMirrorFailure(
      "engagement",
      `${roomId}/${engagementId}`,
      error,
    );
    throw error;
  }
}

export async function removeMirroredEngagement(
  roomId: string,
  engagementId: string,
): Promise<void> {
  try {
    await rtdb()
      .ref(`rooms/${roomId}/engagements/${engagementId}`)
      .remove();
  } catch (error) {
    await recordMirrorFailure(
      "removeEngagement",
      `${roomId}/${engagementId}`,
      error,
    );
    throw error;
  }
}

export async function mirrorUserEngagementResponse(
  uid: string,
  roomId: string,
  engagementId: string,
  response: { optionId?: string; text?: string },
): Promise<void> {
  try {
    await rtdb()
      .ref(`userEngagementResponses/${uid}/${roomId}/${engagementId}`)
      .set(response);
  } catch (error) {
    await recordMirrorFailure(
      "userEngagementResponse",
      `${uid}/${roomId}/${engagementId}`,
      error,
    );
    throw error;
  }
}

export async function clearUserEngagementResponse(
  uid: string,
  roomId: string,
  engagementId: string,
): Promise<void> {
  try {
    await rtdb()
      .ref(`userEngagementResponses/${uid}/${roomId}/${engagementId}`)
      .remove();
  } catch (error) {
    await recordMirrorFailure(
      "clearUserEngagementResponse",
      `${uid}/${roomId}/${engagementId}`,
      error,
    );
    throw error;
  }
}

async function recordMirrorFailure(
  kind: string,
  key: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db()
    .collection("mirrorFailures")
    .add({
      kind,
      key,
      message,
      createdAt: Date.now(),
      resolved: false,
    });
}
