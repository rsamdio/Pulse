import * as admin from "firebase-admin";
import { getFunctions } from "firebase-admin/functions";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { setGlobalOptions } from "firebase-functions/v2";
import {
  assertAutoAdvance,
  assertDurationSec,
  assertEngagementPrompt,
  assertEngagementType,
  assertMcqOptions,
  assertOpenResponse,
  assertResultsVisibility,
  assertQuestionFields,
  assertRoomDescription,
  assertRoomTitle,
  assertSlug,
  canAccessRoom,
  engagementSortOrder,
  GRACE_MS,
  isValidJoinCodeShape,
  JOIN_CODE_DIGITS,
  MAX_ALLOWLIST_EMAILS,
  MAX_ENGAGEMENT_DRAFTS,
  nextDraftId,
  normalizeEmail,
  normalizeJoinCode,
  RATE_LIMIT_MS,
  roleFromDocs,
  evaluateExpireGuards,
  shouldPublicTallies,
  shouldWritePrivateTallies,
  topPhrasesFromMap,
  type AccessMode,
  type EngagePhase,
  type EngagementResultsVisibility,
  type EngagementStatus,
  type EngagementType,
  type ExpireNoopReason,
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
  mirrorPlatformAdmin,
  mirrorEngagementLifecycle,
  mirrorEngagementResponseUpdate,
  removeMirroredEngagement,
  mirrorDraftQueue,
  mirrorEngageControl,
  clearUserEngagementResponse,
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
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("failed-precondition", "Verified email required");
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

async function isAdminUid(uid: string): Promise<boolean> {
  const snap = await db.doc(`admins/${uid}`).get();
  return snap.exists;
}

async function isOrganizerUid(uid: string): Promise<boolean> {
  if (await isAdminUid(uid)) return true;
  const snap = await db.doc(`organizers/${uid}`).get();
  return snap.exists;
}

async function requireOrganizer(uid: string): Promise<void> {
  if (!(await isOrganizerUid(uid))) {
    throw new HttpsError("permission-denied", "Organizer role required");
  }
}

async function requireAdmin(uid: string): Promise<void> {
  if (!(await isAdminUid(uid))) {
    throw new HttpsError("permission-denied", "Super admin required");
  }
}

async function grantAdmin(
  targetUid: string,
  meta: { email?: string; displayName?: string; grantedBy: string },
): Promise<void> {
  await db.doc(`admins/${targetUid}`).set(
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
    { role: "admin" satisfies UserRole },
    { merge: true },
  );
  await mirrorPlatformAdmin(targetUid, true);
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
  const adminSnap = await db.doc(`admins/${targetUid}`).get();
  if (!adminSnap.exists) {
    await db.doc(`users/${targetUid}`).set(
      { role: "organizer" satisfies UserRole },
      { merge: true },
    );
  }
}

function hashJoinCode(code: string): string {
  return createHash("sha256").update(normalizeJoinCode(code)).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function safeEqualDigits(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Globally unique join code, indexed at joinCodes/{code}. */
async function allocateUniqueJoinCode(roomId: string): Promise<string> {
  const min = 10 ** (JOIN_CODE_DIGITS - 1);
  const span = 9 * 10 ** (JOIN_CODE_DIGITS - 1);
  for (let attempt = 0; attempt < 32; attempt++) {
    const n = min + (randomBytes(4).readUInt32BE(0) % span);
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
  const minGap = RATE_LIMIT_MS[action];
  if (minGap <= 0) return;

  const ref = db.doc(`rateLimits/${uid}_${action}`);
  const now = Date.now();
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
  const [roomSnap, allowSnap, memberSnap, admin] = await Promise.all([
    roomRef.get(),
    db.doc(`roomAllowlists/${roomId}/emails/${normalizeEmail(email)}`).get(),
    db.doc(`roomMembers/${roomId}/members/${uid}`).get(),
    isAdminUid(uid),
  ]);
  if (!roomSnap.exists) {
    throw new HttpsError("not-found", "Room not found");
  }
  const room = roomSnap.data()!;
  return {
    room,
    roomRef,
    isOrganizer: room.organizerId === uid || admin,
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
  await Promise.all([
    db.doc(`roomMembers/${roomId}/members/${uid}`).set(
      {
        uid,
        joinedAt: Date.now(),
        via,
      },
      { merge: true },
    ),
    mirrorAccess(uid, roomId, true),
  ]);
}

async function revokeMembership(roomId: string, memberUid: string): Promise<void> {
  await Promise.all([
    db.doc(`roomMembers/${roomId}/members/${memberUid}`).delete(),
    clearMirroredMemberAccess(memberUid, roomId),
  ]);
}

/** Drop sticky public memberships when a room is no longer public. */
async function revokePublicViaMembers(
  roomId: string,
  organizerId: string,
): Promise<void> {
  const members = await db.collection(`roomMembers/${roomId}/members`).get();
  await Promise.all(
    members.docs.map(async (docSnap) => {
      if (docSnap.id === organizerId) return;
      if (docSnap.data()?.via !== "public") return;
      await revokeMembership(roomId, docSnap.id);
    }),
  );
}

/** After allowlist replace, revoke allowlist members whose email is no longer listed. */
async function revokeStaleAllowlistMembers(
  roomId: string,
  organizerId: string,
  allowedEmails: Set<string>,
): Promise<void> {
  const members = await db.collection(`roomMembers/${roomId}/members`).get();
  await Promise.all(
    members.docs.map(async (docSnap) => {
      if (docSnap.id === organizerId) return;
      if (docSnap.data()?.via !== "allowlist") return;
      const userSnap = await db.doc(`users/${docSnap.id}`).get();
      const email = normalizeEmail(String(userSnap.data()?.email ?? ""));
      if (!email || !allowedEmails.has(email)) {
        await revokeMembership(roomId, docSnap.id);
      }
    }),
  );
}

export const ensureUser = onCall(async (request) => {
  const { uid, email, name } = requireAuth(request);
  await rateLimit(uid, "ensureUser");
  const userRef = db.doc(`users/${uid}`);
  const organizerRef = db.doc(`organizers/${uid}`);
  const adminRef = db.doc(`admins/${uid}`);
  const forceSyncAllowlist = Boolean(request.data?.forceSyncAllowlist);

  const [userSnap, organizerSnapInitial, adminSnapInitial] = await Promise.all([
    userRef.get(),
    organizerRef.get(),
    adminRef.get(),
  ]);

  let organizerSnap = organizerSnapInitial;
  let adminSnap = adminSnapInitial;
  const isNewUser = !userSnap.exists;

  // First account ever: transactional bootstrap → super admin + organizer.
  if (isNewUser && !organizerSnap.exists && !adminSnap.exists) {
    const lockRef = db.doc("system/bootstrap");
    try {
      await lockRef.create({
        adminUid: uid,
        email,
        createdAt: Date.now(),
      });
      await grantAdmin(uid, {
        email,
        displayName: name,
        grantedBy: "bootstrap",
      });
      await grantOrganizer(uid, {
        email,
        displayName: name,
        grantedBy: "bootstrap",
      });
      adminSnap = await adminRef.get();
      organizerSnap = await organizerRef.get();
    } catch {
      // Another signup won the bootstrap race — continue as attendee.
    }
  }

  const role = roleFromDocs(adminSnap.exists, organizerSnap.exists);
  const profile = {
    uid,
    email,
    displayName: name,
    role,
    createdAt: userSnap.data()?.createdAt ?? Date.now(),
  };
  await userRef.set(profile, { merge: true });

  // Self-heal RTDB platformAdmins (set when admin, clear when not).
  try {
    await mirrorPlatformAdmin(uid, adminSnap.exists);
  } catch {
    // best-effort; private Peek may fail until next ensureUser
  }

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
  await rateLimit(uid, "listRooms");

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

  // Invited by allowlist → show in Your rooms (read-only; membership on enter).
  const allowRoomIds = [
    ...new Set(
      allowlistHits.docs
        .map((d) => d.ref.parent.parent?.id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ].filter((id) => !summaries.has(id));

  if (allowRoomIds.length) {
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
  await rateLimit(uid, "createRoom");

  let slug: string;
  try {
    slug = assertSlug(request.data?.slug);
  } catch (err) {
    throw new HttpsError(
      "invalid-argument",
      err instanceof Error ? err.message : "Invalid slug",
    );
  }

  let title: string;
  let description: string;
  try {
    title = assertRoomTitle(request.data?.title);
    description = assertRoomDescription(request.data?.description);
  } catch (err) {
    throw new HttpsError(
      "invalid-argument",
      err instanceof Error ? err.message : "Invalid room fields",
    );
  }
  const accessMode = request.data?.accessMode as AccessMode;
  const anonymous = Boolean(request.data?.anonymous);
  const allowlistEmails = (request.data?.allowlistEmails as string[] | undefined) ?? [];

  if (!["public", "allowlist", "join_code", "hybrid"].includes(accessMode)) {
    throw new HttpsError("invalid-argument", "Invalid access mode");
  }
  if (allowlistEmails.length > MAX_ALLOWLIST_EMAILS) {
    throw new HttpsError(
      "invalid-argument",
      `Allowlist supports at most ${MAX_ALLOWLIST_EMAILS} emails`,
    );
  }

  const roomRef = db.collection("rooms").doc(slug);
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

  try {
    await roomRef.create(room);
  } catch {
    throw new HttpsError("already-exists", "That slug is already taken");
  }

  let joinCode: string | undefined;
  if (needsCode) {
    joinCode = await assignJoinCodeToRoom(slug, null);
  }

  const normalizedAllow = Array.from(
    new Set(allowlistEmails.map(normalizeEmail).filter(Boolean)),
  ).slice(0, MAX_ALLOWLIST_EMAILS);

  if (accessMode === "allowlist" || accessMode === "hybrid") {
    const batch = db.batch();
    for (const normalized of normalizedAllow) {
      const emailRef = db.doc(`roomAllowlists/${slug}/emails/${normalized}`);
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

  for (const normalized of normalizedAllow) {
    if (normalized === email) continue;
    const users = await db
      .collection("users")
      .where("email", "==", normalized)
      .limit(1)
      .get();
    if (!users.empty) {
      await grantMembership(slug, users.docs[0]!.id, "allowlist");
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
  await rateLimit(uid, "getRoomAccess");

  const ctx = await loadAccessContext(roomId, uid, email);
  const decision = canAccessRoom({
    accessMode: ctx.accessMode,
    isOrganizer: ctx.isOrganizer,
    onAllowlist: ctx.onAllowlist,
    isMember: ctx.isMember,
  });

  // Public rooms: RTDB rules already allow reads — do not sticky-grant membership.
  if (
    decision.allowed &&
    !ctx.isMember &&
    ctx.accessMode !== "public"
  ) {
    const via = ctx.onAllowlist
      ? "allowlist"
      : ctx.isOrganizer
        ? "organizer"
        : "code";
    await grantMembership(
      roomId,
      uid,
      via === "organizer" && ctx.isOrganizer ? "organizer" : via,
    );
  }

  const needsCodeGate = decision.needsJoinCode && !decision.allowed;
  const d = ctx.room;

  // Before join code: only minimal metadata (no description / organizerId).
  if (needsCodeGate) {
    return {
      allowed: false,
      needsJoinCode: true,
      isOrganizer: false,
      room: {
        id: roomId,
        slug: (d.slug as string) || roomId,
        title: d.title,
        description: "",
        accessMode: d.accessMode,
        questionsLocked: Boolean(d.questionsLocked),
        viewOnly: Boolean(d.viewOnly),
        anonymous: Boolean(d.anonymous),
        organizerId: "",
        createdAt: d.createdAt,
        status: d.status,
        hasJoinCode: true,
      },
    };
  }

  if (!decision.allowed) {
    // Uniform denial (avoid existence oracle vs allowlist).
    throw new HttpsError("not-found", "Room not found");
  }

  return {
    allowed: true,
    needsJoinCode: false,
    isOrganizer: ctx.isOrganizer,
    room: {
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
    },
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

  if (!isValidJoinCodeShape(code)) {
    throw new HttpsError("permission-denied", "Invalid join code");
  }
  const stored = normalizeJoinCode(String(ctx.room.joinCode ?? ""));
  const expectedHash = String(ctx.room.joinCodeHash ?? "");
  const matches =
    (stored && safeEqualDigits(stored, code)) ||
    (expectedHash && safeEqualHex(hashJoinCode(code), expectedHash));
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
  if (!isValidJoinCodeShape(code)) {
    throw new HttpsError(
      "invalid-argument",
      `Enter the ${JOIN_CODE_DIGITS}-digit join code`,
    );
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

  const stored = normalizeJoinCode(String(room.joinCode ?? ""));
  const expectedHash = String(room.joinCodeHash ?? "");
  const matches =
    (stored && safeEqualDigits(stored, code)) ||
    (expectedHash && safeEqualHex(hashJoinCode(code), expectedHash));
  if (!matches) {
    // Stale index entry after rotate/release failure — do not grant.
    throw new HttpsError("not-found", "No room found for that code");
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
  await mirrorQuestion(roomId, questionRef.id, {
    ...question,
    anonymous: Boolean(ctx.room.anonymous),
  });
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

  await Promise.all([
    mirrorVoteCount(roomId, questionId, newCount),
    voted
      ? mirrorUserVote(uid, roomId, questionId)
      : clearUserVote(uid, roomId, questionId),
  ]);
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
    try {
      patch.title = assertRoomTitle(request.data.title);
    } catch (err) {
      throw new HttpsError(
        "invalid-argument",
        err instanceof Error ? err.message : "Invalid title",
      );
    }
  }
  if (typeof request.data?.description === "string") {
    try {
      patch.description = assertRoomDescription(request.data.description);
    } catch (err) {
      throw new HttpsError(
        "invalid-argument",
        err instanceof Error ? err.message : "Invalid description",
      );
    }
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

  const prevMode = room.accessMode as AccessMode;
  if (prevMode === "public" && nextMode !== "public") {
    await revokePublicViaMembers(roomId, room.organizerId as string);
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
  if (emails.length > MAX_ALLOWLIST_EMAILS) {
    throw new HttpsError(
      "invalid-argument",
      `Allowlist supports at most ${MAX_ALLOWLIST_EMAILS} emails`,
    );
  }

  const roomSnap = await db.doc(`rooms/${roomId}`).get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found");
  const room = roomSnap.data()!;
  if (room.organizerId !== uid) {
    throw new HttpsError("permission-denied", "Only the organizer can edit allowlist");
  }

  const col = db.collection(`roomAllowlists/${roomId}/emails`);
  const existing = await col.get();
  const batch = db.batch();
  existing.docs.forEach((d) => batch.delete(d.ref));
  const normalized = Array.from(
    new Set(emails.map(normalizeEmail).filter(Boolean)),
  ).slice(0, MAX_ALLOWLIST_EMAILS);
  for (const email of normalized) {
    batch.set(col.doc(email), {
      email,
      addedBy: uid,
      addedAt: Date.now(),
    });
  }
  await batch.commit();

  const allowed = new Set(normalized);
  await revokeStaleAllowlistMembers(roomId, room.organizerId as string, allowed);

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

export const listRoomMembers = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");
  await rateLimit(uid, "listRoomMembers");

  const ctx = await loadAccessContext(roomId, uid, email);
  if (!ctx.isOrganizer) {
    throw new HttpsError("permission-denied", "Only the organizer can list members");
  }

  const snap = await db.collection(`roomMembers/${roomId}/members`).get();
  const organizerId = String(ctx.room.organizerId ?? "");
  const members = await Promise.all(
    snap.docs.map(async (docSnap) => {
      const data = docSnap.data();
      const memberUid = docSnap.id;
      const userSnap = await db.doc(`users/${memberUid}`).get();
      const user = userSnap.data() ?? {};
      const viaRaw = String(data.via ?? "code");
      const via =
        viaRaw === "allowlist" ||
        viaRaw === "code" ||
        viaRaw === "organizer" ||
        viaRaw === "public"
          ? viaRaw
          : "code";
      return {
        uid: memberUid,
        displayName: String(user.displayName ?? "").trim() || "Member",
        email: String(user.email ?? "").trim().toLowerCase(),
        via: via as "allowlist" | "code" | "organizer" | "public",
        joinedAt: Number(data.joinedAt ?? 0),
        isOrganizer: memberUid === organizerId,
      };
    }),
  );

  members.sort((a, b) => {
    if (a.isOrganizer !== b.isOrganizer) return a.isOrganizer ? -1 : 1;
    return a.joinedAt - b.joinedAt;
  });

  return { members };
});

export const removeRoomMember = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  const memberUid = String(request.data?.memberUid ?? "").trim();
  if (!roomId || !memberUid) {
    throw new HttpsError("invalid-argument", "roomId and memberUid required");
  }
  await rateLimit(uid, "removeRoomMember");

  const ctx = await loadAccessContext(roomId, uid, email);
  if (!ctx.isOrganizer) {
    throw new HttpsError("permission-denied", "Only the organizer can remove members");
  }

  const organizerId = String(ctx.room.organizerId ?? "");
  if (memberUid === organizerId) {
    throw new HttpsError("failed-precondition", "Cannot remove the room organizer");
  }

  const memberRef = db.doc(`roomMembers/${roomId}/members/${memberUid}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    throw new HttpsError("not-found", "Member not found");
  }

  await revokeMembership(roomId, memberUid);
  return { ok: true as const };
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
  await requireAdmin(uid);
  await rateLimit(uid, "promoteUser");

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
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User has not signed in yet");
    }
    resolvedEmail =
      (userSnap.data()?.email as string) || resolvedEmail || "";
    displayName = userSnap.data()?.displayName as string | undefined;
  }

  if (await isAdminUid(resolvedUid)) {
    throw new HttpsError("failed-precondition", "User is already a super admin");
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
  await requireAdmin(uid);
  await rateLimit(uid, "demoteUser");
  const targetUid = String(request.data?.uid ?? "").trim();
  if (!targetUid) {
    throw new HttpsError("invalid-argument", "uid required");
  }
  if (targetUid === uid) {
    throw new HttpsError("failed-precondition", "Cannot demote yourself");
  }
  if (await isAdminUid(targetUid)) {
    throw new HttpsError("failed-precondition", "Cannot demote a super admin");
  }
  await db.doc(`organizers/${targetUid}`).delete();
  await db.doc(`users/${targetUid}`).set({ role: "attendee" }, { merge: true });
  return { ok: true as const };
});

/** Super-admin overview: every room + organizer roster. */
export const listAdminDashboard = onCall(async (request) => {
  const { uid } = requireAuth(request);
  await requireAdmin(uid);
  await rateLimit(uid, "listAdminDashboard");

  const [roomsSnap, organizersSnap, adminsSnap] = await Promise.all([
    db.collection("rooms").orderBy("createdAt", "desc").limit(300).get(),
    db.collection("organizers").get(),
    db.collection("admins").get(),
  ]);

  const adminUids = new Set(adminsSnap.docs.map((d) => d.id));
  const organizerByUid = new Map(
    organizersSnap.docs.map((d) => [d.id, d.data()] as const),
  );

  const rooms = await Promise.all(
    roomsSnap.docs.map(async (docSnap) => {
      const d = docSnap.data();
      const organizerId = String(d.organizerId ?? "");
      const orgMeta = organizerByUid.get(organizerId);
      const userSnap = orgMeta
        ? null
        : organizerId
          ? await db.doc(`users/${organizerId}`).get()
          : null;
      const [questionsSnap, membersSnap] = await Promise.all([
        db.collection(`questions/${docSnap.id}/items`).get(),
        db.collection(`roomMembers/${docSnap.id}/members`).select().get(),
      ]);
      let voteTotal = 0;
      for (const q of questionsSnap.docs) {
        voteTotal += Number(q.data().voteCount ?? 0);
      }
      return {
        id: docSnap.id,
        slug: String(d.slug ?? docSnap.id),
        title: String(d.title ?? docSnap.id),
        description: String(d.description ?? ""),
        accessMode: d.accessMode as AccessMode,
        questionsLocked: Boolean(d.questionsLocked),
        viewOnly: Boolean(d.viewOnly),
        anonymous: Boolean(d.anonymous),
        organizerId,
        organizerEmail:
          (orgMeta?.email as string | undefined) ||
          (userSnap?.data()?.email as string | undefined) ||
          "",
        organizerName:
          (orgMeta?.displayName as string | undefined) ||
          (userSnap?.data()?.displayName as string | undefined) ||
          "",
        createdAt: Number(d.createdAt ?? 0),
        status: (d.status as string) || "open",
        questionCount: questionsSnap.size,
        memberCount: membersSnap.size,
        voteTotal,
      };
    }),
  );

  const organizers = organizersSnap.docs
    .filter((d) => !adminUids.has(d.id))
    .map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        email: String(data.email ?? ""),
        displayName: String(data.displayName ?? ""),
        grantedAt: Number(data.grantedAt ?? 0),
        grantedBy: String(data.grantedBy ?? ""),
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  const admins = adminsSnap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      email: String(data.email ?? ""),
      displayName: String(data.displayName ?? ""),
      grantedAt: Number(data.grantedAt ?? 0),
      grantedBy: String(data.grantedBy ?? ""),
    };
  });

  return { rooms, organizers, admins };
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

type EngageControlDoc = {
  generation: number;
  phase: EngagePhase;
  activeEngagementId: string | null;
  reservedNextId: string | null;
  liveEndsAt: number | null;
  advanceAt: number | null;
  queueVersion: number;
};

function defaultEngageControl(): EngageControlDoc {
  return {
    generation: 0,
    phase: "idle",
    activeEngagementId: null,
    reservedNextId: null,
    liveEndsAt: null,
    advanceAt: null,
    queueVersion: 0,
  };
}

function nextRevision(data: FirebaseFirestore.DocumentData): number {
  return Number(data.revision ?? 0) + 1;
}

function engagementMirrorPayload(
  data: FirebaseFirestore.DocumentData,
): Record<string, unknown> {
  const type = data.type as EngagementType;
  const status = data.status as EngagementStatus;
  const resultsVisibility =
    (data.resultsVisibility as EngagementResultsVisibility) || "live";
  const resultsRevealed = Boolean(data.resultsRevealed);
  const payload: Record<string, unknown> = {
    type,
    prompt: data.prompt,
    status,
    resultsVisibility,
    resultsRevealed,
    revision: Number(data.revision ?? 0),
    sortOrder: engagementSortOrder(data),
    durationSec: data.durationSec ?? null,
    autoAdvance: Boolean(data.autoAdvance),
    liveEndsAt: data.liveEndsAt ?? null,
    liveStartedAt: data.liveStartedAt ?? null,
    responseCount: Number(data.responseCount ?? 0),
    createdAt: Number(data.createdAt ?? 0),
    closedAt: data.closedAt ?? null,
    createdBy: data.createdBy,
  };
  if (type === "mcq") {
    payload.options = data.options ?? [];
  }
  if (shouldPublicTallies(resultsVisibility, status, resultsRevealed)) {
    if (type === "mcq") {
      payload.optionCounts = data.optionCounts ?? {};
    } else {
      payload.phrases = data.phrases ?? [];
    }
  } else if (type === "mcq") {
    payload.optionCounts = {};
  } else {
    payload.phrases = [];
  }
  return payload;
}

/** Private Peek tallies while live + after_close + not revealed. */
function privateTalliesPayload(
  data: FirebaseFirestore.DocumentData,
): Record<string, unknown> | null {
  const status = String(data.status ?? "");
  const visibility = String(data.resultsVisibility ?? "live");
  const revealed = Boolean(data.resultsRevealed);
  if (!shouldWritePrivateTallies(visibility, status, revealed)) {
    return null;
  }
  const type = data.type as EngagementType;
  if (type === "mcq") {
    return { optionCounts: data.optionCounts ?? {} };
  }
  return { phrases: data.phrases ?? [] };
}

function serializeEngagementDoc(
  id: string,
  data: FirebaseFirestore.DocumentData,
) {
  return {
    id,
    type: data.type as EngagementType,
    prompt: String(data.prompt ?? ""),
    status: data.status as EngagementStatus,
    resultsVisibility:
      (data.resultsVisibility as EngagementResultsVisibility) || "live",
    resultsRevealed: Boolean(data.resultsRevealed),
    revision: Number(data.revision ?? 0),
    sortOrder: engagementSortOrder(data),
    durationSec: (data.durationSec as number | null) ?? null,
    autoAdvance: Boolean(data.autoAdvance),
    liveEndsAt: (data.liveEndsAt as number | null) ?? null,
    liveStartedAt: (data.liveStartedAt as number | null) ?? null,
    options: (data.options as { id: string; label: string }[]) ?? [],
    optionCounts: (data.optionCounts as Record<string, number>) ?? {},
    phrases: (data.phrases as { text: string; count: number }[]) ?? [],
    responseCount: Number(data.responseCount ?? 0),
    createdAt: Number(data.createdAt ?? 0),
    closedAt: (data.closedAt as number | null) ?? null,
    createdBy: String(data.createdBy ?? ""),
  };
}

async function mirrorEngagementDoc(
  roomId: string,
  engagementId: string,
  data: FirebaseFirestore.DocumentData,
): Promise<void> {
  await mirrorEngagementLifecycle(
    roomId,
    engagementId,
    engagementMirrorPayload(data),
    privateTalliesPayload(data),
  );
}

async function buildAndMirrorDraftQueue(roomId: string): Promise<void> {
  const snap = await db
    .collection(`engagements/${roomId}/items`)
    .where("status", "==", "draft")
    .get();
  if (snap.empty) {
    await mirrorDraftQueue(roomId, null);
    return;
  }
  const queue: Record<string, unknown> = {};
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    queue[docSnap.id] = {
      prompt: data.prompt,
      type: data.type,
      sortOrder: engagementSortOrder(data),
      durationSec: data.durationSec ?? null,
      autoAdvance: Boolean(data.autoAdvance),
      resultsVisibility: data.resultsVisibility || "live",
    };
  }
  await mirrorDraftQueue(roomId, queue);
}

async function enqueueExpireEngagementTask(payload: {
  roomId: string;
  engagementId: string;
  expectedLiveEndsAt: number;
  expectedGeneration: number;
}): Promise<void> {
  try {
    const queue = getFunctions().taskQueue<{
      roomId: string;
      engagementId: string;
      expectedLiveEndsAt: number;
      expectedGeneration: number;
    }>("locations/asia-southeast1/functions/expireEngagementTask");
    await queue.enqueue(payload, {
      scheduleTime: new Date(payload.expectedLiveEndsAt),
      id: `expire-${payload.roomId}-${payload.engagementId}-${payload.expectedLiveEndsAt}`,
    });
  } catch (err) {
    console.error("Failed to enqueue expireEngagementTask", err);
    // Host/Present timer still works; do not fail go-live.
  }
}

type DraftRow = {
  id: string;
  ref: FirebaseFirestore.DocumentReference;
  data: FirebaseFirestore.DocumentData;
  sortOrder: number;
  createdAt: number;
};

async function loadDraftRowsInTx(
  tx: FirebaseFirestore.Transaction,
  roomId: string,
): Promise<DraftRow[]> {
  const snap = await tx.get(
    db.collection(`engagements/${roomId}/items`).where("status", "==", "draft"),
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ref: d.ref,
      data,
      sortOrder: engagementSortOrder(data),
      createdAt: Number(data.createdAt ?? 0),
    };
  });
}

/**
 * Shared expire / advance / complete-grace state machine.
 * Writes Firestore + returns mirror jobs for the caller.
 */
async function expireOrAdvanceEngagement(
  roomId: string,
  opts: {
    kind: "manual" | "expire" | "completeGrace";
    expectedLiveEndsAt?: number | null;
    expectedGeneration?: number;
    fromEngagementId?: string;
  },
): Promise<{
  alreadyAdvanced: boolean;
  noopReason?: ExpireNoopReason;
  control: EngageControlDoc;
  mirrorJobs: { id: string; data: FirebaseFirestore.DocumentData }[];
  enqueueExpire: {
    engagementId: string;
    liveEndsAt: number;
    generation: number;
  } | null;
}> {
  const controlRef = db.doc(`engageControl/${roomId}`);
  const mirrorJobs: { id: string; data: FirebaseFirestore.DocumentData }[] = [];
  let enqueueExpire: {
    engagementId: string;
    liveEndsAt: number;
    generation: number;
  } | null = null;
  let alreadyAdvanced = false;
  let noopReason: ExpireNoopReason | undefined;
  let controlOut = defaultEngageControl();

  await db.runTransaction(async (tx) => {
    mirrorJobs.length = 0;
    enqueueExpire = null;
    alreadyAdvanced = false;
    noopReason = undefined;
    const controlSnap = await tx.get(controlRef);
    const control: EngageControlDoc = {
      ...defaultEngageControl(),
      ...(controlSnap.data() as Partial<EngageControlDoc> | undefined),
    };
    controlOut = { ...control };
    const now = Date.now();
    const drafts = await loadDraftRowsInTx(tx, roomId);

    const closeEngagementInTx = (
      engId: string,
      engRef: FirebaseFirestore.DocumentReference,
      engData: FirebaseFirestore.DocumentData,
    ): FirebaseFirestore.DocumentData => {
      const closedAt = now;
      const next = {
        ...engData,
        status: "closed" as const,
        resultsRevealed: true,
        closedAt,
        revision: nextRevision(engData),
        liveEndsAt: engData.liveEndsAt ?? null,
      };
      tx.update(engRef, {
        status: "closed",
        resultsRevealed: true,
        closedAt,
        revision: next.revision,
      });
      mirrorJobs.push({ id: engId, data: next });
      return next;
    };

    const promoteDraftInTx = (
      draft: DraftRow,
      generation: number,
    ): {
      next: FirebaseFirestore.DocumentData;
      liveEndsAt: number | null;
    } => {
      const liveStartedAt = now;
      const durationSec =
        typeof draft.data.durationSec === "number"
          ? draft.data.durationSec
          : null;
      const liveEndsAt =
        durationSec != null ? liveStartedAt + durationSec * 1000 : null;
      const next = {
        ...draft.data,
        status: "live" as const,
        resultsRevealed: false,
        closedAt: null,
        liveStartedAt,
        liveEndsAt,
        revision: nextRevision(draft.data),
        sortOrder: draft.sortOrder,
      };
      tx.update(draft.ref, {
        status: "live",
        resultsRevealed: false,
        closedAt: null,
        liveStartedAt,
        liveEndsAt,
        revision: next.revision,
        sortOrder: draft.sortOrder,
      });
      mirrorJobs.push({ id: draft.id, data: next });
      if (liveEndsAt != null) {
        enqueueExpire = {
          engagementId: draft.id,
          liveEndsAt,
          generation,
        };
      }
      return { next, liveEndsAt };
    };

    if (opts.kind === "completeGrace") {
      if (
        control.phase !== "grace" ||
        (opts.expectedGeneration != null &&
          opts.expectedGeneration !== control.generation) ||
        control.advanceAt == null ||
        now < control.advanceAt
      ) {
        alreadyAdvanced = true;
        controlOut = control;
        return;
      }
      const reservedId = control.reservedNextId;
      const draft = drafts.find((d) => d.id === reservedId) ?? null;
      if (!draft) {
        const nextControl: EngageControlDoc = {
          ...control,
          generation: control.generation + 1,
          phase: "idle",
          activeEngagementId: null,
          reservedNextId: null,
          liveEndsAt: null,
          advanceAt: null,
          queueVersion: control.queueVersion + 1,
        };
        tx.set(controlRef, nextControl);
        controlOut = nextControl;
        return;
      }
      const generation = control.generation + 1;
      const { liveEndsAt } = promoteDraftInTx(draft, generation);
      const nextControl: EngageControlDoc = {
        generation,
        phase: "live",
        activeEngagementId: draft.id,
        reservedNextId: null,
        liveEndsAt,
        advanceAt: null,
        queueVersion: control.queueVersion + 1,
      };
      tx.set(controlRef, nextControl);
      controlOut = nextControl;
      return;
    }

    if (opts.kind === "expire") {
      // Resolve target without loading: prefer control.active as source of truth.
      const fromId = opts.fromEngagementId?.trim() || "";
      const controlActive = control.activeEngagementId?.trim() || "";
      if (fromId && controlActive && fromId !== controlActive) {
        alreadyAdvanced = true;
        noopReason = "id_mismatch";
        return;
      }
      const candidateId = controlActive || fromId || null;
      if (!candidateId) {
        alreadyAdvanced = true;
        noopReason = "no_active";
        return;
      }

      const engRef = db.doc(`engagements/${roomId}/items/${candidateId}`);
      const engSnap = await tx.get(engRef);
      const engData = engSnap.exists ? engSnap.data()! : null;
      const liveEndsAt = engData
        ? ((engData.liveEndsAt as number | null) ?? null)
        : null;

      const guard = evaluateExpireGuards({
        activeEngagementId: control.activeEngagementId,
        fromEngagementId: opts.fromEngagementId,
        engStatus: engData ? String(engData.status ?? "") : null,
        liveEndsAt,
        expectedLiveEndsAt: opts.expectedLiveEndsAt,
        now,
        controlGeneration: control.generation,
        expectedGeneration: opts.expectedGeneration,
      });

      if (guard.result === "noop") {
        alreadyAdvanced = true;
        noopReason = guard.reason;
        controlOut = control;
        return;
      }

      const activeId = guard.engagementId;
      // engData is guaranteed live + timed when proceed
      closeEngagementInTx(activeId, engRef, engData!);
      const autoAdvance = Boolean(engData!.autoAdvance) && liveEndsAt != null;
      const nextId = nextDraftId(drafts);
      const generation = control.generation + 1;

      if (autoAdvance && nextId) {
        const nextControl: EngageControlDoc = {
          generation,
          phase: "grace",
          activeEngagementId: activeId,
          reservedNextId: nextId,
          liveEndsAt: null,
          advanceAt: now + GRACE_MS,
          queueVersion: control.queueVersion + 1,
        };
        tx.set(controlRef, nextControl);
        controlOut = nextControl;
      } else {
        const nextControl: EngageControlDoc = {
          generation,
          phase: "idle",
          activeEngagementId: null,
          reservedNextId: null,
          liveEndsAt: null,
          advanceAt: null,
          queueVersion: control.queueVersion + 1,
        };
        tx.set(controlRef, nextControl);
        controlOut = nextControl;
      }
      return;
    }

    // kind === "manual" — Start next / advance from held or idle
    // Close any currently live engagement first.
    const liveSnap = await tx.get(
      db
        .collection(`engagements/${roomId}/items`)
        .where("status", "==", "live"),
    );
    for (const liveDoc of liveSnap.docs) {
      closeEngagementInTx(liveDoc.id, liveDoc.ref, liveDoc.data());
    }

    // Re-load drafts after closes (live ones were not drafts).
    const draftRows = drafts.filter(
      (d) => !liveSnap.docs.some((l) => l.id === d.id),
    );
    const nextId = nextDraftId(draftRows);
    if (!nextId) {
      const nextControl: EngageControlDoc = {
        generation: control.generation + 1,
        phase: "idle",
        activeEngagementId: null,
        reservedNextId: null,
        liveEndsAt: null,
        advanceAt: null,
        queueVersion: control.queueVersion + 1,
      };
      tx.set(controlRef, nextControl);
      controlOut = nextControl;
      return;
    }
    const draft = draftRows.find((d) => d.id === nextId)!;
    const generation = control.generation + 1;
    const { liveEndsAt } = promoteDraftInTx(draft, generation);
    const nextControl: EngageControlDoc = {
      generation,
      phase: "live",
      activeEngagementId: draft.id,
      reservedNextId: null,
      liveEndsAt,
      advanceAt: null,
      queueVersion: control.queueVersion + 1,
    };
    tx.set(controlRef, nextControl);
    controlOut = nextControl;
  });

  return {
    alreadyAdvanced,
    noopReason,
    control: controlOut,
    mirrorJobs,
    enqueueExpire,
  };
}

function logExpireNoop(params: {
  roomId: string;
  engagementId?: string | null;
  reason: ExpireNoopReason;
  uid?: string;
  liveEndsAt?: number | null;
  expectedLiveEndsAt?: number | null;
}): void {
  const level =
    params.reason === "untimed" || params.reason === "token_mismatch"
      ? "warn"
      : "info";
  const payload: Record<string, unknown> = {
    event: "engage_expire_noop",
    roomId: params.roomId,
    engagementId: params.engagementId ?? null,
    reason: params.reason,
    kind: "expire",
  };
  if (params.uid) payload.uid = params.uid;
  if (params.liveEndsAt != null && Number.isFinite(params.liveEndsAt)) {
    payload.liveEndsAt = params.liveEndsAt;
  }
  if (
    params.expectedLiveEndsAt != null &&
    Number.isFinite(params.expectedLiveEndsAt)
  ) {
    payload.expectedLiveEndsAt = params.expectedLiveEndsAt;
  }
  console[level](JSON.stringify(payload));
}

async function applyAdvanceMirrors(
  roomId: string,
  result: Awaited<ReturnType<typeof expireOrAdvanceEngagement>>,
): Promise<void> {
  await Promise.all(
    result.mirrorJobs.map((job) =>
      mirrorEngagementDoc(roomId, job.id, job.data),
    ),
  );
  await mirrorEngageControl(roomId, result.control);
  await buildAndMirrorDraftQueue(roomId);
  if (result.enqueueExpire) {
    await enqueueExpireEngagementTask({
      roomId,
      engagementId: result.enqueueExpire.engagementId,
      expectedLiveEndsAt: result.enqueueExpire.liveEndsAt,
      expectedGeneration: result.enqueueExpire.generation,
    });
  }
}

/** Close other live engagements with reveal; used by go-live / create startLive. */
async function closeLiveEngagements(
  roomId: string,
  exceptId?: string,
): Promise<void> {
  const live = await db
    .collection(`engagements/${roomId}/items`)
    .where("status", "==", "live")
    .get();
  const closedAt = Date.now();
  await Promise.all(
    live.docs
      .filter((docSnap) => docSnap.id !== exceptId)
      .map(async (docSnap) => {
        const data = docSnap.data();
        const revision = nextRevision(data);
        await docSnap.ref.update({
          status: "closed",
          closedAt,
          resultsRevealed: true,
          revision,
        });
        const next = {
          ...data,
          status: "closed",
          closedAt,
          resultsRevealed: true,
          revision,
        };
        await mirrorEngagementDoc(roomId, docSnap.id, next);
      }),
  );
}

/** Organizer creates a draft (or goes live immediately with startLive). */
export const createEngagement = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");
  await rateLimit(uid, "createEngagement");

  const ctx = await loadAccessContext(roomId, uid, email);
  if (!ctx.isOrganizer) {
    throw new HttpsError(
      "permission-denied",
      "Only the organizer can create engagements",
    );
  }

  let type: EngagementType;
  let prompt: string;
  let options: { id: string; label: string }[] = [];
  let resultsVisibility: EngagementResultsVisibility;
  let durationSec: number | null;
  let autoAdvance: boolean;
  try {
    type = assertEngagementType(request.data?.type);
    prompt = assertEngagementPrompt(request.data?.prompt);
    resultsVisibility = assertResultsVisibility(request.data?.resultsVisibility);
    durationSec = assertDurationSec(request.data?.durationSec);
    autoAdvance = assertAutoAdvance(request.data?.autoAdvance, durationSec);
    if (type === "mcq") {
      options = assertMcqOptions(request.data?.options);
    }
  } catch (err) {
    throw new HttpsError(
      "invalid-argument",
      err instanceof Error ? err.message : "Invalid engagement",
    );
  }

  const startLive = Boolean(request.data?.startLive);
  if (!startLive) {
    const draftCount = (
      await db
        .collection(`engagements/${roomId}/items`)
        .where("status", "==", "draft")
        .get()
    ).size;
    if (draftCount >= MAX_ENGAGEMENT_DRAFTS) {
      throw new HttpsError(
        "resource-exhausted",
        `At most ${MAX_ENGAGEMENT_DRAFTS} drafts per room`,
      );
    }
  }

  if (startLive) {
    await closeLiveEngagements(roomId);
  }

  const ref = db.collection(`engagements/${roomId}/items`).doc();
  const createdAt = Date.now();
  const optionCounts: Record<string, number> = {};
  for (const opt of options) optionCounts[opt.id] = 0;

  const status: EngagementStatus = startLive ? "live" : "draft";
  const liveStartedAt = startLive ? createdAt : null;
  const liveEndsAt =
    startLive && durationSec != null
      ? createdAt + durationSec * 1000
      : null;
  const doc = {
    type,
    prompt,
    options: type === "mcq" ? options : [],
    optionCounts: type === "mcq" ? optionCounts : {},
    phraseCounts: {} as Record<string, number>,
    phraseDisplay: {} as Record<string, string>,
    phrases: [] as { text: string; count: number }[],
    responseCount: 0,
    status,
    resultsVisibility,
    resultsRevealed: false,
    revision: startLive ? 1 : 0,
    sortOrder: createdAt,
    durationSec,
    autoAdvance,
    liveStartedAt,
    liveEndsAt,
    createdBy: uid,
    createdAt,
    closedAt: null as number | null,
  };
  await ref.set(doc);

  const controlRef = db.doc(`engageControl/${roomId}`);
  if (status === "live") {
    await mirrorEngagementDoc(roomId, ref.id, doc);
    const controlSnap = await controlRef.get();
    const prev = {
      ...defaultEngageControl(),
      ...(controlSnap.data() as Partial<EngageControlDoc> | undefined),
    };
    const generation = prev.generation + 1;
    await controlRef.set({
      generation,
      phase: "live" satisfies EngagePhase,
      activeEngagementId: ref.id,
      reservedNextId: null,
      liveEndsAt,
      advanceAt: null,
      queueVersion: prev.queueVersion + 1,
    });
    await mirrorEngageControl(roomId, {
      phase: "live",
      advanceAt: null,
      generation,
      activeEngagementId: ref.id,
      reservedNextId: null,
    });
    if (liveEndsAt != null) {
      await enqueueExpireEngagementTask({
        roomId,
        engagementId: ref.id,
        expectedLiveEndsAt: liveEndsAt,
        expectedGeneration: generation,
      });
    }
  } else {
    const controlSnap = await controlRef.get();
    const prev = {
      ...defaultEngageControl(),
      ...(controlSnap.data() as Partial<EngageControlDoc> | undefined),
    };
    await controlRef.set(
      { queueVersion: prev.queueVersion + 1 },
      { merge: true },
    );
    await mirrorEngageControl(roomId, prev);
  }
  await buildAndMirrorDraftQueue(roomId);
  return { engagementId: ref.id, status };
});

export const updateEngagement = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  const engagementId = String(request.data?.engagementId ?? "").trim();
  if (!roomId || !engagementId) {
    throw new HttpsError(
      "invalid-argument",
      "roomId and engagementId required",
    );
  }
  await rateLimit(uid, "updateEngagement");

  const ctx = await loadAccessContext(roomId, uid, email);
  if (!ctx.isOrganizer) {
    throw new HttpsError(
      "permission-denied",
      "Only the organizer can update engagements",
    );
  }

  const ref = db.doc(`engagements/${roomId}/items/${engagementId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Engagement not found");
  const data = snap.data()!;
  if (data.status !== "draft") {
    throw new HttpsError("failed-precondition", "Only drafts can be edited");
  }

  const patch: Record<string, unknown> = {};
  try {
    if (request.data?.prompt != null) {
      patch.prompt = assertEngagementPrompt(request.data.prompt);
    }
    if (request.data?.resultsVisibility != null) {
      patch.resultsVisibility = assertResultsVisibility(
        request.data.resultsVisibility,
      );
    }
    if (data.type === "mcq" && request.data?.options != null) {
      const options = assertMcqOptions(request.data.options);
      const optionCounts: Record<string, number> = {};
      for (const opt of options) optionCounts[opt.id] = 0;
      patch.options = options;
      patch.optionCounts = optionCounts;
    }
    if (
      request.data?.durationSec !== undefined ||
      request.data?.autoAdvance !== undefined
    ) {
      const durationSec =
        request.data?.durationSec !== undefined
          ? assertDurationSec(request.data.durationSec)
          : ((data.durationSec as number | null) ?? null);
      const autoAdvance = assertAutoAdvance(
        request.data?.autoAdvance !== undefined
          ? request.data.autoAdvance
          : data.autoAdvance,
        durationSec,
      );
      patch.durationSec = durationSec;
      patch.autoAdvance = autoAdvance;
    }
  } catch (err) {
    throw new HttpsError(
      "invalid-argument",
      err instanceof Error ? err.message : "Invalid engagement",
    );
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true as const };
  }
  await ref.update(patch);
  await buildAndMirrorDraftQueue(roomId);
  return { ok: true as const };
});

export const goLiveEngagement = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  const engagementId = String(request.data?.engagementId ?? "").trim();
  if (!roomId || !engagementId) {
    throw new HttpsError(
      "invalid-argument",
      "roomId and engagementId required",
    );
  }
  await rateLimit(uid, "goLiveEngagement");

  const ctx = await loadAccessContext(roomId, uid, email);
  if (!ctx.isOrganizer) {
    throw new HttpsError("permission-denied", "Only the organizer can go live");
  }

  const ref = db.doc(`engagements/${roomId}/items/${engagementId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Engagement not found");
  const data = snap.data()!;
  if (data.status === "live") {
    await mirrorEngagementDoc(roomId, engagementId, data);
    return { ok: true as const, alreadyLive: true };
  }
  if (data.status === "closed") {
    throw new HttpsError(
      "failed-precondition",
      "Closed engagements cannot go live",
    );
  }

  await closeLiveEngagements(roomId, engagementId);
  const now = Date.now();
  const durationSec =
    typeof data.durationSec === "number" ? data.durationSec : null;
  const liveStartedAt = now;
  const liveEndsAt =
    durationSec != null ? now + durationSec * 1000 : null;
  const revision = nextRevision(data);
  const sortOrder = engagementSortOrder(data);
  await ref.update({
    status: "live",
    closedAt: null,
    resultsRevealed: false,
    liveStartedAt,
    liveEndsAt,
    revision,
    sortOrder,
  });
  const next = {
    ...data,
    status: "live",
    closedAt: null,
    resultsRevealed: false,
    liveStartedAt,
    liveEndsAt,
    revision,
    sortOrder,
  };
  await mirrorEngagementDoc(roomId, engagementId, next);

  const controlRef = db.doc(`engageControl/${roomId}`);
  const controlSnap = await controlRef.get();
  const prev = {
    ...defaultEngageControl(),
    ...(controlSnap.data() as Partial<EngageControlDoc> | undefined),
  };
  const generation = prev.generation + 1;
  await controlRef.set({
    generation,
    phase: "live" satisfies EngagePhase,
    activeEngagementId: engagementId,
    reservedNextId: null,
    liveEndsAt,
    advanceAt: null,
    queueVersion: prev.queueVersion + 1,
  });
  await mirrorEngageControl(roomId, {
    phase: "live",
    advanceAt: null,
    generation,
    activeEngagementId: engagementId,
    reservedNextId: null,
  });
  if (liveEndsAt != null) {
    await enqueueExpireEngagementTask({
      roomId,
      engagementId,
      expectedLiveEndsAt: liveEndsAt,
      expectedGeneration: generation,
    });
  }
  await buildAndMirrorDraftQueue(roomId);
  return { ok: true as const };
});

export const closeEngagement = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  const engagementId = String(request.data?.engagementId ?? "").trim();
  if (!roomId || !engagementId) {
    throw new HttpsError(
      "invalid-argument",
      "roomId and engagementId required",
    );
  }
  await rateLimit(uid, "closeEngagement");

  const ctx = await loadAccessContext(roomId, uid, email);
  if (!ctx.isOrganizer) {
    throw new HttpsError(
      "permission-denied",
      "Only the organizer can close engagements",
    );
  }

  const ref = db.doc(`engagements/${roomId}/items/${engagementId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Engagement not found");
  const data = snap.data()!;
  if (data.status === "draft") {
    throw new HttpsError(
      "failed-precondition",
      "Drafts cannot be closed; delete instead",
    );
  }

  const closedAt =
    data.status === "closed" && data.closedAt
      ? Number(data.closedAt)
      : Date.now();
  const revision =
    data.status === "closed" && data.resultsRevealed
      ? Number(data.revision ?? 0)
      : nextRevision(data);
  const next = {
    ...data,
    status: "closed" as const,
    resultsRevealed: true,
    closedAt,
    revision,
  };
  if (data.status !== "closed" || !data.resultsRevealed) {
    await ref.update({
      status: "closed",
      resultsRevealed: true,
      closedAt,
      revision,
    });
  }
  // Re-mirror even if already closed (repair); clears private node.
  await mirrorEngagementLifecycle(
    roomId,
    engagementId,
    engagementMirrorPayload(next),
    null,
  );

  const controlRef = db.doc(`engageControl/${roomId}`);
  const controlSnap = await controlRef.get();
  const prev = {
    ...defaultEngageControl(),
    ...(controlSnap.data() as Partial<EngageControlDoc> | undefined),
  };
  await controlRef.set({
    ...prev,
    phase: "idle" satisfies EngagePhase,
    activeEngagementId: null,
    reservedNextId: null,
    liveEndsAt: null,
    advanceAt: null,
  });
  await mirrorEngageControl(roomId, {
    phase: "idle",
    advanceAt: null,
    generation: prev.generation,
    activeEngagementId: null,
    reservedNextId: null,
  });

  return {
    ok: true as const,
    alreadyClosed: data.status === "closed",
  };
});

export const revealEngagementResults = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  const engagementId = String(request.data?.engagementId ?? "").trim();
  if (!roomId || !engagementId) {
    throw new HttpsError(
      "invalid-argument",
      "roomId and engagementId required",
    );
  }
  await rateLimit(uid, "revealEngagement");

  const ctx = await loadAccessContext(roomId, uid, email);
  if (!ctx.isOrganizer) {
    throw new HttpsError(
      "permission-denied",
      "Only the organizer can reveal results",
    );
  }

  const ref = db.doc(`engagements/${roomId}/items/${engagementId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Engagement not found");
  const data = snap.data()!;
  if (data.status !== "live") {
    throw new HttpsError(
      "failed-precondition",
      "Only live engagements can reveal results",
    );
  }

  const alreadyRevealed = Boolean(data.resultsRevealed);
  const revision = alreadyRevealed
    ? Number(data.revision ?? 0)
    : nextRevision(data);
  if (!alreadyRevealed) {
    await ref.update({ resultsRevealed: true, revision });
  }
  const next = { ...data, resultsRevealed: true, revision };
  await mirrorEngagementLifecycle(
    roomId,
    engagementId,
    engagementMirrorPayload(next),
    null,
  );
  return { ok: true as const, alreadyRevealed };
});

export const deleteEngagement = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  const engagementId = String(request.data?.engagementId ?? "").trim();
  if (!roomId || !engagementId) {
    throw new HttpsError(
      "invalid-argument",
      "roomId and engagementId required",
    );
  }
  await rateLimit(uid, "deleteEngagement");

  const ctx = await loadAccessContext(roomId, uid, email);
  if (!ctx.isOrganizer) {
    throw new HttpsError(
      "permission-denied",
      "Only the organizer can delete engagements",
    );
  }

  const ref = db.doc(`engagements/${roomId}/items/${engagementId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Engagement not found");

  const responders = await db
    .collection(`engagementResponses/${roomId}/items/${engagementId}/users`)
    .get();
  await deleteQueryInBatches(
    db.collection(`engagementResponses/${roomId}/items/${engagementId}/users`),
  );
  await ref.delete();
  await removeMirroredEngagement(roomId, engagementId);
  await Promise.all(
    responders.docs.map((d) =>
      clearUserEngagementResponse(d.id, roomId, engagementId),
    ),
  );

  const controlRef = db.doc(`engageControl/${roomId}`);
  const controlSnap = await controlRef.get();
  const prev = {
    ...defaultEngageControl(),
    ...(controlSnap.data() as Partial<EngageControlDoc> | undefined),
  };
  await controlRef.set(
    { queueVersion: prev.queueVersion + 1 },
    { merge: true },
  );
  await mirrorEngageControl(roomId, prev);
  await buildAndMirrorDraftQueue(roomId);
  return { ok: true as const };
});

export const listEngagements = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");
  await rateLimit(uid, "listEngagements");

  const ctx = await loadAccessContext(roomId, uid, email);
  if (!ctx.isOrganizer) {
    throw new HttpsError(
      "permission-denied",
      "Only the organizer can list all engagements",
    );
  }

  const snap = await db.collection(`engagements/${roomId}/items`).get();
  const engagements = snap.docs
    .map((d) => serializeEngagementDoc(d.id, d.data()))
    .sort((a, b) => {
      const rank = (s: EngagementStatus) =>
        s === "live" ? 0 : s === "draft" ? 1 : 2;
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      if (a.status === "draft" && b.status === "draft") {
        return (
          a.sortOrder - b.sortOrder ||
          a.createdAt - b.createdAt ||
          a.id.localeCompare(b.id)
        );
      }
      if (a.status === "closed" && b.status === "closed") {
        return (b.closedAt ?? 0) - (a.closedAt ?? 0);
      }
      return b.createdAt - a.createdAt;
    });
  return { engagements };
});

export const exportEngagements = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");
  await rateLimit(uid, "exportEngagements");

  const ctx = await loadAccessContext(roomId, uid, email);
  if (!ctx.isOrganizer) {
    throw new HttpsError(
      "permission-denied",
      "Only the organizer can export engagements",
    );
  }

  const engagementIdFilter = String(request.data?.engagementId ?? "").trim();
  let engDocs: FirebaseFirestore.QueryDocumentSnapshot[];
  if (engagementIdFilter) {
    const one = await db
      .doc(`engagements/${roomId}/items/${engagementIdFilter}`)
      .get();
    if (!one.exists) throw new HttpsError("not-found", "Engagement not found");
    engDocs = [one as FirebaseFirestore.QueryDocumentSnapshot];
  } else {
    const snap = await db.collection(`engagements/${roomId}/items`).get();
    engDocs = snap.docs;
  }

  const anonymous = Boolean(ctx.room.anonymous);
  const engagements = [];

  for (const engDoc of engDocs) {
    const data = engDoc.data();
    const responsesSnap = await db
      .collection(`engagementResponses/${roomId}/items/${engDoc.id}/users`)
      .get();
    const responses = responsesSnap.docs.map((r) => {
      const rd = r.data();
      return {
        respondentLabel: anonymous ? "Anonymous" : r.id,
        optionId: (rd.optionId as string | undefined) ?? null,
        text: (rd.text as string | undefined) ?? null,
        createdAt: Number(rd.createdAt ?? 0),
        updatedAt: Number(rd.updatedAt ?? rd.createdAt ?? 0),
      };
    });
    engagements.push({
      ...serializeEngagementDoc(engDoc.id, data),
      responses,
    });
  }

  engagements.sort((a, b) => b.createdAt - a.createdAt);
  return { engagements };
});

export const respondToEngagement = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  const engagementId = String(request.data?.engagementId ?? "").trim();
  if (!roomId || !engagementId) {
    throw new HttpsError(
      "invalid-argument",
      "roomId and engagementId required",
    );
  }
  await rateLimit(uid, "respondEngagement");

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

  const engRef = db.doc(`engagements/${roomId}/items/${engagementId}`);

  // Lazy overdue close before taking a response.
  const preSnap = await engRef.get();
  if (preSnap.exists) {
    const pre = preSnap.data()!;
    const liveEndsAt = pre.liveEndsAt as number | null;
    if (
      pre.status === "live" &&
      liveEndsAt != null &&
      Date.now() >= liveEndsAt
    ) {
      const result = await expireOrAdvanceEngagement(roomId, {
        kind: "expire",
        expectedLiveEndsAt: liveEndsAt,
        fromEngagementId: engagementId,
      });
      await applyAdvanceMirrors(roomId, result);
      throw new HttpsError(
        "failed-precondition",
        "This engagement has ended",
      );
    }
  }

  const responseRef = db.doc(
    `engagementResponses/${roomId}/items/${engagementId}/users/${uid}`,
  );

  const mirrorState: {
    eng: FirebaseFirestore.DocumentData | null;
    response: { optionId?: string; text?: string };
    responseCount: number;
  } = { eng: null, response: {}, responseCount: 0 };

  await db.runTransaction(async (tx) => {
    const engSnap = await tx.get(engRef);
    if (!engSnap.exists) {
      throw new HttpsError("not-found", "Engagement not found");
    }
    const eng = engSnap.data()!;
    if (eng.status !== "live") {
      throw new HttpsError(
        "failed-precondition",
        "This engagement is not live",
      );
    }
    const liveEndsAt = eng.liveEndsAt as number | null;
    if (liveEndsAt != null && Date.now() >= liveEndsAt) {
      throw new HttpsError(
        "failed-precondition",
        "This engagement has ended",
      );
    }

    const type = eng.type as EngagementType;
    const prevSnap = await tx.get(responseRef);
    if (prevSnap.exists) {
      throw new HttpsError("failed-precondition", "Already answered");
    }

    let optionCounts = {
      ...((eng.optionCounts as Record<string, number>) ?? {}),
    };
    let phraseCounts = {
      ...((eng.phraseCounts as Record<string, number>) ?? {}),
    };
    let phraseDisplay = {
      ...((eng.phraseDisplay as Record<string, string>) ?? {}),
    };
    let responseCount = Number(eng.responseCount ?? 0);
    let phrases = (eng.phrases as { text: string; count: number }[]) ?? [];

    if (type === "mcq") {
      const optionId = String(request.data?.optionId ?? "").trim();
      const options = (eng.options as { id: string; label: string }[]) ?? [];
      if (!options.some((o) => o.id === optionId)) {
        throw new HttpsError("invalid-argument", "Invalid option");
      }
      responseCount += 1;
      optionCounts[optionId] = Number(optionCounts[optionId] ?? 0) + 1;
      const now = Date.now();
      tx.set(responseRef, {
        uid,
        optionId,
        createdAt: now,
        updatedAt: now,
      });
      mirrorState.response = { optionId };
      tx.update(engRef, { optionCounts, responseCount });
      mirrorState.eng = { ...eng, optionCounts, responseCount };
    } else {
      let parsed: { text: string; phrase: string };
      try {
        parsed = assertOpenResponse(request.data?.text);
      } catch (err) {
        throw new HttpsError(
          "invalid-argument",
          err instanceof Error ? err.message : "Invalid response",
        );
      }
      responseCount += 1;
      phraseCounts[parsed.phrase] = Number(phraseCounts[parsed.phrase] ?? 0) + 1;
      if (!phraseDisplay[parsed.phrase]) {
        phraseDisplay[parsed.phrase] = parsed.text;
      }
      phrases = topPhrasesFromMap(phraseCounts, phraseDisplay);
      const now = Date.now();
      tx.set(responseRef, {
        uid,
        text: parsed.text,
        phrase: parsed.phrase,
        createdAt: now,
        updatedAt: now,
      });
      mirrorState.response = { text: parsed.text };
      tx.update(engRef, {
        phraseCounts,
        phraseDisplay,
        phrases,
        responseCount,
      });
      mirrorState.eng = {
        ...eng,
        phraseCounts,
        phraseDisplay,
        phrases,
        responseCount,
      };
    }
    mirrorState.responseCount = responseCount;
  });

  if (mirrorState.eng) {
    const mirroredEng = mirrorState.eng;
    const visibility = String(mirroredEng.resultsVisibility ?? "live");
    const status = String(mirroredEng.status ?? "live");
    const revealed = Boolean(mirroredEng.resultsRevealed);
    const type = mirroredEng.type as EngagementType;
    const tallies: Record<string, unknown> =
      type === "mcq"
        ? { optionCounts: mirroredEng.optionCounts ?? {} }
        : { phrases: mirroredEng.phrases ?? [] };
    const publicTallies = shouldPublicTallies(visibility, status, revealed)
      ? tallies
      : null;
    const privateTallies = shouldWritePrivateTallies(
      visibility,
      status,
      revealed,
    )
      ? tallies
      : null;
    await mirrorEngagementResponseUpdate(roomId, engagementId, uid, {
      responseCount: mirrorState.responseCount,
      publicTallies,
      privateTallies,
      userResponse: mirrorState.response,
    });
  }
  return { ok: true as const };
});

export const swapEngagementOrder = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  const aId = String(request.data?.aId ?? "").trim();
  const bId = String(request.data?.bId ?? "").trim();
  const aOrder = Number(request.data?.aOrder);
  const bOrder = Number(request.data?.bOrder);
  if (!roomId || !aId || !bId) {
    throw new HttpsError(
      "invalid-argument",
      "roomId, aId, and bId required",
    );
  }
  if (!Number.isFinite(aOrder) || !Number.isFinite(bOrder)) {
    throw new HttpsError("invalid-argument", "aOrder and bOrder required");
  }
  await rateLimit(uid, "swapEngagementOrder");

  const ctx = await loadAccessContext(roomId, uid, email);
  if (!ctx.isOrganizer) {
    throw new HttpsError(
      "permission-denied",
      "Only the organizer can reorder engagements",
    );
  }

  const aRef = db.doc(`engagements/${roomId}/items/${aId}`);
  const bRef = db.doc(`engagements/${roomId}/items/${bId}`);

  await db.runTransaction(async (tx) => {
    const [aSnap, bSnap] = await Promise.all([tx.get(aRef), tx.get(bRef)]);
    if (!aSnap.exists || !bSnap.exists) {
      throw new HttpsError("not-found", "Engagement not found");
    }
    const aData = aSnap.data()!;
    const bData = bSnap.data()!;
    if (aData.status !== "draft" || bData.status !== "draft") {
      throw new HttpsError(
        "failed-precondition",
        "Only drafts can be reordered",
      );
    }
    const curA = engagementSortOrder(aData);
    const curB = engagementSortOrder(bData);
    if (curA !== aOrder || curB !== bOrder) {
      throw new HttpsError(
        "aborted",
        "Order changed; reload and try again",
      );
    }
    tx.update(aRef, { sortOrder: bOrder });
    tx.update(bRef, { sortOrder: aOrder });
  });

  const controlRef = db.doc(`engageControl/${roomId}`);
  const controlSnap = await controlRef.get();
  const prev = {
    ...defaultEngageControl(),
    ...(controlSnap.data() as Partial<EngageControlDoc> | undefined),
  };
  await controlRef.set(
    { queueVersion: prev.queueVersion + 1 },
    { merge: true },
  );
  await mirrorEngageControl(roomId, prev);
  await buildAndMirrorDraftQueue(roomId);
  return { ok: true as const };
});

export const advanceEngagement = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");
  await rateLimit(uid, "advanceEngagement");

  const expectedLiveEndsAt =
    request.data?.expectedLiveEndsAt != null
      ? Number(request.data.expectedLiveEndsAt)
      : null;
  const expectedGeneration =
    request.data?.expectedGeneration != null
      ? Number(request.data.expectedGeneration)
      : undefined;
  const fromEngagementId = String(request.data?.fromEngagementId ?? "").trim();
  const completeGrace = Boolean(request.data?.completeGrace);

  const ctx = await loadAccessContext(roomId, uid, email);
  const isExpirePath = expectedLiveEndsAt != null && !completeGrace;
  const isGraceComplete = completeGrace;

  if (isExpirePath || isGraceComplete) {
    const decision = canAccessRoom({
      accessMode: ctx.accessMode,
      isOrganizer: ctx.isOrganizer,
      onAllowlist: ctx.onAllowlist,
      isMember: ctx.isMember,
    });
    if (!decision.allowed && !ctx.isOrganizer) {
      throw new HttpsError("permission-denied", "No access to this room");
    }
  } else if (!ctx.isOrganizer) {
    throw new HttpsError(
      "permission-denied",
      "Only the organizer can advance engagements",
    );
  }

  let kind: "manual" | "expire" | "completeGrace" = "manual";
  if (isGraceComplete) kind = "completeGrace";
  else if (isExpirePath) kind = "expire";

  // If grace window elapsed and host calls without completeGrace flag, promote.
  if (kind === "manual" && ctx.isOrganizer) {
    const controlSnap = await db.doc(`engageControl/${roomId}`).get();
    const control = {
      ...defaultEngageControl(),
      ...(controlSnap.data() as Partial<EngageControlDoc> | undefined),
    };
    if (
      control.phase === "grace" &&
      control.advanceAt != null &&
      Date.now() >= control.advanceAt
    ) {
      kind = "completeGrace";
    }
  }

  const result = await expireOrAdvanceEngagement(roomId, {
    kind,
    expectedLiveEndsAt,
    expectedGeneration,
    fromEngagementId: fromEngagementId || undefined,
  });
  if (result.alreadyAdvanced && result.noopReason && kind === "expire") {
    logExpireNoop({
      roomId,
      engagementId: fromEngagementId || result.control.activeEngagementId,
      reason: result.noopReason,
      uid,
      expectedLiveEndsAt,
      liveEndsAt: result.control.liveEndsAt,
    });
  }
  await applyAdvanceMirrors(roomId, result);
  return {
    ok: true as const,
    alreadyAdvanced: result.alreadyAdvanced,
    phase: result.control.phase,
    activeEngagementId: result.control.activeEngagementId,
    generation: result.control.generation,
    advanceAt: result.control.advanceAt,
    reservedNextId: result.control.reservedNextId,
  };
});

export const cancelNextEngagement = onCall(async (request) => {
  const { uid, email } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");
  await rateLimit(uid, "cancelNextEngagement");

  const ctx = await loadAccessContext(roomId, uid, email);
  if (!ctx.isOrganizer) {
    throw new HttpsError(
      "permission-denied",
      "Only the organizer can cancel next",
    );
  }

  const controlRef = db.doc(`engageControl/${roomId}`);
  let phaseOut: EngagePhase = "idle";
  let controlOut: EngageControlDoc = defaultEngageControl();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(controlRef);
    const control: EngageControlDoc = {
      ...defaultEngageControl(),
      ...(snap.data() as Partial<EngageControlDoc> | undefined),
    };
    if (control.phase !== "grace") {
      phaseOut = control.phase;
      controlOut = control;
      return;
    }
    const next: EngageControlDoc = {
      ...control,
      phase: "held",
      advanceAt: null,
    };
    tx.set(controlRef, next);
    phaseOut = "held";
    controlOut = next;
  });
  await mirrorEngageControl(roomId, controlOut);
  return { ok: true as const, phase: phaseOut };
});

/** Cloud Tasks backstop for timed engagements. */
export const expireEngagementTask = onTaskDispatched(
  {
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 10 },
    rateLimits: { maxConcurrentDispatches: 10 },
  },
  async (request) => {
    const roomId = String(request.data?.roomId ?? "").trim();
    if (!roomId) {
      console.warn("expireEngagementTask missing roomId", request.data);
      return;
    }

    const expectedGeneration = Number(request.data?.expectedGeneration);
    const generationOpt = Number.isFinite(expectedGeneration)
      ? expectedGeneration
      : undefined;

    if (request.data?.completeGrace) {
      const graceResult = await expireOrAdvanceEngagement(roomId, {
        kind: "completeGrace",
        expectedGeneration: generationOpt,
      });
      await applyAdvanceMirrors(roomId, graceResult);
      return;
    }

    const engagementId = String(request.data?.engagementId ?? "").trim();
    const expectedLiveEndsAt = Number(request.data?.expectedLiveEndsAt);
    if (!engagementId || !Number.isFinite(expectedLiveEndsAt)) {
      console.warn("expireEngagementTask missing fields", request.data);
      return;
    }
    const result = await expireOrAdvanceEngagement(roomId, {
      kind: "expire",
      expectedLiveEndsAt,
      expectedGeneration: generationOpt,
      fromEngagementId: engagementId,
    });
    if (result.alreadyAdvanced && result.noopReason) {
      logExpireNoop({
        roomId,
        engagementId,
        reason: result.noopReason,
        expectedLiveEndsAt,
        liveEndsAt: result.control.liveEndsAt,
      });
    }
    await applyAdvanceMirrors(roomId, result);

    // If entered grace, enqueue a follow-up to complete auto-advance.
    if (
      result.control.phase === "grace" &&
      result.control.advanceAt != null
    ) {
      try {
        const queue = getFunctions().taskQueue<{
          roomId: string;
          expectedGeneration: number;
          completeGrace: boolean;
        }>("locations/asia-southeast1/functions/expireEngagementTask");
        await queue.enqueue(
          {
            roomId,
            expectedGeneration: result.control.generation,
            completeGrace: true,
          },
          {
            scheduleTime: new Date(result.control.advanceAt),
            id: `grace-${roomId}-${result.control.generation}-${result.control.advanceAt}`,
          },
        );
      } catch (err) {
        console.error("Failed to enqueue grace completion task", err);
      }
    }
  },
);


/** Organizer permanently deletes a room and related Firestore/RTDB data. */
export const deleteRoom = onCall(async (request) => {
  const { uid } = requireAuth(request);
  const roomId = String(request.data?.roomId ?? "").trim();
  if (!roomId) throw new HttpsError("invalid-argument", "roomId required");

  const roomRef = db.doc(`rooms/${roomId}`);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found");
  const room = roomSnap.data()!;
  const isOwner = room.organizerId === uid;
  if (!isOwner && !(await isAdminUid(uid))) {
    throw new HttpsError(
      "permission-denied",
      "Only the room organizer or super admin can delete this room",
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

  const engagementSnaps = await db
    .collection(`engagements/${roomId}/items`)
    .get();
  for (const engDoc of engagementSnaps.docs) {
    await deleteQueryInBatches(
      db.collection(
        `engagementResponses/${roomId}/items/${engDoc.id}/users`,
      ),
    );
  }
  await deleteQueryInBatches(db.collection(`engagements/${roomId}/items`));

  try {
    await db.doc(`engageControl/${roomId}`).delete();
  } catch {
    // may not exist
  }

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
