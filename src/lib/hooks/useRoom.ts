"use client";

import { useEffect, useState } from "react";
import { onValue, ref, type Unsubscribe } from "firebase/database";
import { getRtdb } from "@/lib/firebase/client";
import type { RoomMetaRtdb, QuestionView } from "@/lib/types";
import { sortQuestions } from "@/lib/utils";

export function useRoom(roomId: string | undefined, uid: string | undefined) {
  const [meta, setMeta] = useState<RoomMetaRtdb | null>(null);
  const [questions, setQuestions] = useState<QuestionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId || !uid) {
      setMeta(null);
      setQuestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const db = getRtdb();
    const unsubs: Unsubscribe[] = [];

    let metaData: RoomMetaRtdb | null = null;
    let questionMap: Record<string, QuestionView> = {};
    let voteMap: Record<string, boolean> = {};

    const publish = () => {
      const list = Object.values(questionMap).map((q) => ({
        ...q,
        hasVoted: Boolean(voteMap[q.id]),
      }));
      setQuestions(sortQuestions(list));
      setMeta(metaData);
      setLoading(false);
    };

    unsubs.push(
      onValue(
        ref(db, `rooms/${roomId}/meta`),
        (snap) => {
          metaData = snap.exists() ? (snap.val() as RoomMetaRtdb) : null;
          publish();
        },
        (err) => {
          setError(err.message);
          setLoading(false);
        },
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
          publish();
        },
        (err) => {
          setError(err.message);
          setLoading(false);
        },
      ),
    );

    unsubs.push(
      onValue(
        ref(db, `userVotes/${uid}/${roomId}`),
        (snap) => {
          voteMap = (snap.val() as Record<string, boolean> | null) ?? {};
          publish();
        },
        (err) => {
          setError(err.message);
          setLoading(false);
        },
      ),
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [roomId, uid]);

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
      setAccessIds(val ? Object.keys(val) : []);
    });
    const unsubPublic = onValue(ref(db, "publicRoomIndex"), (snap) => {
      setPublicIndex(
        (snap.val() as Record<string, { title: string; createdAt: number }>) ??
          {},
      );
    });
    return () => {
      unsubAccess();
      unsubPublic();
    };
  }, [uid]);

  return { accessIds, publicIndex };
}
