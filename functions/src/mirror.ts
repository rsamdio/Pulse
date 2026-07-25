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

/** Mirror super-admin flag for RTDB private-subtree reads. */
export async function mirrorPlatformAdmin(
  uid: string,
  isAdmin: boolean,
): Promise<void> {
  try {
    const path = `platformAdmins/${uid}`;
    if (isAdmin) {
      await rtdb().ref(path).set(true);
    } else {
      await rtdb().ref(path).remove();
    }
  } catch (error) {
    await recordMirrorFailure("platformAdmin", uid, error);
    throw error;
  }
}

/**
 * Lifecycle mirror: full public .set with revision guard, plus private tallies.
 * privateTallies null => remove private/engagementResults/{eid}.
 * No-ops the public write when current.revision > incoming.revision.
 */
export async function mirrorEngagementLifecycle(
  roomId: string,
  engagementId: string,
  publicPayload: Record<string, unknown>,
  privateTallies: Record<string, unknown> | null,
): Promise<void> {
  try {
    const incomingRevision = Number(publicPayload.revision ?? 0);
    const publicRef = rtdb().ref(
      `rooms/${roomId}/engagements/${engagementId}`,
    );
    const result = await publicRef.transaction((current) => {
      if (
        current != null &&
        typeof current === "object" &&
        Number((current as { revision?: unknown }).revision ?? 0) >
          incomingRevision
      ) {
        return; // abort — keep newer revision
      }
      return publicPayload;
    });
    if (!result.committed) {
      // Newer public revision won. Never resurrect Peek tallies, but still
      // honor a clear so reveal/close cannot leave private data behind.
      const privatePath = `rooms/${roomId}/private/engagementResults/${engagementId}`;
      if (privateTallies === null) {
        await rtdb().ref(privatePath).remove();
      }
      return;
    }

    const updates: Record<string, unknown> = {};
    const privatePath = `rooms/${roomId}/private/engagementResults/${engagementId}`;
    if (privateTallies === null) {
      updates[privatePath] = null;
    } else {
      updates[privatePath] = privateTallies;
    }
    await rtdb().ref().update(updates);
  } catch (error) {
    await recordMirrorFailure(
      "engagementLifecycle",
      `${roomId}/${engagementId}`,
      error,
    );
    throw error;
  }
}

/**
 * Hot-path response mirror: field-scoped multipath update.
 * Never writes resultsRevealed. publicTallies/privateTallies null = skip those leaves.
 */
export async function mirrorEngagementResponseUpdate(
  roomId: string,
  engagementId: string,
  uid: string,
  opts: {
    responseCount: number;
    publicTallies: Record<string, unknown> | null;
    privateTallies: Record<string, unknown> | null;
    userResponse: { optionId?: string; text?: string };
  },
): Promise<void> {
  try {
    const updates: Record<string, unknown> = {
      [`rooms/${roomId}/engagements/${engagementId}/responseCount`]:
        opts.responseCount,
      [`userEngagementResponses/${uid}/${roomId}/${engagementId}`]:
        opts.userResponse,
    };
    if (opts.publicTallies) {
      for (const [key, value] of Object.entries(opts.publicTallies)) {
        updates[`rooms/${roomId}/engagements/${engagementId}/${key}`] = value;
      }
    }
    if (opts.privateTallies) {
      for (const [key, value] of Object.entries(opts.privateTallies)) {
        updates[
          `rooms/${roomId}/private/engagementResults/${engagementId}/${key}`
        ] = value;
      }
    }
    await rtdb().ref().update(updates);
  } catch (error) {
    await recordMirrorFailure(
      "engagementResponseUpdate",
      `${roomId}/${engagementId}`,
      error,
    );
    throw error;
  }
}

/** @deprecated Prefer mirrorEngagementLifecycle; thin wrapper for transition. */
export async function mirrorEngagement(
  roomId: string,
  engagementId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await mirrorEngagementLifecycle(roomId, engagementId, payload, null);
}

export async function removeMirroredEngagement(
  roomId: string,
  engagementId: string,
): Promise<void> {
  try {
    const updates: Record<string, unknown> = {
      [`rooms/${roomId}/engagements/${engagementId}`]: null,
      [`rooms/${roomId}/private/engagementResults/${engagementId}`]: null,
    };
    await rtdb().ref().update(updates);
  } catch (error) {
    await recordMirrorFailure(
      "removeEngagement",
      `${roomId}/${engagementId}`,
      error,
    );
    throw error;
  }
}

/**
 * Public engage control mirror for Present/host grace freeze.
 * Only the fields needed to drive countdowns/phase transitions are exposed.
 */
export async function mirrorEngageControl(
  roomId: string,
  control: {
    phase: string;
    advanceAt: number | null;
    generation: number;
    activeEngagementId: string | null;
    reservedNextId: string | null;
  },
): Promise<void> {
  try {
    await rtdb().ref(`rooms/${roomId}/engageControl`).set({
      phase: control.phase,
      advanceAt: control.advanceAt ?? null,
      generation: control.generation,
      activeEngagementId: control.activeEngagementId ?? null,
      reservedNextId: control.reservedNextId ?? null,
    });
  } catch (error) {
    await recordMirrorFailure("engageControl", roomId, error);
    throw error;
  }
}

/** Mirror draft queue under private/draftQueue (organizer + admin only). */
export async function mirrorDraftQueue(
  roomId: string,
  queue: Record<string, unknown> | null,
): Promise<void> {
  try {
    const path = `rooms/${roomId}/private/draftQueue`;
    if (queue === null) {
      await rtdb().ref(path).remove();
    } else {
      await rtdb().ref(path).set(queue);
    }
  } catch (error) {
    await recordMirrorFailure("draftQueue", roomId, error);
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
