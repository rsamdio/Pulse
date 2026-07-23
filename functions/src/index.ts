import * as admin from "firebase-admin";
import { createHash, randomBytes } from "crypto";
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import {
  assertQuestionFields,
  assertSlug,
  canAccessRoom,
  normalizeEmail,
  RATE_LIMIT_MS,
  roleFromOrganizerDoc,
  type AccessMode,
  type UserRole,
} from "./logic";
import {
  mirrorAccess,
  mirrorRoomMeta,
  mirrorQuestion,
  mirrorUserVote,
  mirrorVoteCount,
  clearUserVote,
  removeMirroredQuestion,
  mirrorQuestionAnswered,
  removeMirroredRoom,
  clearMirroredMemberAccess,
} from "./mirror";

setGlobalOptions({ region: "asia-southeast1", maxInstances: 20 });

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function requireAuth(request: CallableRequest): {
  uid: string;
  email: string;
  name: string;
} {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  const email = request.auth.token.email;
  if (!email) {
    throw new HttpsError("failed-precondition", "Verified email required");
  }
  return {
    uid: request.auth.uid,
    email: normalizeEmail(email),
    name: (request.auth.token.name as string) || email.split("@")[0] || "User",
  };
}

async function isOrganizerUid(uid: string): Promise<boolean> {
  const snap = await db.doc(`organizers/${uid}`).get();
  return snap.exists;
}

async function requireOrganizer(uid: string): Promise<void> {
  if (!(await isOrganizerUid(uid))) {
    throw new HttpsError("permission-denied", "Organizer role required");
  }
}

async function grantOrganizer(
  targetUid: string,
  meta: { email?: string; displayName?: string; grantedBy: string },
): Promise<void> {
  await db.doc(`organizers/${targetUid}`).set(
    {
      uid: targetUid,
      email: meta.email ?? null,
      displayName: meta.displayName ?? null,
      grantedBy: meta.grantedBy,
      grantedAt: Date.now(),
    },
    { merge: true },
  );
  await db.doc(`users/${targetUid}`).set(
    { role: "organizer" satisfies UserRole },
    { merge: true },
  );
}

function hashJoinCode(code: string): string {
  return createHash("sha256").update(normalizeJoinCode(code)).digest("hex");
}

/** Digits only — attendees type what they see on screen. */
function normalizeJoinCode(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/** Globally unique 6-digit code (100000–999999), indexed at joinCodes/{code}. */
async function allocateUniqueJoinCode(roomId: string): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt++) {
    const n = 100000 + (randomBytes(4).readUInt32BE(0) % 900000);
    const code = String(n);
    const ref = db.doc(`joinCodes/${code}`);
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) {
          throw new Error("taken");
        }
        tx.set(ref, { roomId, createdAt: Date.now() });
      });
      return code;
    } catch {
      // collision or contention — retry
    }
  }
  throw new HttpsError("internal", "Could not allocate a unique join code");
}

async function releaseJoinCode(code: string | null | undefined): Promise<void> {
  const normalized = code ? normalizeJoinCode(code) : "";
  if (!normalized) return;
  try {
    await db.doc(`joinCodes/${normalized}`).delete();
  } catch {
    // ignore missing
  }
}

async function assignJoinCodeToRoom(
  roomId: string,
  previousCode?: string | null,
): Promise<string> {
  const code = await allocateUniqueJoinCode(roomId);
  if (previousCode && normalizeJoinCode(previousCode) !== code) {
    await releaseJoinCode(previousCode);
  }
  await db.doc(`rooms/${roomId}`).update({
    joinCode: code,
    joinCodeHash: hashJoinCode(code),
    hasJoinCode: true,
  });
  return code;
}

async function rateLimit(
  uid: string,
  action: keyof typeof RATE_LIMIT_MS,
): Promise<void> {
  const ref = db.doc(`rateLimits/${uid}_${action}`);
  const now = Date.now();
  const minGap = RATE_LIMIT_MS[action];
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = snap.data()?.at as number | undefined;
    if (last && now - last < minGap) {
      throw new HttpsError("resource-exhausted", "Too many requests, slow down");
    }
    tx.set(ref, { at: now }, { merge: true });
  });
}

async function loadAccessContext(roomId: string, uid: string, email: string) {
  const roomRef = db.doc(`rooms/${roomId}`);
  const [roomSnap, allowSnap, memberSnap] = await Promise.all([
    roomRef.get(),
    db.doc(`roomAllowlists/${roomId}/emails/${normalizeEmail(email)}`).get(),
    db.doc(`roomMembers/${roomId}/members/${uid}`).get(),
  ]);
  if (!roomSnap.exists) {
    throw new HttpsError("not-found", "Room not found");
  }
  const room = roomSnap.data()!;
  return {
    room,
    roomRef,
    isOrganizer: room.organizerId === uid,
    onAllowlist: allowSnap.exists,
    isMember: memberSnap.exists,
    accessMode: room.accessMode as AccessMode,
  };
}

async function grantMembership(
  roomId: string,
  uid: string,
  via: "allowlist" | "code" | "organizer" | "public",
): Promise<void> {
  await db.doc(`roomMembers/${roomId}/members/${uid}`).set(
    {
      uid,
      joinedAt: Date.now(),
      via,
    },
    { merge: true },
  );
  await mirrorAccess(uid, roomId, true);
}

export const ensureUser = onCall(async (request) => {
  const { uid, email, name } = requireAuth(request);
  const userRef = db.doc(`users/${uid}`);
  const organizerRef = db.doc(`organizers/${uid}`);
  const forceSyncAllowlist = Boolean(request.data?.forceSyncAllowlist);

  const [userSnap, organizerSnapInitial] = await Promise.all([
    userRef.get(),
    organizerRef.get(),
  ]);

  let organizerSnap = organizerSnapInitial;
  const isNewUser = !userSnap.exists;

  if (!organizerSnap.exists) {
    // First-ever organizer: claim when the organizers collection is empty.
    const existingOrganizers = await db.collection("organizers").limit(1).get();
    if (existingOrganizers.empty) {
      await grantOrganizer(uid, {
        email,
        displayName: name,
        grantedBy: "bootstrap",
      });
      organizerSnap = await organizerRef.get();
    }
  }

  const role = roleFromOrganizerDoc(organizerSnap.exists);
  const profile = {
    uid,
    email,
    displayName: name,
    role,
    createdAt: userSnap.data()?.createdAt ?? Date.now(),
  };
  await userRef.set(profile, { merge: true });

  // Allowlist sync is expensive (collection group). Only on first login or explicit sync.
  if (isNewUser || forceSyncAllowlist) {
    const allowlistQuery = await db
      .collectionGroup("emails")
      .where("email", "==", email)
      .get();
    await Promise.all(
      allowlistQuery.docs.map(async (docSnap) => {
        const roomId = docSnap.ref.parent.parent?.id;
        if (!roomId) return;
        const memberRef = db.doc(`roomMembers/${roomId}/members/${uid}`);
        const memberSnap = await memberRef.get();
        if (!memberSnap.exists) {
          await grantMembership(roomId, uid, "allowlist");
        } else {
          await mirrorAccess(uid, roomId, true);
        }
      }),
    );
  }

  return profile;
});

export const listAccessibleRooms = onCall(async (request) => {
  const { uid, email } = requireAuth(request);

  type Summary = {
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
  };

  const summaries = new Map<string, Summary>();

  const toSummary = (
    id: string,
    d: admin.firestore.DocumentData,
    via: Summary["via"],
  ): Summary => ({
    id,
    slug: (d.slug as string) || id,
    title: d.title,
    description: d.description ?? "",
    accessMode: d.accessMode,
    questionsLocked: d.questionsLocked,
    viewOnly: d.viewOnly,
    anonymous: Boolean(d.anonymous),
    organizerId: d.organizerId,
    createdAt: d.createdAt,
    isOrganizer: d.organizerId === uid,
    via: d.organizerId === uid ? "organizer" : via,
  });

  const [publicSnap, myMemberships, ownedSnap, allowlistHits] = await Promise.all([
    db
      .collection("rooms")
      .where("accessMode", "==", "public")
      .where("status", "==", "open")
      .get(),
    db.collectionGroup("members").where("uid", "==", uid).get(),
    db.collection("rooms").where("organizerId", "==", uid).get(),
    db.collectionGroup("emails").where("email", "==", email).get(),
  ]);

  for (const docSnap of publicSnap.docs) {
    summaries.set(docSnap.id, toSummary(docSnap.id, docSnap.data(), "public"));
  }

  for (const docSnap of ownedSnap.docs) {
    summaries.set(docSnap.id, toSummary(docSnap.id, docSnap.data(), "organizer"));
  }

  const memberRoomIds = myMemberships.docs
    .map((d) => d.ref.parent.parent?.id)
    .filter((id): id is string => typeof id === "string" && !summaries.has(id));

  if (memberRoomIds.length) {
    const roomSnaps = await Promise.all(
      memberRoomIds.map((id) => db.doc(`rooms/${id}`).get()),
    );
    for (const roomSnap of roomSnaps) {
      if (!roomSnap.exists) continue;
      summaries.set(
        roomSnap.id,
        toSummary(roomSnap.id, roomSnap.data()!, "access"),
      );
    }
  }

  // Invited by allowlist → show in Your rooms (and grant membership).
  const allowRoomIds = [
    ...new Set(
      allowlistHits.docs
        .map((d) => d.ref.parent.parent?.id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ].filter((id) => !summaries.has(id));

  if (allowRoomIds.length) {
    await Promise.all(
      allowRoomIds.map(async (id) => {
        const memberRef = db.doc(`roomMembers/${id}/members/${uid}`);
        const memberSnap = await memberRef.get();
        if (!memberSnap.exists) {
          await grantMembership(id, uid, "allowlist");
        } else {
          await mirrorAccess(uid, id, true);
        }
      }),
    );
    const roomSnaps = await Promise.all(
      allowRoomIds.map((id) => db.doc(`rooms/${id}`).get()),
    );
    for (const roomSnap of roomSnaps) {
      if (!roomSnap.exists) continue;
      summaries.set(
        roomSnap.id,
        toSummary(roomSnap.id, roomSnap.data()!, "access"),
      );
    }
  }

  const rooms = Array.from(summaries.values()).sort(
    (a, b) => b.createdAt - a.createdAt,
  );
  return { rooms };
});

export const createRoom = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  await requireOrganizer(uid);

  let slug: string;
  try {
    slug = assertSlug(request.data?.slug);
  } catch (err) {
    throw new HttpsError(
      "invalid-argument",
      err instanceof Error ? err.message : "Invalid slug",
    );
  }

  const title = String(request.data?.title ?? "").trim();
  const description = String(request.data?.description ?? "").trim();
  const accessMode = request.data?.accessMode as AccessMode;
  const anonymous = Boolean(request.data?.anonymous);
  const allowlistEmails = (request.data?.allowlistEmails as string[] | undefined) ?? [];

  if (!title) throw new HttpsError("invalid-argument", "Title is required");
  if (!["public", "allowlist", "join_code", "hybrid"].includes(accessMode)) {
    throw new HttpsError("invalid-argument", "Invalid access mode");
  }

  const roomRef = db.collection("rooms").doc(slug);
  const existing = await roomRef.get();
  if (existing.exists) {
    throw new HttpsError("already-exists", "That slug is already taken");
  }

  const needsCode = accessMode === "join_code" || accessMode === "hybrid";
  const createdAt = Date.now();
  const room = {
    slug,
    title,
    description,
    accessMode,
    questionsLocked: false,
    viewOnly: false,
    anonymous,
    organizerId: uid,
    createdAt,
    status: "open" as const,
    joinCode: null as string | null,
    joinCodeHash: null as string | null,
    hasJoinCode: false,
  };

  await roomRef.set(room);

  let joinCode: string | undefined;
  if (needsCode) {
    joinCode = await assignJoinCodeToRoom(slug, null);
  }

  if (accessMode === "allowlist" || accessMode === "hybrid") {
    const batch = db.batch();
    for (const raw of allowlistEmails) {
      const normalized = normalizeEmail(raw);
      if (!normalized) continue;
      const emailRef = db.doc(
        `roomAllowlists/${slug}/emails/${normalized}`,
      );
      batch.set(emailRef, {
        email: normalized,
        addedBy: uid,
        addedAt: Date.now(),
      });
    }
    await batch.commit();
  }

  await grantMembership(slug, uid, "organizer");
  await mirrorRoomMeta(slug, {
    title,
    description,
    questionsLocked: false,
    viewOnly: false,
    anonymous,
    accessMode,
    organizerId: uid,
  });

  if (allowlistEmails.length) {
    for (const raw of allowlistEmails) {
      const normalized = normalizeEmail(raw);
      if (!normalized || normalized === email) continue;
      const users = await db
        .collection("users")
        .where("email", "==", normalized)
        .limit(1)
        .get();
      if (!users.empty) {
        await grantMembership(slug, users.docs[0]!.id, "allowlist");
      }
    }
  }

  return {
    roomId: slug,
    slug,
    joinCode: needsCode ? joinCode : undefined,
  };
});

export const getRoomAccess = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "");
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");

  const ctx = await loadAccessContext(roomId, uid, email);
  const decision = canAccessRoom({
    accessMode: ctx.accessMode,
    isOrganizer: ctx.isOrganizer,
    onAllowlist: ctx.onAllowlist,
    isMember: ctx.isMember,
  });

  if (decision.allowed && !ctx.isMember) {
    const via =
      ctx.accessMode === "public"
        ? "public"
        : ctx.onAllowlist
          ? "allowlist"
          : "organizer";
    await grantMembership(roomId, uid, via === "organizer" && ctx.isOrganizer ? "organizer" : via);
  }

  const d = ctx.room;
  return {
    allowed: decision.allowed,
    needsJoinCode: decision.needsJoinCode && !decision.allowed,
    isOrganizer: ctx.isOrganizer,
    room: decision.allowed || decision.needsJoinCode
      ? {
          id: roomId,
          slug: (d.slug as string) || roomId,
          title: d.title,
          description: d.description ?? "",
          accessMode: d.accessMode,
          questionsLocked: d.questionsLocked,
          viewOnly: d.viewOnly,
          anonymous: Boolean(d.anonymous),
          organizerId: d.organizerId,
          createdAt: d.createdAt,
          status: d.status,
          hasJoinCode: Boolean(d.hasJoinCode),
        }
      : null,
  };
});

export const redeemJoinCode = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "");
  const code = normalizeJoinCode(String(request.data?.code ?? ""));
  if (!roomId || !code) {
    throw new HttpsError("invalid-argument", "roomId and code required");
  }
  await rateLimit(uid, "redeem");

  const ctx = await loadAccessContext(roomId, uid, email);
  if (ctx.accessMode !== "join_code" && ctx.accessMode !== "hybrid") {
    throw new HttpsError("failed-precondition", "Room does not accept join codes");
  }
  if (ctx.isMember || ctx.isOrganizer || (ctx.accessMode === "hybrid" && ctx.onAllowlist)) {
    await grantMembership(roomId, uid, ctx.onAllowlist ? "allowlist" : "code");
    return { ok: true as const, roomId };
  }

  const stored = normalizeJoinCode(String(ctx.room.joinCode ?? ""));
  const expectedHash = ctx.room.joinCodeHash as string | null;
  const matches =
    (stored && stored === code) ||
    (expectedHash && hashJoinCode(code) === expectedHash);
  if (!matches) {
    throw new HttpsError("permission-denied", "Invalid join code");
  }

  await grantMembership(roomId, uid, "code");
  return { ok: true as const, roomId };
});

/** Global join: code only → resolve room + grant access. */
export const joinByCode = onCall(async (request) => {
  const { uid } = requireAuth(request);
  const code = normalizeJoinCode(String(request.data?.code ?? ""));
  if (code.length < 6) {
    throw new HttpsError("invalid-argument", "Enter the 6-digit join code");
  }
  await rateLimit(uid, "redeem");

  const indexSnap = await db.doc(`joinCodes/${code}`).get();
  if (!indexSnap.exists) {
    throw new HttpsError("not-found", "No room found for that code");
  }
  const roomId = String(indexSnap.data()?.roomId ?? "");
  if (!roomId) {
    throw new HttpsError("not-found", "No room found for that code");
  }

  const roomSnap = await db.doc(`rooms/${roomId}`).get();
  if (!roomSnap.exists) {
    throw new HttpsError("not-found", "Room no longer exists");
  }
  const room = roomSnap.data()!;
  if (room.accessMode !== "join_code" && room.accessMode !== "hybrid") {
    throw new HttpsError("failed-precondition", "This room no longer accepts join codes");
  }

  await grantMembership(roomId, uid, "code");
  return {
    ok: true as const,
    roomId,
    slug: (room.slug as string) || roomId,
    title: room.title as string,
  };
});

/** Organizer-only: always-available join code (migrates legacy hash-only rooms). */
export const getJoinCode = onCall(async (request) => {
  const { uid } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "");
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");

  const roomRef = db.doc(`rooms/${roomId}`);
  const snap = await roomRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Room not found");
  const room = snap.data()!;
  if (room.organizerId !== uid) {
    throw new HttpsError("permission-denied", "Only the organizer can view the join code");
  }

  const mode = room.accessMode as AccessMode;
  if (mode !== "join_code" && mode !== "hybrid") {
    return { joinCode: null as string | null, hasJoinCode: false };
  }

  const existing = normalizeJoinCode(String(room.joinCode ?? ""));
  if (existing.length >= 6) {
    // Ensure global index exists (self-heal).
    const idx = await db.doc(`joinCodes/${existing}`).get();
    if (!idx.exists) {
      await db.doc(`joinCodes/${existing}`).set({
        roomId,
        createdAt: Date.now(),
      });
    }
    return { joinCode: existing, hasJoinCode: true };
  }

  // Legacy / missing plaintext — allocate a fresh numeric code.
  const joinCode = await assignJoinCodeToRoom(
    roomId,
    room.joinCode as string | null,
  );
  return { joinCode, hasJoinCode: true };
});

export const createQuestion = onCall(async (request) => {
  const { uid, email, name } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "");
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");
  let fields: { question: string; details: string };
  try {
    fields = assertQuestionFields({
      question: request.data?.question ?? request.data?.text,
      description: request.data?.description,
      details: request.data?.details,
    });
  } catch (err) {
    throw new HttpsError(
      "invalid-argument",
      err instanceof Error ? err.message : "Invalid question",
    );
  }
  await rateLimit(uid, "question");

  const ctx = await loadAccessContext(roomId, uid, email);
  const decision = canAccessRoom({
    accessMode: ctx.accessMode,
    isOrganizer: ctx.isOrganizer,
    onAllowlist: ctx.onAllowlist,
    isMember: ctx.isMember,
  });
  if (!decision.allowed) {
    throw new HttpsError("permission-denied", "No access to this room");
  }
  if (!ctx.isOrganizer) {
    if (ctx.room.viewOnly) {
      throw new HttpsError("failed-precondition", "Room is view-only");
    }
    if (ctx.room.questionsLocked) {
      throw new HttpsError("failed-precondition", "New questions are locked");
    }
  }

  const questionRef = db.collection(`questions/${roomId}/items`).doc();
  const createdAt = Date.now();
  const displayName = Boolean(ctx.room.anonymous) ? "Anonymous" : name;
  const question = {
    question: fields.question,
    details: fields.details,
    authorId: uid,
    authorName: displayName,
    voteCount: 0,
    answered: false,
    answeredAt: null as number | null,
    createdAt,
  };
  await questionRef.set(question);
  await mirrorQuestion(roomId, questionRef.id, question);
  return { questionId: questionRef.id };
});

export const voteQuestion = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "");
  const questionId = String(request.data?.questionId ?? "");
  if (!roomId || !questionId) {
    throw new HttpsError("invalid-argument", "roomId and questionId required");
  }
  await rateLimit(uid, "vote");

  const ctx = await loadAccessContext(roomId, uid, email);
  const decision = canAccessRoom({
    accessMode: ctx.accessMode,
    isOrganizer: ctx.isOrganizer,
    onAllowlist: ctx.onAllowlist,
    isMember: ctx.isMember,
  });
  if (!decision.allowed) {
    throw new HttpsError("permission-denied", "No access to this room");
  }
  if (ctx.room.viewOnly && !ctx.isOrganizer) {
    throw new HttpsError("failed-precondition", "Room is view-only");
  }

  const questionRef = db.doc(`questions/${roomId}/items/${questionId}`);
  // Must be an even number of path segments (collection/doc pairs).
  const voteRef = db.doc(`votes/${roomId}/questions/${questionId}/users/${uid}`);

  let newCount = 0;
  let voted = false;
  await db.runTransaction(async (tx) => {
    const voteSnap = await tx.get(voteRef);
    const qSnap = await tx.get(questionRef);
    if (!qSnap.exists) {
      throw new HttpsError("not-found", "Question not found");
    }
    const current = (qSnap.data()?.voteCount as number | undefined) ?? 0;
    if (voteSnap.exists) {
      newCount = Math.max(0, current - 1);
      tx.delete(voteRef);
      tx.update(questionRef, { voteCount: newCount });
      voted = false;
    } else {
      newCount = current + 1;
      tx.set(voteRef, { createdAt: Date.now(), uid });
      tx.update(questionRef, { voteCount: newCount });
      voted = true;
    }
  });

  await mirrorVoteCount(roomId, questionId, newCount);
  if (voted) {
    await mirrorUserVote(uid, roomId, questionId);
  } else {
    await clearUserVote(uid, roomId, questionId);
  }
  return { ok: true as const, voted, voteCount: newCount };
});

export const deleteQuestion = onCall(async (request) => {
  const { uid } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "");
  const questionId = String(request.data?.questionId ?? "");
  if (!roomId || !questionId) {
    throw new HttpsError("invalid-argument", "roomId and questionId required");
  }
  await rateLimit(uid, "deleteQuestion");

  const roomRef = db.doc(`rooms/${roomId}`);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    throw new HttpsError("not-found", "Room not found");
  }
  if (roomSnap.data()?.organizerId !== uid) {
    throw new HttpsError(
      "permission-denied",
      "Only the room organizer can delete questions",
    );
  }

  const questionRef = db.doc(`questions/${roomId}/items/${questionId}`);
  const questionSnap = await questionRef.get();
  if (!questionSnap.exists) {
    throw new HttpsError("not-found", "Question not found");
  }

  // Remove vote ledger docs under this question (batched).
  const votesCol = db.collection(
    `votes/${roomId}/questions/${questionId}/users`,
  );
  const voteDocs = await votesCol.get();
  const batch = db.batch();
  voteDocs.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(questionRef);
  // Also remove the empty parent path markers if any — Firestore has no empty parents.
  const questionVotesMeta = db.doc(`votes/${roomId}/questions/${questionId}`);
  batch.delete(questionVotesMeta);
  await batch.commit();

  await removeMirroredQuestion(roomId, questionId);
  return { ok: true as const };
});

/** Organizer marks a question answered (or clears that mark). Stays on the board. */
export const setQuestionAnswered = onCall(async (request) => {
  const { uid } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "");
  const questionId = String(request.data?.questionId ?? "");
  const answered = Boolean(request.data?.answered);
  if (!roomId || !questionId) {
    throw new HttpsError("invalid-argument", "roomId and questionId required");
  }
  await rateLimit(uid, "setQuestionAnswered");

  const roomSnap = await db.doc(`rooms/${roomId}`).get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found");
  if (roomSnap.data()?.organizerId !== uid) {
    throw new HttpsError(
      "permission-denied",
      "Only the room organizer can mark questions answered",
    );
  }

  const questionRef = db.doc(`questions/${roomId}/items/${questionId}`);
  const questionSnap = await questionRef.get();
  if (!questionSnap.exists) {
    throw new HttpsError("not-found", "Question not found");
  }

  const answeredAt = answered ? Date.now() : null;
  await questionRef.update({ answered, answeredAt });
  await mirrorQuestionAnswered(roomId, questionId, answered, answeredAt);
  return { ok: true as const, answered, answeredAt };
});

export const updateRoomFlags = onCall(async (request) => {
  const { uid } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "");
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");

  const roomRef = db.doc(`rooms/${roomId}`);
  const snap = await roomRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Room not found");
  const room = snap.data()!;
  if (room.organizerId !== uid) {
    throw new HttpsError("permission-denied", "Only the organizer can manage this room");
  }

  const patch: Record<string, unknown> = {};
  if (typeof request.data?.questionsLocked === "boolean") {
    patch.questionsLocked = request.data.questionsLocked;
  }
  if (typeof request.data?.viewOnly === "boolean") {
    patch.viewOnly = request.data.viewOnly;
  }
  if (typeof request.data?.anonymous === "boolean") {
    patch.anonymous = request.data.anonymous;
  }
  if (typeof request.data?.title === "string" && request.data.title.trim()) {
    patch.title = request.data.title.trim();
  }
  if (typeof request.data?.description === "string") {
    patch.description = request.data.description.trim();
  }
  if (
    request.data?.accessMode &&
    ["public", "allowlist", "join_code", "hybrid"].includes(request.data.accessMode)
  ) {
    patch.accessMode = request.data.accessMode;
  }

  const nextMode = (patch.accessMode as AccessMode | undefined) ?? (room.accessMode as AccessMode);
  const needsCode = nextMode === "join_code" || nextMode === "hybrid";
  const hadCode = Boolean(room.joinCode || room.hasJoinCode);

  await roomRef.update(patch);
  let issuedCode: string | undefined;

  if (needsCode && !normalizeJoinCode(String(room.joinCode ?? ""))) {
    issuedCode = await assignJoinCodeToRoom(roomId, room.joinCode as string | null);
  } else if (!needsCode && hadCode) {
    await releaseJoinCode(room.joinCode as string | null);
    await roomRef.update({
      joinCode: null,
      joinCodeHash: null,
      hasJoinCode: false,
    });
  }

  const nextSnap = await roomRef.get();
  const next = nextSnap.data()!;
  await mirrorRoomMeta(roomId, {
    title: next.title,
    description: next.description ?? "",
    questionsLocked: next.questionsLocked,
    viewOnly: next.viewOnly,
    anonymous: Boolean(next.anonymous),
    accessMode: next.accessMode,
    organizerId: next.organizerId,
  });
  return {
    ok: true as const,
    joinCode: issuedCode ?? (needsCode ? normalizeJoinCode(String(next.joinCode ?? "")) || null : null),
  };
});

export const setAllowlist = onCall(async (request) => {
  const { uid } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "");
  const emails = (request.data?.emails as string[] | undefined) ?? [];
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");

  const roomSnap = await db.doc(`rooms/${roomId}`).get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found");
  if (roomSnap.data()!.organizerId !== uid) {
    throw new HttpsError("permission-denied", "Only the organizer can edit allowlist");
  }

  const col = db.collection(`roomAllowlists/${roomId}/emails`);
  const existing = await col.get();
  const batch = db.batch();
  existing.docs.forEach((d) => batch.delete(d.ref));
  const normalized = Array.from(
    new Set(emails.map(normalizeEmail).filter(Boolean)),
  );
  for (const email of normalized) {
    batch.set(col.doc(email), {
      email,
      addedBy: uid,
      addedAt: Date.now(),
    });
  }
  await batch.commit();

  for (const email of normalized) {
    const users = await db.collection("users").where("email", "==", email).limit(1).get();
    if (!users.empty) {
      await grantMembership(roomId, users.docs[0]!.id, "allowlist");
    }
  }

  return { ok: true as const, count: normalized.length };
});

export const getAllowlist = onCall(async (request) => {
  const { uid } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "");
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");
  const roomSnap = await db.doc(`rooms/${roomId}`).get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found");
  if (roomSnap.data()!.organizerId !== uid) {
    throw new HttpsError("permission-denied", "Only the organizer can view allowlist");
  }
  const snap = await db.collection(`roomAllowlists/${roomId}/emails`).get();
  return {
    emails: snap.docs.map((d) => d.data().email as string).sort(),
  };
});

export const rotateJoinCode = onCall(async (request) => {
  const { uid } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "");
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");
  const roomRef = db.doc(`rooms/${roomId}`);
  const snap = await roomRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Room not found");
  const room = snap.data()!;
  if (room.organizerId !== uid) {
    throw new HttpsError("permission-denied", "Only the organizer can rotate join code");
  }
  const mode = room.accessMode as AccessMode;
  if (mode !== "join_code" && mode !== "hybrid") {
    throw new HttpsError("failed-precondition", "Enable join code or hybrid access first");
  }
  const joinCode = await assignJoinCodeToRoom(
    roomId,
    room.joinCode as string | null,
  );
  return { joinCode };
});

export const exportQuestions = onCall(async (request) => {
  const { uid } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "");
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");
  const roomSnap = await db.doc(`rooms/${roomId}`).get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found");
  if (roomSnap.data()!.organizerId !== uid) {
    throw new HttpsError("permission-denied", "Only organizers can export");
  }
  const snap = await db.collection(`questions/${roomId}/items`).get();
  const questions = snap.docs
    .map((d) => {
      const data = d.data();
      const questionText =
        (data.question as string) || (data.text as string) || "";
      return {
        id: d.id,
        question: questionText,
        details: (data.details as string) || "",
        authorName: data.authorName as string,
        voteCount: data.voteCount as number,
        createdAt: data.createdAt as number,
        answered: Boolean(data.answered),
        answeredAt: (data.answeredAt as number | null) ?? null,
      };
    })
    .sort((a, b) => b.voteCount - a.voteCount || a.createdAt - b.createdAt);
  return { questions };
});

export const promoteUser = onCall(async (request) => {
  const { uid } = requireAuth(request);
  await requireOrganizer(uid);

  const targetUid = String(request.data?.uid ?? "").trim();
  const targetEmail = normalizeEmail(String(request.data?.email ?? ""));

  let resolvedUid = targetUid;
  let resolvedEmail = targetEmail;
  let displayName: string | undefined;

  if (!resolvedUid) {
    if (!targetEmail) {
      throw new HttpsError("invalid-argument", "uid or email required");
    }
    const users = await db
      .collection("users")
      .where("email", "==", targetEmail)
      .limit(1)
      .get();
    if (users.empty) {
      throw new HttpsError("not-found", "User has not signed in yet");
    }
    resolvedUid = users.docs[0]!.id;
    resolvedEmail = (users.docs[0]!.data().email as string) || targetEmail;
    displayName = users.docs[0]!.data().displayName as string | undefined;
  } else {
    const userSnap = await db.doc(`users/${resolvedUid}`).get();
    if (userSnap.exists) {
      resolvedEmail =
        (userSnap.data()?.email as string) || resolvedEmail || "";
      displayName = userSnap.data()?.displayName as string | undefined;
    }
  }

  await grantOrganizer(resolvedUid, {
    email: resolvedEmail || undefined,
    displayName,
    grantedBy: uid,
  });
  return { ok: true as const, uid: resolvedUid };
});

export const demoteUser = onCall(async (request) => {
  const { uid } = requireAuth(request);
  await requireOrganizer(uid);
  const targetUid = String(request.data?.uid ?? "").trim();
  if (!targetUid) {
    throw new HttpsError("invalid-argument", "uid required");
  }
  if (targetUid === uid) {
    throw new HttpsError("failed-precondition", "Cannot demote yourself");
  }
  await db.doc(`organizers/${targetUid}`).delete();
  await db.doc(`users/${targetUid}`).set({ role: "attendee" }, { merge: true });
  return { ok: true as const };
});

async function deleteQueryInBatches(
  query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>,
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const snap = await query.limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 400) break;
  }
  return deleted;
}

/** Organizer permanently deletes a room and related Firestore/RTDB data. */
export const deleteRoom = onCall(async (request) => {
  const { uid } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");

  const roomRef = db.doc(`rooms/${roomId}`);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found");
  const room = roomSnap.data()!;
  if (room.organizerId !== uid) {
    throw new HttpsError(
      "permission-denied",
      "Only the room organizer can delete this room",
    );
  }

  const memberSnap = await db.collection(`roomMembers/${roomId}/members`).get();
  const memberUids = memberSnap.docs.map((d) => d.id);
  if (!memberUids.includes(uid)) memberUids.push(uid);

  // Votes: for each question, delete vote users then the question vote meta.
  const questionSnaps = await db.collection(`questions/${roomId}/items`).get();
  for (const qDoc of questionSnaps.docs) {
    await deleteQueryInBatches(
      db.collection(`votes/${roomId}/questions/${qDoc.id}/users`),
    );
    try {
      await db.doc(`votes/${roomId}/questions/${qDoc.id}`).delete();
    } catch {
      // may not exist
    }
  }

  await deleteQueryInBatches(db.collection(`questions/${roomId}/items`));
  await deleteQueryInBatches(
    db.collection(`roomAllowlists/${roomId}/emails`),
  );
  await deleteQueryInBatches(db.collection(`roomMembers/${roomId}/members`));

  await releaseJoinCode(room.joinCode as string | null | undefined);
  await roomRef.delete();

  await removeMirroredRoom(roomId);
  await Promise.all(
    memberUids.map((memberUid) =>
      clearMirroredMemberAccess(memberUid, roomId),
    ),
  );

  return { ok: true as const };
});
