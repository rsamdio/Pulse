"use client";

import { useEffect, useState } from "react";
import { onValue, ref, type Unsubscribe } from "firebase/database";
import { getRtdb } from "@/lib/firebase/client";
import type { RoomMetaRtdb, QuestionView } from "@/lib/types";
import { sortQuestions } from "@/lib/utils";

export type RoomListenPhase = "pending" | "allowed" | "denied";

/**
 * Live room board from RTDB.
 * `phase`:
 * - pending: subscribe early (public / existing access); permission errors are soft
 * - allowed: subscribe; permission errors are fatal
 * - denied: no listeners
 */
export function useRoom(
  roomId: string | undefined,
  uid: string | undefined,
  phase: RoomListenPhase = "allowed",
) {
  const [meta, setMeta] = useState<RoomMetaRtdb | null>(null);
  const [questions, setQuestions] = useState<QuestionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId || !uid || phase === "denied") {
      setMeta(null);
      setQuestions([]);
      setLoading(phase === "pending");
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const db = getRtdb();
    const unsubs: Unsubscribe[] = [];

    let metaData: RoomMetaRtdb | null = null;
    let questionMap: Record<string, QuestionView> = {};
    let voteMap: Record<string, boolean> = {};
    let metaReady = false;
    let questionsReady = false;
    let votesReady = false;
    let publishScheduled = false;

    const publishNow = () => {
      const list = Object.values(questionMap).map((q) => ({
        ...q,
        hasVoted: Boolean(voteMap[q.id]),
      }));
      setQuestions(sortQuestions(list));
      setMeta(metaData);
      if (metaReady && questionsReady && votesReady) {
        setLoading(false);
      }
    };

    const schedulePublish = () => {
      if (publishScheduled) return;
      publishScheduled = true;
      queueMicrotask(() => {
        publishScheduled = false;
        publishNow();
      });
    };

    const onListenError = (err: Error) => {
      if (phase === "pending") {
        // Likely private room before membership grant; wait for access phase.
        return;
      }
      setError(err.message);
      setLoading(false);
    };

    unsubs.push(
      onValue(
        ref(db, `rooms/${roomId}/meta`),
        (snap) => {
          metaData = snap.exists() ? (snap.val() as RoomMetaRtdb) : null;
          metaReady = true;
          schedulePublish();
        },
        onListenError,
      ),
    );

    unsubs.push(
      onValue(
        ref(db, `rooms/${roomId}/questions`),
        (snap) => {
          const val = snap.val() as Record<
            string,
            Omit<QuestionView, "id" | "hasVoted">
          > | null;
          questionMap = {};
          if (val) {
            for (const [id, q] of Object.entries(val)) {
              questionMap[id] = {
                id,
                ...q,
                question: (q.question || q.text || "").trim(),
                details: (q.details || "").trim(),
                answered: Boolean(q.answered),
                answeredAt: q.answeredAt ?? null,
              };
            }
          }
          questionsReady = true;
          schedulePublish();
        },
        onListenError,
      ),
    );

    unsubs.push(
      onValue(
        ref(db, `userVotes/${uid}/${roomId}`),
        (snap) => {
          voteMap = (snap.val() as Record<string, boolean> | null) ?? {};
          votesReady = true;
          schedulePublish();
        },
        onListenError,
      ),
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [roomId, uid, phase]);

  return { meta, questions, loading, error };
}

export function useMyRoomAccessIndex(uid: string | undefined) {
  const [accessIds, setAccessIds] = useState<string[]>([]);
  const [publicIndex, setPublicIndex] = useState<
    Record<string, { title: string; createdAt: number }>
  >({});

  useEffect(() => {
    if (!uid) {
      setAccessIds([]);
      return;
    }
    const db = getRtdb();
    const unsubAccess = onValue(ref(db, `access/${uid}`), (snap) => {
      const val = snap.val() as Record<string, boolean> | null;
      setAccessIds(val ? Object.keys(val).filter((id) => val[id]) : []);
    });
    const unsubPublic = onValue(ref(db, "publicRoomIndex"), (snap) => {
      setPublicIndex(
        (snap.val() as Record<
          string,
          { title: string; createdAt: number }
        > | null) ?? {},
      );
    });
    return () => {
      unsubAccess();
      unsubPublic();
    };
  }, [uid]);

  return { accessIds, publicIndex };
}
